import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { alcoveConfig, buildSearchCriteria } from "../../../alcove.config.mjs";
import { runSearch } from "../../../scripts/search/engine.mjs";
import { compactToApartmentInput } from "../../../scripts/search/to-apartment.mjs";
import { api } from "../../../convex/_generated/api";

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
  import?: boolean;
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
  if (body.city || body.region || body.country) {
    criteria.location = {
      ...criteria.location,
      city: body.city ?? criteria.location?.city,
      region: body.region ?? criteria.location?.region,
      country: body.country ?? criteria.location?.country,
    };
  }

  let aiEnrich;
  if (body.ai) {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "AI search requires ANTHROPIC_API_KEY on the server." },
        { status: 400 },
      );
    }
    const { createAiEnricher } = await import("../../../scripts/search/ai/enrich.mjs");
    aiEnrich = createAiEnricher(alcoveConfig);
  }

  const result = await runSearch(criteria, { aiEnrich });

  const shouldImport = body.import !== false;
  if (!shouldImport) {
    return NextResponse.json({
      count: result.listings.length,
      summary: result.summary,
      sourcesSearched: result.sourcesSearched,
      blindSpots: result.blindSpots,
      listings: result.listings,
    });
  }

  const client = new ConvexHttpClient(convexUrl);
  const searchRunId = await client.mutation(api.searchRuns.create, {
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
  });
}

function clean<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
