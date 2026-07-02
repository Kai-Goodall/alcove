import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { alcoveConfig, buildSearchCriteria } from "../../../alcove.config.mjs";
import { runSearch } from "../../../scripts/search/engine.mjs";
import { resolveLocation } from "../../../scripts/search/geo.mjs";
import { compactToApartmentInput } from "../../../scripts/search/to-apartment.mjs";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// Scraping + geocoding need the Node runtime and can run for a while.
export const runtime = "nodejs";
export const maxDuration = 300;

type SearchBody = {
  city?: string;
  region?: string;
  country?: string;
  minBedrooms?: number;
  maxBedrooms?: number;
  minPrice?: number;
  maxPrice?: number;
  currency?: string;
  near?: string | null;
  radiusKm?: number;
  sources?: string[];
  ai?: boolean;
  /** Anthropic key for AI deep search; overrides the server env key. */
  apiKey?: string;
  import?: boolean;
};

type AddedListing = {
  name?: string;
  url?: string;
  provider?: string;
  price?: number;
  priceCurrency?: string;
};

export async function POST(request: Request) {
  const convexUrl =
    process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json(
      { error: "Convex URL not configured (NEXT_PUBLIC_CONVEX_URL)." },
      { status: 500 },
    );
  }

  let body: SearchBody;
  try {
    body = (await request.json()) as SearchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const overrides = clean({
    minBedrooms: body.minBedrooms,
    maxBedrooms: body.maxBedrooms,
    minPrice: body.minPrice,
    maxPrice: body.maxPrice,
    currency: body.currency,
    radiusKm: body.radiusKm,
    sources: body.sources,
    near:
      body.near === undefined
        ? undefined
        : body.near
          ? { label: body.near, query: body.near }
          : null,
  });

  const criteria = buildSearchCriteria(overrides);

  let aiEnrich;
  if (body.ai) {
    const apiKey = body.apiKey?.trim() || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "AI deep search needs an Anthropic API key — paste one in the dialog or set ANTHROPIC_API_KEY on the server.",
        },
        { status: 401 },
      );
    }
    const { createAiEnricher } = await import("../../../scripts/search/ai/enrich.mjs");
    aiEnrich = createAiEnricher(alcoveConfig, { apiKey });
  }

  const client = new ConvexHttpClient(convexUrl);
  let searchRunId: Id<"searchRuns"> | null = null;

  try {
    // A typed city may be in a different region/country than the configured
    // profile (e.g. config says New York, user types "Waterloo"). Geocode it
    // once so country-gated adapters (Kijiji, Zillow, …) resolve correctly.
    criteria.location = (await resolveLocation(
      { city: body.city, region: body.region, country: body.country },
      criteria.location,
      { contact: criteria.geocodeContact, anchorQuery: criteria.near?.query },
    )) as typeof criteria.location;

    const result = await runSearch(criteria, { aiEnrich });
    const added: AddedListing[] = result.listings.map((listing: Record<string, unknown>) => ({
      name: listing.name as string | undefined,
      url: listing.url as string | undefined,
      provider: listing.provider as string | undefined,
      price: listing.price as number | undefined,
      priceCurrency: listing.priceCurrency as string | undefined,
    }));

    const shouldImport = body.import !== false;
    if (!shouldImport) {
      return NextResponse.json({
        count: result.listings.length,
        summary: result.summary,
        sourcesSearched: result.sourcesSearched,
        blindSpots: result.blindSpots,
        added,
        listings: result.listings,
      });
    }

    searchRunId = await client.mutation(api.searchRuns.create, {
      notes: `In-app ${body.ai ? "AI-assisted " : ""}search (${criteria.location?.city ?? "area"}).`,
    });

    let upserted = 0;
    let imagesAttached = 0;
    for (const listing of result.listings) {
      const apartment = compactToApartmentInput(listing, { searchRunId });
      const apartmentId = await client.mutation(api.apartments.upsert, { apartment });
      upserted += 1;

      const imageUrls: string[] = (listing.imageUrls ?? []).slice(0, 6);
      for (let i = 0; i < imageUrls.length; i += 1) {
        try {
          await client.mutation(api.images.attachExternal, {
            apartmentId,
            contentUrl: imageUrls[i],
            kind: "photo",
            sourceUrl: listing.url,
            order: i,
            image: { representativeOfPage: i === 0 },
          });
          imagesAttached += 1;
        } catch {
          // Non-fatal: skip an image that fails to attach.
        }
      }
    }

    await client.mutation(api.searchRuns.finish, {
      id: searchRunId,
      status: "completed",
      summary: result.summary,
      sourcesSearched: result.sourcesSearched,
      blindSpots: result.blindSpots,
    });

    return NextResponse.json({
      count: upserted,
      imagesAttached,
      summary: result.summary,
      sourcesSearched: result.sourcesSearched,
      blindSpots: result.blindSpots,
      added,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed.";
    // Don't leave a run stuck in "running" if the import blew up midway.
    if (searchRunId) {
      try {
        await client.mutation(api.searchRuns.finish, {
          id: searchRunId,
          status: "failed",
          summary: message,
        });
      } catch {
        // Best effort.
      }
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function clean<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
