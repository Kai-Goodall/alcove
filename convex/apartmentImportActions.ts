"use node";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { v } from "convex/values";
import * as z from "zod/v4";
import { api, internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";

type Track = "1br" | "2br" | "3br" | "unknown";
type ApartmentStatus = "shortlist" | "monitor" | "excluded" | "archived";
type Confidence = "high" | "medium" | "low" | "blocked" | "unknown";
type YesNoUnknown = "yes" | "no" | "unknown";
type Freshness =
  | "verified_live"
  | "availability_page_only"
  | "stale_or_mismatch"
  | "unverified";
type ImageKind = "photo" | "floor_plan" | "building" | "other";

type CompactListing = {
  url: string;
  key?: string;
  sourceKey?: string;
  provider?: string;
  name?: string;
  addressLink?: string;
  description?: string;
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  unit?: string;
  neighborhood?: string;
  status?: ApartmentStatus;
  track?: Track;
  rank?: number;
  score?: number;
  price?: number;
  priceMin?: number;
  priceMax?: number;
  priceDisplay?: string;
  priceCurrency?: string;
  bedrooms?: number;
  bathrooms?: number;
  fullBathrooms?: number;
  partialBathrooms?: number;
  squareFeet?: number;
  squareFeetMin?: number;
  squareFeetMax?: number;
  floorLevel?: string;
  rooms?: number;
  layout?: string;
  areaDisplay?: string;
  availability?: string;
  availabilityStarts?: string;
  availabilityDisplay?: string;
  freshness?: Freshness;
  verificationNote?: string;
  commute?: {
    minutes?: number;
    route?: string;
    notes?: string;
  };
  amenities?: string[];
  laundry?: YesNoUnknown;
  dishwasher?: YesNoUnknown;
  petsAllowed?: boolean;
  tourUrl?: string;
  mustHaveEvidence?: string;
  daylight?: string;
  kitchen?: string;
  bathroom?: string;
  floorPlan?: string;
  furnitureFit?: string;
  photoConfidence?: Confidence;
  floorPlanConfidence?: Confidence;
  caveats?: string[];
  rejectionReasons?: string[];
  notes?: string;
  rawNotes?: string;
  tags?: string[];
};

type ImageCandidate = {
  url: string;
  referer?: string;
  kind?: ImageKind;
  caption?: string;
  score?: number;
};

const AgentExtractionSchema = z.object({
  summary: z.string(),
  listing: z.record(z.string(), z.unknown()),
  sourcesSearched: z.array(z.string()),
  blindSpots: z.array(z.string()),
  warnings: z.array(z.string()),
});

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_IMAGE_LIMIT = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIN_IMAGE_WIDTH = 360;
const MIN_IMAGE_HEIGHT = 220;
const SEARCH_RESULT_PAGE_LIMIT = 5;
const SEARCH_DIRECT_IMAGE_LIMIT = 12;
const REQUEST_DELAY_MS = 450;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 AlcoveImporter/1.0";

const TO_LOCATION = {
  name: "1 Example Plaza",
  address: {
    streetAddress: "1 Example Plaza",
    addressLocality: "New York",
    addressRegion: "NY",
    addressCountry: "US",
  },
};

const AVAILABILITY_BY_STATUS: Record<ApartmentStatus, string> = {
  shortlist: "https://schema.org/InStock",
  monitor: "https://schema.org/LimitedAvailability",
  excluded: "https://schema.org/Discontinued",
  archived: "https://schema.org/Discontinued",
};

const EXTRACTION_PROMPT = `
You are the Alcove apartment import agent. Research exactly one apartment link and return one compact listing object for the Alcove database.

Use the provided URL as the source of truth, then use web search/fetch to fill gaps from direct building, broker, operator, or portal pages. Be strict about live verification. Do not invent unavailable fields.

Ranking standards:
- Main shortlist means strong enough to tour, not merely plausible.
- Manhattan neighborhoods: Chelsea, West Village, East Village, Lower East Side, SoHo, NoHo, Tribeca, Little Italy, Stuy Town, Greenwich Village, Gramercy, Flatiron, and very strong adjacent areas.
- Commute to 1 Example Plaza should be easy, ideally walking or one subway line, usually under/about 30 minutes.
- Must-haves: laundry, dishwasher, big windows/daylight, renovated bathroom, A/C and heating.
- Furniture fit matters: queen bed, 100 inch couch with ottoman, 47.4 x 29 inch coffee table, sideboard, accent chair.
- 1BR budget preferred $4,000-$5,500, hard cap $6,000.
- 2BR budget up to $9,000; true 2BR/2BA is expected for shortlist.
- 3BR budget up to $14,000, stretch to $15,000 only if unusually strong; true 3BR/3BA is expected for shortlist.

Return a compact JSON listing shaped like the existing importer expects. Important fields:
url, sourceKey or key, provider, name, addressLink, description, streetAddress, unit, neighborhood, status, track, price, priceDisplay, bedrooms, bathrooms, squareFeet, availabilityDisplay, availabilityStarts, freshness, verificationNote, commute, amenities, laundry, dishwasher, tourUrl, mustHaveEvidence, daylight, kitchen, bathroom, floorPlan, furnitureFit, photoConfidence, floorPlanConfidence, caveats, rejectionReasons, notes, rawNotes, tags.

Required field guardrail for manual add:
- Do not return a listing just because the URL card looks promising. Open/fetch the detail page first and extract the core fields from the page itself.
- Required fields are name, url, addressLink, streetAddress, price, bedrooms, bathrooms, laundry, and dishwasher. If one is missing from the source page, keep looking on the detail page, embedded structured data, unit row, official building availability page, broker page, or property-manager page before giving up.
- name must be specific and useful, preferably building plus unit or address plus unit. Do not use generic names like "Apartment listing", "StreetEasy listing", or a neighborhood-only title when a building, address, or unit exists.
- addressLink should be a source, maps, or detail URL that verifies the address. If there is no separate address URL, set addressLink to the verified listing URL.
- laundry and dishwasher must be exactly "yes", "no", or "unknown". Use "unknown" only after checking listing text, amenity lists, unit/building details, photos, and floor plan evidence.
- If price, bedrooms, bathrooms, streetAddress, or a verifying addressLink still cannot be verified after deeper searching, say so in warnings and return the best structured object with those fields absent; the importer will reject it instead of adding an incomplete active row.

Allowed status values: shortlist, monitor, excluded, archived.
Allowed track values: 1br, 2br, 3br, unknown.
Allowed freshness values: verified_live, availability_page_only, stale_or_mismatch, unverified.
Allowed confidence values: high, medium, low, blocked, unknown.
`.trim();

export const run = internalAction({
  args: { jobId: v.id("apartmentImportJobs") },
  handler: async (ctx, args) => {
    const warnings: string[] = [];

    try {
      await ctx.runMutation(internal.apartmentImports.markStarted, {
        jobId: args.jobId,
      });

      const job = await ctx.runQuery(api.apartmentImports.get, {
        jobId: args.jobId,
      });
      if (job === null) {
        throw new Error("Apartment import job not found");
      }

      const pageSnapshot = await fetchPageSnapshot(job.normalizedUrl);
      if (pageSnapshot.error) {
        warnings.push(`Source page fetch failed: ${pageSnapshot.error}`);
      }

      await ctx.runMutation(internal.apartmentImports.setStatus, {
        jobId: args.jobId,
        status: "researching",
        message: "Researching the listing with Claude.",
      });
      const extraction = await extractWithClaude(
        job.normalizedUrl,
        pageSnapshot,
      );

      await ctx.runMutation(internal.apartmentImports.setStatus, {
        jobId: args.jobId,
        status: "extracting",
        message: "Normalizing apartment details.",
      });
      warnings.push(...extraction.warnings);
      const listing = normalizeAgentListing(
        extraction.listing,
        job.normalizedUrl,
        pageSnapshot.finalUrl,
      );
      const missingRequiredFields = requiredAgentFieldGaps(listing);
      if (missingRequiredFields.length > 0) {
        throw new Error(
          `Claude could not verify required apartment fields: ${missingRequiredFields.join(
            ", ",
          )}. Open the source or a direct building/detail page and retry.`,
        );
      }

      await ctx.runMutation(internal.apartmentImports.setStatus, {
        jobId: args.jobId,
        status: "upserting",
        message: "Saving apartment details.",
      });
      const now = Date.now();
      const runDate = new Date(now).toISOString().slice(0, 10);
      const searchRunId: Id<"searchRuns"> = await ctx.runMutation(
        api.searchRuns.create,
        {
          startedAt: now,
          notes: compactLines([
            `manualAddUrl:${job.normalizedUrl}`,
            `apartmentImportJob:${args.jobId}`,
            extraction.summary,
          ]).join("\n"),
        },
      );
      const apartment = buildApartment(
        {
          id: `manual-add-${args.jobId}`,
          runDate,
          summary: extraction.summary,
        },
        listing,
        searchRunId,
        now,
      );
      const apartmentId: Id<"apartments"> = await ctx.runMutation(
        api.apartments.upsert,
        { apartment },
      );

      await ctx.runMutation(internal.apartmentImports.setStatus, {
        jobId: args.jobId,
        status: "uploading_images",
        message: "Finding and uploading listing images.",
      });
      const imageResult = await attachImages(ctx, apartmentId, listing, {
        pageSnapshot,
        imageLimit: DEFAULT_IMAGE_LIMIT,
      });
      warnings.push(...imageResult.warnings);

      await ctx.runMutation(api.searchRuns.finish, {
        id: searchRunId,
        status: "completed",
        summary: extraction.summary,
        sourcesSearched: unique([
          job.normalizedUrl,
          pageSnapshot.finalUrl,
          ...extraction.sourcesSearched,
        ]).filter(Boolean),
        blindSpots: unique([
          ...extraction.blindSpots,
          ...warnings.filter((warning) =>
            /blocked|failed|no image/i.test(warning),
          ),
        ]),
        notes: compactLines([
          `manualAddUrl:${job.normalizedUrl}`,
          `apartmentImportJob:${args.jobId}`,
          `imagesAttached:${imageResult.attached}`,
          `imageFailures:${imageResult.failures}`,
        ]).join("\n"),
      });

      await ctx.runMutation(internal.apartmentImports.complete, {
        jobId: args.jobId,
        apartmentId,
        searchRunId,
        attachedImageCount: imageResult.attached,
        imageFailureCount: imageResult.failures,
        warnings: unique(warnings),
        message: `Imported ${listing.name ?? "apartment"}.`,
      });
    } catch (error) {
      await ctx.runMutation(internal.apartmentImports.fail, {
        jobId: args.jobId,
        error: error instanceof Error ? error.message : String(error),
        warnings: unique(warnings),
      });
    }
  },
});

async function extractWithClaude(
  sourceUrl: string,
  pageSnapshot: Awaited<ReturnType<typeof fetchPageSnapshot>>,
) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Missing ANTHROPIC_API_KEY in Convex environment.");
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.parse({
    model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
    max_tokens: 5000,
    system: EXTRACTION_PROMPT,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5,
        user_location: {
          type: "approximate",
          city: "New York",
          region: "New York",
          country: "US",
          timezone: "America/New_York",
        },
      },
      {
        type: "web_fetch_20250910",
        name: "web_fetch",
        max_uses: 6,
        max_content_tokens: 60000,
        citations: { enabled: true },
      },
    ],
    messages: [
      {
        role: "user",
        content: compactLines([
          `Import this apartment link: ${sourceUrl}`,
          pageSnapshot.finalUrl !== sourceUrl &&
            `The source request resolved to: ${pageSnapshot.finalUrl}`,
          pageSnapshot.text &&
            `Fetched page text snapshot:\n${pageSnapshot.text.slice(0, 12000)}`,
          pageSnapshot.imageCandidates.length > 0 &&
            `Image URL candidates seen on source page:\n${pageSnapshot.imageCandidates
              .slice(0, 12)
              .map((candidate) => candidate.url)
              .join("\n")}`,
        ]).join("\n\n"),
      },
    ],
    output_config: {
      format: zodOutputFormat(AgentExtractionSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error("Claude did not return structured apartment details.");
  }

  return response.parsed_output;
}

async function fetchPageSnapshot(sourceUrl: string) {
  try {
    const response = await fetchWithTimeout(
      sourceUrl,
      {
        headers: requestHeaders(sourceUrl),
        redirect: "follow",
      },
      25000,
    );
    if (!response.ok) {
      return {
        finalUrl: sourceUrl,
        html: "",
        text: "",
        imageCandidates: [] as ImageCandidate[],
        error: `${response.status} ${response.statusText}`,
      };
    }

    const html = await response.text();
    const finalUrl = response.url || sourceUrl;
    return {
      finalUrl,
      html,
      text: htmlToText(html),
      imageCandidates: collectImageUrls(html, finalUrl).map((url) => ({
        url,
        referer: finalUrl,
        caption: `Image from ${hostname(finalUrl)}.`,
      })),
      error: null,
    };
  } catch (error) {
    return {
      finalUrl: sourceUrl,
      html: "",
      text: "",
      imageCandidates: [] as ImageCandidate[],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function attachImages(
  ctx: ActionCtx,
  apartmentId: Id<"apartments">,
  listing: CompactListing,
  options: {
    pageSnapshot: Awaited<ReturnType<typeof fetchPageSnapshot>>;
    imageLimit: number;
  },
) {
  const existingImages = await ctx.runQuery(api.images.listForApartment, {
    apartmentId,
  });
  const existingSources = new Set(
    existingImages.map((image) => image.sourceUrl).filter(Boolean),
  );
  const remainingSlots = Math.max(
    0,
    options.imageLimit - existingImages.length,
  );
  const warnings: string[] = [];

  if (remainingSlots === 0) {
    return { attached: 0, failures: 0, warnings };
  }

  const discoveredCandidates =
    options.pageSnapshot.imageCandidates.length < remainingSlots
      ? await discoverSearchImageCandidates(listing)
      : [];
  const candidates = uniqueCandidates([
    ...options.pageSnapshot.imageCandidates,
    ...discoveredCandidates,
  ])
    .map((candidate) => ({
      ...candidate,
      score:
        candidate.score ??
        scoreImageCandidate(candidate.url, listing, candidate.referer),
    }))
    .filter((candidate) => !existingSources.has(candidate.url))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, remainingSlots);

  if (candidates.length === 0) {
    warnings.push("No fetchable image candidates were found.");
  }

  const r2Config = getR2Config();
  const r2Client = createR2Client(r2Config);
  let attached = 0;
  let failures = 0;

  for (const candidate of candidates) {
    try {
      const downloaded = await downloadImage(
        candidate.url,
        candidate.referer ?? listing.url,
      );
      if (!downloaded) {
        failures += 1;
        continue;
      }

      const order = existingImages.length + attached;
      const key = r2ObjectKey({
        apartmentId,
        sourceUrl: candidate.url,
        bytes: downloaded.bytes,
        contentType: downloaded.contentType,
        order,
      });
      const uploaded = await putR2Object(r2Client, {
        bucket: r2Config.bucket,
        key,
        bytes: downloaded.bytes,
        contentType: downloaded.contentType,
        sourceUrl: candidate.url,
      });

      await ctx.runMutation(api.images.attachR2, {
        apartmentId,
        bucket: r2Config.bucket,
        key,
        contentUrl: r2ContentUrl(key, r2Config),
        etag: uploaded.etag,
        contentLength: downloaded.bytes.byteLength,
        kind: candidate.kind ?? imageKindFromUrl(candidate.url),
        sourceUrl: candidate.url,
        order,
        image: {
          name: `${listing.name ?? "Apartment"} image ${order + 1}`,
          caption: candidate.caption,
          encodingFormat: downloaded.contentType,
          representativeOfPage: order === 0,
        },
      });

      attached += 1;
    } catch (error) {
      failures += 1;
      warnings.push(
        `Image attach failed for ${candidate.url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    await delay(REQUEST_DELAY_MS);
  }

  return { attached, failures, warnings };
}

function buildApartment(
  run: { id: string; runDate: string; summary: string },
  listing: CompactListing,
  searchRunId: Id<"searchRuns">,
  now: number,
) {
  const provider = listing.provider ?? providerFromUrl(listing.url);
  const price = listing.price ?? listing.priceMin;
  const sourceKey =
    listing.key ?? listing.sourceKey ?? sourceKeyFromUrl(listing.url);
  const statusDecision = tightenedStatusDecision(listing);
  const status = statusDecision.status;
  const track = listing.track ?? trackFromBedrooms(listing.bedrooms);
  const amenities = normalizedAmenities(listing);
  const priceProperties = compact([
    listing.priceDisplay && propertyValue("priceDisplay", listing.priceDisplay),
    listing.priceMin !== undefined && listing.priceMax !== undefined
      ? propertyValue(
          "priceRange",
          `${listing.priceMin}-${listing.priceMax}`,
          "USD",
        )
      : undefined,
  ]);
  const listingProperties = compact([
    listing.neighborhood && propertyValue("neighborhood", listing.neighborhood),
    listing.unit && propertyValue("unit", listing.unit),
    listing.addressLink && propertyValue("addressLink", listing.addressLink),
    propertyValue("importSource", "manual-add"),
    propertyValue("automationRunDate", run.runDate),
  ]);

  return prune({
    sourceKey,
    status,
    track,
    rank: listing.rank,
    score: listing.score,
    listing: {
      url: listing.url,
      name: listing.name,
      description: listing.description ?? listing.notes,
      provider,
      additionalProperty: listingProperties,
    },
    apartment: {
      name: listing.name,
      description: listing.description ?? listing.notes,
      accommodationCategory: categoryForTrack(track),
      address: buildAddress(listing),
      floorSize:
        listing.squareFeet || listing.squareFeetMin || listing.squareFeetMax
          ? {
              value: listing.squareFeet,
              minValue: listing.squareFeetMin,
              maxValue: listing.squareFeetMax,
              unitText: "sq ft",
            }
          : undefined,
      floorLevel: listing.floorLevel,
      numberOfRooms: listing.rooms,
      numberOfBedrooms: listing.bedrooms,
      numberOfBathroomsTotal: listing.bathrooms,
      numberOfFullBathrooms: listing.fullBathrooms,
      numberOfPartialBathrooms: listing.partialBathrooms,
      amenityFeature: amenities.map((name) => ({
        name,
        value: true,
      })),
      petsAllowed: listing.petsAllowed,
      tourBookingPage: listing.tourUrl,
      additionalProperty: compact([
        listing.layout && propertyValue("layout", listing.layout),
        listing.areaDisplay &&
          propertyValue("areaDisplay", listing.areaDisplay),
        listing.laundry && propertyValue("laundry", listing.laundry),
        listing.dishwasher && propertyValue("dishwasher", listing.dishwasher),
        listing.availabilityDisplay &&
          propertyValue("availabilityDisplay", listing.availabilityDisplay),
      ]),
    },
    offer: {
      url: listing.url,
      price,
      priceCurrency: listing.priceCurrency ?? "USD",
      availability: listing.availability ?? AVAILABILITY_BY_STATUS[status],
      availabilityStarts: listing.availabilityStarts,
      businessFunction: "LeaseOut",
      additionalProperty: priceProperties,
    },
    assessment: {
      commute: listing.commute
        ? {
            toLocation: TO_LOCATION,
            minutes: listing.commute.minutes,
            route: listing.commute.route,
            notes: listing.commute.notes,
          }
        : undefined,
      verification: {
        freshness: listing.freshness ?? freshnessForStatus(status),
        note: listing.verificationNote,
        lastVerifiedAt: now,
      },
      confidence: {
        photos: listing.photoConfidence ?? "unknown",
        floorPlan: listing.floorPlanConfidence ?? "unknown",
      },
      mustHaveEvidence: listing.mustHaveEvidence,
      daylight: listing.daylight,
      kitchen: listing.kitchen,
      bathroom: listing.bathroom,
      floorPlan: listing.floorPlan,
      furnitureFit: listing.furnitureFit,
      caveats: listing.caveats,
      rejectionReasons: compact([
        ...(listing.rejectionReasons ?? []),
        statusDecision.reason &&
          `Does not meet stricter shortlist standard: ${statusDecision.reason}`,
      ]),
      rawNotes: compactLines([
        listing.notes,
        listing.rawNotes,
        run.summary,
      ]).join("\n"),
    },
    tags: compact([
      run.id,
      run.runDate,
      listing.neighborhood,
      ...(listing.tags ?? []),
    ]),
    searchRunId,
  });
}

function normalizeAgentListing(
  raw: Record<string, unknown>,
  sourceUrl: string,
  finalUrl: string,
): CompactListing {
  const url = stringField(raw, "url") ?? finalUrl ?? sourceUrl;
  const bedrooms = numberField(raw, "bedrooms");
  const listing: CompactListing = {
    url,
    key: stringField(raw, "key"),
    sourceKey: stringField(raw, "sourceKey"),
    provider: stringField(raw, "provider") ?? providerFromUrl(url),
    name: stringField(raw, "name"),
    addressLink: stringField(raw, "addressLink") ?? url,
    description: stringField(raw, "description"),
    streetAddress: stringField(raw, "streetAddress"),
    addressLocality: stringField(raw, "addressLocality") ?? "New York",
    addressRegion: stringField(raw, "addressRegion") ?? "NY",
    postalCode: stringField(raw, "postalCode"),
    unit: stringField(raw, "unit"),
    neighborhood: stringField(raw, "neighborhood"),
    status: statusField(raw, "status") ?? "monitor",
    track: trackField(raw, "track") ?? trackFromBedrooms(bedrooms),
    rank: numberField(raw, "rank"),
    score: numberField(raw, "score"),
    price: numberField(raw, "price"),
    priceMin: numberField(raw, "priceMin"),
    priceMax: numberField(raw, "priceMax"),
    priceDisplay: stringField(raw, "priceDisplay"),
    priceCurrency: stringField(raw, "priceCurrency") ?? "USD",
    bedrooms,
    bathrooms: numberField(raw, "bathrooms"),
    fullBathrooms: numberField(raw, "fullBathrooms"),
    partialBathrooms: numberField(raw, "partialBathrooms"),
    squareFeet: numberField(raw, "squareFeet"),
    squareFeetMin: numberField(raw, "squareFeetMin"),
    squareFeetMax: numberField(raw, "squareFeetMax"),
    floorLevel: stringField(raw, "floorLevel"),
    rooms: numberField(raw, "rooms"),
    layout: stringField(raw, "layout"),
    areaDisplay: stringField(raw, "areaDisplay"),
    availability: stringField(raw, "availability"),
    availabilityStarts: stringField(raw, "availabilityStarts"),
    availabilityDisplay: stringField(raw, "availabilityDisplay"),
    freshness: freshnessField(raw, "freshness"),
    verificationNote: stringField(raw, "verificationNote"),
    commute: commuteField(raw.commute),
    amenities: stringArrayField(raw, "amenities"),
    laundry: yesNoUnknownField(raw, "laundry"),
    dishwasher: yesNoUnknownField(raw, "dishwasher"),
    petsAllowed: booleanField(raw, "petsAllowed"),
    tourUrl: stringField(raw, "tourUrl"),
    mustHaveEvidence: stringField(raw, "mustHaveEvidence"),
    daylight: stringField(raw, "daylight"),
    kitchen: stringField(raw, "kitchen"),
    bathroom: stringField(raw, "bathroom"),
    floorPlan: stringField(raw, "floorPlan"),
    furnitureFit: stringField(raw, "furnitureFit"),
    photoConfidence: confidenceField(raw, "photoConfidence"),
    floorPlanConfidence: confidenceField(raw, "floorPlanConfidence"),
    caveats: stringArrayField(raw, "caveats"),
    rejectionReasons: stringArrayField(raw, "rejectionReasons"),
    notes: stringField(raw, "notes"),
    rawNotes: stringField(raw, "rawNotes"),
    tags: stringArrayField(raw, "tags"),
  };

  if (!listing.name) {
    listing.name =
      compactLines([listing.streetAddress, listing.unit]).join(" ") ||
      providerFromUrl(url);
  }

  return listing;
}

function requiredAgentFieldGaps(listing: CompactListing) {
  const gaps: string[] = [];
  const bathrooms =
    listing.bathrooms ??
    (listing.fullBathrooms !== undefined ||
    listing.partialBathrooms !== undefined
      ? (listing.fullBathrooms ?? 0) + (listing.partialBathrooms ?? 0)
      : undefined);

  if (!listing.name) gaps.push("name");
  if (!listing.url) gaps.push("url");
  if (!listing.addressLink) gaps.push("addressLink");
  if (!listing.streetAddress) gaps.push("streetAddress");
  if ((listing.price ?? listing.priceMin) === undefined) gaps.push("price");
  if (listing.bedrooms === undefined) gaps.push("bedrooms");
  if (bathrooms === undefined) gaps.push("bathrooms");
  if (!listing.laundry) gaps.push("laundry");
  if (!listing.dishwasher) gaps.push("dishwasher");

  return gaps;
}

function normalizedAmenities(listing: CompactListing) {
  const amenities = [...(listing.amenities ?? [])];
  const hasLaundry = amenities.some((name) =>
    /laundry|washer|dryer/i.test(name),
  );
  const hasDishwasher = amenities.some((name) => /dishwash/i.test(name));

  if (listing.laundry === "yes" && !hasLaundry) {
    amenities.push("Laundry");
  }
  if (listing.dishwasher === "yes" && !hasDishwasher) {
    amenities.push("Dishwasher");
  }

  return unique(amenities);
}

async function discoverSearchImageCandidates(listing: CompactListing) {
  const candidates: ImageCandidate[] = [];
  const queries = buildImageSearchQueries(listing);

  for (const query of queries) {
    candidates.push(...(await searchBingImages(query, listing)));

    const pages = await searchResultPages(query);
    for (const pageUrl of pages.slice(0, SEARCH_RESULT_PAGE_LIMIT)) {
      const pageImages = await extractPageImages(pageUrl);
      candidates.push(
        ...(pageImages.candidates ?? []).map((candidate) => ({
          ...candidate,
          kind: "building" as const,
          caption: `Search-discovered image from ${hostname(pageUrl)}.`,
          score: scoreImageCandidate(candidate.url, listing, pageUrl),
        })),
      );
      await delay(REQUEST_DELAY_MS);
    }

    if (candidates.length >= SEARCH_DIRECT_IMAGE_LIMIT) {
      break;
    }
    await delay(REQUEST_DELAY_MS);
  }

  return uniqueCandidates(candidates)
    .map((candidate) => ({
      ...candidate,
      score:
        candidate.score ??
        scoreImageCandidate(candidate.url, listing, candidate.referer),
    }))
    .filter((candidate) => (candidate.score ?? 0) > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, SEARCH_DIRECT_IMAGE_LIMIT);
}

async function extractPageImages(pageUrl: string) {
  try {
    const response = await fetchWithTimeout(
      pageUrl,
      {
        headers: requestHeaders(pageUrl),
        redirect: "follow",
      },
      25000,
    );
    if (!response.ok) {
      return { candidates: [] as ImageCandidate[] };
    }

    const html = await response.text();
    const finalUrl = response.url || pageUrl;
    return {
      candidates: collectImageUrls(html, finalUrl).map((url) => ({
        url,
        referer: finalUrl,
        caption: `Image from ${hostname(finalUrl)}.`,
      })),
    };
  } catch {
    return { candidates: [] as ImageCandidate[] };
  }
}

async function searchResultPages(query: string) {
  const urls: string[] = [];
  const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  try {
    const response = await fetchWithTimeout(
      searchUrl,
      {
        headers: requestHeaders(searchUrl),
        redirect: "follow",
      },
      25000,
    );
    if (response.ok) {
      const html = await response.text();
      for (const tag of html.matchAll(/<a\b[^>]*href=(["'])(.*?)\1[^>]*>/gi)) {
        const href = decodeHtml(tag[2]);
        const resultUrl = decodeDuckDuckGoUrl(href, searchUrl);
        if (resultUrl && isUsefulResultPage(resultUrl)) {
          urls.push(resultUrl);
        }
      }
    }
  } catch {
    return [];
  }

  return unique(urls).slice(0, SEARCH_RESULT_PAGE_LIMIT);
}

async function searchBingImages(query: string, listing: CompactListing) {
  const candidates: ImageCandidate[] = [];
  const searchUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2`;

  try {
    const response = await fetchWithTimeout(
      searchUrl,
      {
        headers: requestHeaders(searchUrl),
        redirect: "follow",
      },
      25000,
    );
    if (!response.ok) {
      return [];
    }

    const html = decodeHtml(await response.text());
    for (const match of html.matchAll(/\bm="({[^"]+})"/gi)) {
      try {
        const item = JSON.parse(match[1]) as {
          murl?: string;
          purl?: string;
          t?: string;
        };
        if (!item.murl || !isUsefulImageUrl(item.murl)) {
          continue;
        }
        const sourcePage = item.purl ?? searchUrl;
        candidates.push({
          url: item.murl,
          referer: sourcePage,
          kind: "building",
          caption: `Search-discovered building/location image from ${hostname(
            sourcePage,
          )}.`,
          score: scoreImageCandidate(
            `${item.murl} ${item.t ?? ""}`,
            listing,
            sourcePage,
          ),
        });
      } catch {
        // Bing can emit partial metadata records; the murl regex below is the fallback.
      }
    }

    for (const match of html.matchAll(/"murl"\s*:\s*"([^"]+)"/gi)) {
      const url = decodeJsonString(match[1]);
      if (isUsefulImageUrl(url)) {
        candidates.push({
          url,
          referer: searchUrl,
          kind: "building",
          caption: `Search-discovered building/location image for "${query}".`,
          score: scoreImageCandidate(url, listing, searchUrl),
        });
      }
    }
  } catch {
    return [];
  }

  return uniqueCandidates(candidates)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, SEARCH_DIRECT_IMAGE_LIMIT);
}

function buildImageSearchQueries(listing: CompactListing) {
  const parts = compact([
    listing.name,
    listing.streetAddress,
    listing.neighborhood,
    "New York",
  ]);
  const buildingName = compact([
    listing.name?.replace(/#.+$/, "").trim(),
    listing.streetAddress,
  ]);

  return unique(
    [
      `${parts.join(" ")} apartment photos`,
      `${buildingName.join(" ")} building exterior`,
      `${listing.streetAddress ?? listing.name} NYC rental building photos`,
      `${listing.neighborhood ?? ""} ${listing.streetAddress ?? listing.name} apartments`,
      `${listing.provider ?? ""} ${listing.name ?? listing.streetAddress} photos`,
    ]
      .map((query) => query.replace(/\s+/g, " ").trim())
      .filter((query) => query.length > 12),
  ).slice(0, 4);
}

function collectImageUrls(html: string, pageUrl: string) {
  const urls: string[] = [];

  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributesFromTag(tag[0]);
    const name = (attrs.property ?? attrs.name ?? "").toLowerCase();
    if (
      [
        "og:image",
        "og:image:url",
        "og:image:secure_url",
        "twitter:image",
        "twitter:image:src",
      ].includes(name) &&
      attrs.content
    ) {
      urls.push(attrs.content);
    }
  }

  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      collectJsonLdImages(JSON.parse(decodeHtml(match[1]).trim()), urls);
    } catch {
      // Meta and img tags still cover invalid JSON-LD pages.
    }
  }

  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    const attrs = attributesFromTag(tag[0]);
    for (const attrName of [
      "src",
      "data-src",
      "data-original",
      "data-lazy-src",
      "data-full",
      "data-image",
      "data-url",
    ]) {
      if (attrs[attrName]) {
        urls.push(attrs[attrName]);
      }
    }
    if (attrs.srcset) {
      urls.push(...urlsFromSrcset(attrs.srcset));
    }
    if (attrs["data-srcset"]) {
      urls.push(...urlsFromSrcset(attrs["data-srcset"]));
    }
  }

  return unique(
    urls
      .map((url) => normalizeImageUrl(url, pageUrl))
      .filter((url): url is string => Boolean(url))
      .filter(isUsefulImageUrl),
  );
}

function collectJsonLdImages(node: unknown, urls: string[]) {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectJsonLdImages(item, urls);
    }
    return;
  }

  if (!node || typeof node !== "object") {
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    if (["image", "contentUrl", "thumbnailUrl"].includes(key)) {
      if (typeof value === "string") {
        urls.push(value);
      } else {
        collectJsonLdImages(value, urls);
      }
    } else {
      collectJsonLdImages(value, urls);
    }
  }
}

async function downloadImage(imageUrl: string, referer: string) {
  const response = await fetchWithTimeout(
    imageUrl,
    {
      headers: requestHeaders(referer),
      redirect: "follow",
    },
    25000,
  );

  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (!contentType.startsWith("image/")) {
    return null;
  }

  const contentLength = Number(response.headers.get("content-length"));
  if (contentLength > MAX_IMAGE_BYTES) {
    return null;
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return null;
  }

  const dimensions = imageDimensions(bytes, contentType);
  if (
    dimensions &&
    (dimensions.width < MIN_IMAGE_WIDTH || dimensions.height < MIN_IMAGE_HEIGHT)
  ) {
    return null;
  }

  return { bytes, contentType };
}

function scoreImageCandidate(
  imageUrl: string,
  listing: CompactListing,
  sourcePage?: string,
) {
  const haystack = [
    imageUrl,
    sourcePage,
    hostname(imageUrl),
    sourcePage && hostname(sourcePage),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const listingTerms = termsForListing(listing);
  let score = 0;

  for (const term of listingTerms) {
    if (term.length > 2 && haystack.includes(term)) {
      score += term.length > 5 ? 12 : 6;
    }
  }

  if (listing.url && hostname(imageUrl) === hostname(listing.url)) {
    score += 45;
  }
  if (
    sourcePage &&
    listing.url &&
    hostname(sourcePage) === hostname(listing.url)
  ) {
    score += 35;
  }
  if (
    /streeteasy|equityapartments|avalon|stonehenge|brodsky|chelsea29|eve\.nyc|rockrose|apartments|zillow|trulia/i.test(
      haystack,
    )
  ) {
    score += 20;
  }
  if (
    /building|exterior|facade|amenity|lobby|roof|residence|apartment|gallery|photo/i.test(
      haystack,
    )
  ) {
    score += 16;
  }
  if (/floor[-_ ]?plan|floorplan|plan/i.test(haystack)) {
    score += 10;
  }
  if (
    /logo|icon|sprite|avatar|map|marker|staticmap|placeholder|default/i.test(
      haystack,
    )
  ) {
    score -= 80;
  }
  if (/unsplash|pexels|shutterstock|stock/i.test(haystack)) {
    score -= 40;
  }

  return score;
}

function termsForListing(listing: CompactListing) {
  return unique(
    compact([
      listing.name,
      listing.streetAddress,
      listing.neighborhood,
      listing.provider,
    ])
      .flatMap((value) =>
        String(value).toLowerCase().replace(/[#.,]/g, " ").split(/\s+/),
      )
      .filter(
        (term) =>
          ![
            "new",
            "york",
            "ny",
            "street",
            "st",
            "avenue",
            "ave",
            "apartment",
            "apartments",
          ].includes(term),
      ),
  );
}

function getR2Config() {
  const endpointInput = process.env.R2_S3_API_URL;
  const accessKeyId = process.env.R2_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_S3_SECRET_ACCESS_KEY;

  if (!endpointInput || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing R2_S3_API_URL, R2_S3_ACCESS_KEY_ID, or R2_S3_SECRET_ACCESS_KEY in Convex environment.",
    );
  }

  const endpointUrl = new URL(endpointInput);
  const inferredBucket = endpointUrl.pathname.split("/").filter(Boolean)[0];
  endpointUrl.pathname = "";
  endpointUrl.search = "";
  endpointUrl.hash = "";

  return {
    endpoint: endpointUrl.toString().replace(/\/$/, ""),
    accessKeyId,
    secretAccessKey,
    bucket:
      process.env.R2_BUCKET_NAME ??
      process.env.R2_BUCKET ??
      inferredBucket ??
      "alcove",
    publicBaseUrl: (
      process.env.R2_PUBLIC_URL ?? process.env.NEXT_PUBLIC_R2_PUBLIC_URL
    )?.replace(/\/$/, ""),
  };
}

function createR2Client(config: ReturnType<typeof getR2Config>) {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

async function putR2Object(
  client: S3Client,
  args: {
    bucket: string;
    key: string;
    bytes: Buffer;
    contentType: string;
    sourceUrl: string;
  },
) {
  const result = await client.send(
    new PutObjectCommand({
      Bucket: args.bucket,
      Key: args.key,
      Body: args.bytes,
      ContentType: args.contentType,
      Metadata: { "source-url": args.sourceUrl.slice(0, 2000) },
    }),
  );

  return { etag: result.ETag };
}

function r2ContentUrl(key: string, config: ReturnType<typeof getR2Config>) {
  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  return `/api/images/r2?bucket=${encodeURIComponent(config.bucket)}&key=${encodeURIComponent(key)}`;
}

function r2ObjectKey({
  apartmentId,
  sourceUrl,
  bytes,
  contentType,
  order,
}: {
  apartmentId: Id<"apartments">;
  sourceUrl: string;
  bytes: Buffer;
  contentType: string;
  order: number;
}) {
  const digest = createHash("sha256")
    .update(sourceUrl)
    .update(bytes)
    .digest("hex")
    .slice(0, 20);
  const extension = extensionForContentType(contentType) ?? ".jpg";

  return [
    "apartments",
    sanitizeKeyPart(apartmentId),
    `image-${order}-${digest}${extension}`,
  ].join("/");
}

function extensionForContentType(contentType: string) {
  if (contentType === "image/jpeg") return ".jpg";
  if (contentType === "image/png") return ".png";
  if (contentType === "image/webp") return ".webp";
  if (contentType === "image/gif") return ".gif";
  return null;
}

function sanitizeKeyPart(value: string) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function imageDimensions(bytes: Buffer, contentType: string) {
  if (contentType === "image/png" && bytes.length >= 24) {
    return {
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    };
  }

  if (contentType === "image/jpeg") {
    return jpegDimensions(bytes);
  }

  if (contentType === "image/gif" && bytes.length >= 10) {
    return {
      width: bytes.readUInt16LE(6),
      height: bytes.readUInt16LE(8),
    };
  }

  return null;
}

function jpegDimensions(bytes: Buffer) {
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      break;
    }

    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    ) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }

  return null;
}

function tightenedStatusDecision(listing: CompactListing): {
  status: ApartmentStatus;
  reason?: string;
} {
  const originalStatus = listing.status ?? "monitor";
  if (originalStatus !== "shortlist") {
    return { status: originalStatus };
  }

  const track = listing.track ?? "unknown";
  const price = listing.price ?? listing.priceMin;
  const bedrooms = listing.bedrooms;
  const bathrooms = listing.bathrooms ?? listing.fullBathrooms ?? 0;
  const squareFeet =
    listing.squareFeet ?? listing.squareFeetMax ?? listing.squareFeetMin;
  const freshness = listing.freshness ?? freshnessForStatus(originalStatus);
  const caveats = (listing.caveats ?? []).join(" ");

  if (freshness !== "verified_live") {
    return { status: "monitor", reason: "availability is not verified live" };
  }
  if (track === "unknown") {
    return {
      status: "monitor",
      reason: "track is not a known 1BR/2BR/3BR fit",
    };
  }
  if (hasHardShortlistCaveat(caveats)) {
    return {
      status: "monitor",
      reason: "unresolved must-have or layout caveat",
    };
  }

  if (track === "1br") {
    if (bedrooms !== 1 || bathrooms < 1) {
      return { status: "monitor", reason: "does not verify as a clean 1BR" };
    }
    if (price === undefined || price > 6000) {
      return { status: "monitor", reason: "outside 1BR hard cap" };
    }
    if (
      listing.photoConfidence !== "high" ||
      listing.floorPlanConfidence !== "high"
    ) {
      return {
        status: "monitor",
        reason: "photos and floor plan are not both high confidence",
      };
    }
    if (squareFeet !== undefined && squareFeet < 620) {
      return {
        status: "monitor",
        reason: "1BR size is below the stricter fit bar",
      };
    }
    return { status: "shortlist" };
  }

  if (track === "2br") {
    if (bedrooms !== 2 || bathrooms < 2) {
      return {
        status: "monitor",
        reason: "2BR shortlist now requires 2BR/2BA",
      };
    }
    if (price === undefined || price > 9000) {
      return { status: "monitor", reason: "outside 2BR budget" };
    }
    if (
      listing.photoConfidence !== "high" ||
      listing.floorPlanConfidence !== "high"
    ) {
      return {
        status: "monitor",
        reason: "2BR needs high-confidence photos and floor plan",
      };
    }
    if (squareFeet !== undefined && squareFeet < 900) {
      return {
        status: "monitor",
        reason: "2BR living area is below the stricter fit bar",
      };
    }
    return { status: "shortlist" };
  }

  if (track === "3br") {
    if ((bedrooms ?? 0) < 3 || bathrooms < 3) {
      return {
        status: "monitor",
        reason: "3BR shortlist now requires a true 3BR/3BA",
      };
    }
    if (price === undefined || price > 15000) {
      return { status: "monitor", reason: "outside 3BR stretch budget" };
    }
    if (!isCoreNeighborhood(listing.neighborhood)) {
      return { status: "monitor", reason: "outside the core neighborhood set" };
    }
    if (
      listing.photoConfidence !== "high" ||
      listing.floorPlanConfidence !== "high"
    ) {
      return {
        status: "monitor",
        reason: "3BR needs high-confidence photos and floor plan",
      };
    }
    return { status: "shortlist" };
  }

  return {
    status: "monitor",
    reason: "does not match a strict shortlist track",
  };
}

function hasHardShortlistCaveat(caveats: string) {
  return /no square footage|no floor plan|no dimensions|not explicit|could not verify|no clean explicit|income-restricted|only one bathroom|only two bathrooms|misses the third|not a true|currently configured|model photos|floor-plan-level only|broken price|call-for-pricing|outside core|outside preferred/i.test(
    caveats,
  );
}

function isCoreNeighborhood(neighborhood?: string) {
  if (!neighborhood) {
    return false;
  }
  return /chelsea|west village|east village|lower east side|soho|noho|tribeca|little italy|greenwich village|gramercy|flatiron|stuy/i.test(
    neighborhood,
  );
}

function sourceKeyFromUrl(url: string) {
  const parsedUrl = new URL(url);
  const host = parsedUrl.hostname.replace(/^www\./, "");
  return `${host}:${parsedUrl.pathname.replace(/\/$/, "")}`;
}

function providerFromUrl(url: string) {
  if (url.includes("streeteasy.com")) {
    return "StreetEasy";
  }
  if (url.includes("equityapartments.com")) {
    return "Equity Apartments";
  }
  if (url.includes("chelsea29.com")) {
    return "Chelsea29";
  }
  if (url.includes("eve.nyc")) {
    return "EVE East Village";
  }
  return new URL(url).hostname.replace(/^www\./, "");
}

function categoryForTrack(track: Track) {
  if (track === "1br") {
    return "Apartment, 1 bedroom";
  }
  if (track === "2br") {
    return "Apartment, 2 bedroom";
  }
  if (track === "3br") {
    return "Apartment, 3 bedroom";
  }
  return "Apartment";
}

function freshnessForStatus(status: ApartmentStatus): Freshness {
  if (status === "excluded" || status === "archived") {
    return "stale_or_mismatch";
  }
  return "verified_live";
}

function trackFromBedrooms(bedrooms?: number): Track {
  if (bedrooms === 1) return "1br";
  if (bedrooms === 2) return "2br";
  if (bedrooms !== undefined && bedrooms >= 3) return "3br";
  return "unknown";
}

function buildAddress(listing: CompactListing) {
  return prune({
    streetAddress: listing.streetAddress,
    addressLocality: listing.addressLocality ?? "New York",
    addressRegion: listing.addressRegion ?? "NY",
    postalCode: listing.postalCode,
    addressCountry: "US",
  });
}

function propertyValue(
  name: string,
  value: string | number | boolean,
  unitText?: string,
) {
  return prune({ name, value, unitText });
}

function stringField(raw: Record<string, unknown>, key: string) {
  const value = raw[key];
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function numberField(raw: Record<string, unknown>, key: string) {
  const value = raw[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function booleanField(raw: Record<string, unknown>, key: string) {
  const value = raw[key];
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (/^(true|yes)$/i.test(value)) return true;
    if (/^(false|no)$/i.test(value)) return false;
  }
  return undefined;
}

function yesNoUnknownField(
  raw: Record<string, unknown>,
  key: string,
): YesNoUnknown | undefined {
  const value = raw[key];
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (/^(yes|true|available|present|included)$/.test(normalized)) {
    return "yes";
  }
  if (/^(no|false|unavailable|absent|not included|none)$/.test(normalized)) {
    return "no";
  }
  if (
    /^(unknown|unclear|not listed|not verified|unverified)$/.test(normalized)
  ) {
    return "unknown";
  }
  return undefined;
}

function stringArrayField(raw: Record<string, unknown>, key: string) {
  const value = raw[key];
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : String(item)))
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return undefined;
}

function statusField(
  raw: Record<string, unknown>,
  key: string,
): ApartmentStatus | undefined {
  const value = stringField(raw, key);
  return value === "shortlist" ||
    value === "monitor" ||
    value === "excluded" ||
    value === "archived"
    ? value
    : undefined;
}

function trackField(
  raw: Record<string, unknown>,
  key: string,
): Track | undefined {
  const value = stringField(raw, key);
  return value === "1br" ||
    value === "2br" ||
    value === "3br" ||
    value === "unknown"
    ? value
    : undefined;
}

function freshnessField(
  raw: Record<string, unknown>,
  key: string,
): Freshness | undefined {
  const value = stringField(raw, key);
  return value === "verified_live" ||
    value === "availability_page_only" ||
    value === "stale_or_mismatch" ||
    value === "unverified"
    ? value
    : undefined;
}

function confidenceField(
  raw: Record<string, unknown>,
  key: string,
): Confidence | undefined {
  const value = stringField(raw, key);
  return value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "blocked" ||
    value === "unknown"
    ? value
    : undefined;
}

function commuteField(value: unknown): CompactListing["commute"] {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  return prune({
    minutes: numberField(raw, "minutes"),
    route: stringField(raw, "route"),
    notes: stringField(raw, "notes"),
  });
}

function attributesFromTag(tag: string) {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(
    /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g,
  )) {
    attrs[match[1].toLowerCase()] = decodeHtml(
      match[3] ?? match[4] ?? match[5] ?? "",
    );
  }
  return attrs;
}

function urlsFromSrcset(srcset: string) {
  return srcset
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function decodeDuckDuckGoUrl(rawUrl: string, baseUrl: string) {
  try {
    const parsedUrl = new URL(rawUrl, baseUrl);
    const uddg = parsedUrl.searchParams.get("uddg");
    return uddg ? new URL(uddg).toString() : parsedUrl.toString();
  } catch {
    return null;
  }
}

function isUsefulResultPage(url: string) {
  try {
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return false;
    }

    if (
      /duckduckgo|bing|google|yahoo|facebook|instagram|tiktok|pinterest|youtube|x\.com|twitter/i.test(
        parsedUrl.hostname,
      )
    ) {
      return false;
    }

    if (/\.(jpg|jpeg|png|webp|gif|svg|pdf)$/i.test(parsedUrl.pathname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function normalizeImageUrl(rawUrl: string, pageUrl: string) {
  if (!rawUrl || rawUrl.startsWith("data:") || rawUrl.startsWith("blob:")) {
    return null;
  }

  try {
    return new URL(decodeHtml(rawUrl), pageUrl).toString();
  } catch {
    return null;
  }
}

function isUsefulImageUrl(url: string) {
  if (!url.startsWith("http")) {
    return false;
  }

  if (
    /(\.svg|favicon|sprite|logo|icon|transparent|placeholder|mapbox|googleapis|\/path\/to\/|office-photo)/i.test(
      url,
    )
  ) {
    return false;
  }

  return true;
}

function imageKindFromUrl(url: string): ImageKind {
  if (/floor[-_ ]?plan|floorplan|plan/i.test(url)) {
    return "floor_plan";
  }

  if (/building|exterior|amenity|lobby|roof|gym/i.test(url)) {
    return "building";
  }

  return "photo";
}

function htmlToText(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function requestHeaders(referer: string) {
  return {
    "User-Agent": USER_AGENT,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: referer,
  };
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function decodeJsonString(value: string) {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value.replace(/\\\//g, "/");
  }
}

function hostname(url?: string) {
  if (!url) {
    return "";
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function uniqueCandidates(candidates: ImageCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.url)) {
      return false;
    }
    seen.add(candidate.url);
    return true;
  });
}

function compact<T>(items: Array<T | undefined | null | false | "">): T[] {
  return items.filter(Boolean) as T[];
}

function compactLines(
  items: Array<string | number | boolean | undefined | null | false>,
) {
  return compact(items)
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function prune<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(prune).filter((item) => item !== undefined) as T;
  }

  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const pruned = prune(item);
      if (pruned !== undefined) {
        next[key] = pruned;
      }
    }
    return next as T;
  }

  return (value === undefined ? undefined : value) as T;
}

function delay(ms: number) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
