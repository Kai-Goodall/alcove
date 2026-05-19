import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import {
  createR2Client,
  ensureR2Bucket,
  getR2Config,
  loadEnvLocal,
  putR2Object,
  r2ContentUrl,
  r2ObjectKey,
} from "./r2.mjs";

const DEFAULT_DATA_FILE = "data/automation-backfill/runs.json";
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

const AVAILABILITY_BY_STATUS = {
  shortlist: "https://schema.org/InStock",
  monitor: "https://schema.org/LimitedAvailability",
  excluded: "https://schema.org/Discontinued",
  archived: "https://schema.org/Discontinued",
};

const args = parseArgs(process.argv.slice(2));
loadEnvLocal();
if (args.bucket) {
  process.env.R2_BUCKET_NAME = args.bucket;
}

const dataFile = resolve(process.cwd(), args.file ?? DEFAULT_DATA_FILE);
const convexUrl =
  process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;

if (!convexUrl) {
  throw new Error(
    "Missing NEXT_PUBLIC_CONVEX_URL. Check .env.local or pass CONVEX_URL.",
  );
}

const client = new ConvexHttpClient(convexUrl);
const importData = JSON.parse(await readFile(dataFile, "utf8"));
const imageLimit = Number(args["image-limit"] ?? DEFAULT_IMAGE_LIMIT);
const shouldFetchImages = args.images !== "false" && !args["no-images"];
const shouldSearchImages =
  args["search-images"] !== "false" && !args["no-search-images"];
const shouldDryRun = Boolean(args["dry-run"]);
const imageStorage = args["image-storage"] ?? "r2";

if (!["r2", "convex"].includes(imageStorage)) {
  throw new Error("--image-storage must be either r2 or convex.");
}

const r2Config =
  shouldFetchImages && imageStorage === "r2" && !shouldDryRun
    ? getR2Config()
    : null;
const r2Client = r2Config ? createR2Client(r2Config) : null;

if (r2Client && args["create-bucket"] !== "false" && !args["no-create-bucket"]) {
  const bucketState = await ensureR2Bucket(r2Client, r2Config.bucket);
  console.log(`r2 bucket ${r2Config.bucket}: ${bucketState}`);
}

let upsertedCount = 0;
let imageCount = 0;
let imageFailureCount = 0;

for (const run of importData.runs) {
  const startedAt = dateToTimestamp(run.runDate);
  const runNotes = compactLines([
    `automationRunId:${run.id}`,
    run.notes,
  ]).join("\n");
  const existingRun = await findExistingSearchRun(client, run.id, startedAt);
  const searchRunId =
    existingRun?._id ??
    (shouldDryRun
      ? "dry-run-search-run"
      : await client.mutation(api.searchRuns.create, {
          startedAt,
          notes: runNotes,
        }));

  console.log(
    `${shouldDryRun ? "[dry-run] " : ""}run ${run.runDate}: ${
      run.listings.length
    } listings`,
  );

  for (const listing of run.listings) {
    const apartment = buildApartment(run, listing, searchRunId);
    if (shouldDryRun) {
      console.log(`  would upsert ${apartment.sourceKey}`);
      continue;
    }

    const apartmentId = await client.mutation(api.apartments.upsert, {
      apartment,
    });
    upsertedCount += 1;

    if (shouldFetchImages && listing.url) {
      const result = await attachPageImages(client, apartmentId, listing, {
        imageLimit,
        shouldSearchImages,
        imageStorage,
        r2Client,
        r2Config,
      });
      imageCount += result.attached;
      imageFailureCount += result.failures;
      console.log(
        `  upserted ${apartment.sourceKey} (${result.attached} images)`,
      );
      await delay(REQUEST_DELAY_MS);
    } else {
      console.log(`  upserted ${apartment.sourceKey}`);
    }
  }

  if (!shouldDryRun) {
    await client.mutation(api.searchRuns.finish, {
      id: searchRunId,
      status: "completed",
      summary: run.summary,
      sourcesSearched: run.sourcesSearched,
      blindSpots: run.blindSpots,
      notes: runNotes,
    });
  }
}

console.log(
  `${shouldDryRun ? "[dry-run] " : ""}done: ${upsertedCount} listing writes, ${imageCount} images attached, ${imageFailureCount} image fetch failures`,
);

function buildApartment(run, listing, searchRunId) {
  const lastVerifiedAt = dateToTimestamp(
    listing.lastVerifiedAt ?? listing.verifiedOn ?? run.runDate,
  );
  const provider = listing.provider ?? providerFromUrl(listing.url);
  const price = listing.price ?? listing.priceMin;
  const sourceKey = listing.key ?? sourceKeyFromUrl(listing.url);
  const statusDecision = tightenedStatusDecision(listing);
  const status = statusDecision.status;
  const track = listing.track ?? "unknown";
  const priceProperties = compact([
    listing.priceDisplay &&
      propertyValue("priceDisplay", listing.priceDisplay),
    listing.priceMin &&
      listing.priceMax &&
      propertyValue("priceRange", `${listing.priceMin}-${listing.priceMax}`, "USD"),
  ]);
  const listingProperties = compact([
    listing.neighborhood && propertyValue("neighborhood", listing.neighborhood),
    listing.unit && propertyValue("unit", listing.unit),
    listing.runLabel && propertyValue("runLabel", listing.runLabel),
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
      amenityFeature: listing.amenities?.map((name) => ({
        name,
        value: true,
      })),
      petsAllowed: listing.petsAllowed,
      tourBookingPage: listing.tourUrl,
      additionalProperty: compact([
        listing.layout && propertyValue("layout", listing.layout),
        listing.areaDisplay && propertyValue("areaDisplay", listing.areaDisplay),
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
        lastVerifiedAt,
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
      rawNotes: compactLines([listing.notes, listing.rawNotes]).join("\n"),
    },
    tags: compact([run.id, run.runDate, listing.neighborhood, ...(listing.tags ?? [])]),
    searchRunId,
  });
}

async function attachPageImages(client, apartmentId, listing, options) {
  const existingImages = await client.query(api.images.listForApartment, {
    apartmentId,
  });
  const existingSources = new Set(
    existingImages.map((image) => image.sourceUrl).filter(Boolean),
  );
  const remainingSlots = Math.max(0, options.imageLimit - existingImages.length);

  if (remainingSlots === 0) {
    return { attached: 0, failures: 0 };
  }

  let failures = 0;
  const pageImages = await extractPageImages(listing.url);
  if (pageImages.error) {
    console.warn(`  image page fetch failed for ${listing.url}: ${pageImages.error}`);
    failures += 1;
  }

  const discoveredCandidates =
    options.shouldSearchImages && (pageImages.candidates?.length ?? 0) < remainingSlots
      ? await discoverSearchImageCandidates(listing)
      : [];
  const candidates = uniqueCandidates([
    ...(pageImages.candidates ?? []),
    ...discoveredCandidates,
  ])
    .filter((candidate) => !existingSources.has(candidate.url))
    .slice(0, remainingSlots);

  let attached = 0;

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

      if (options.imageStorage === "r2") {
        const order = existingImages.length + attached;
        const key = r2ObjectKey({
          apartmentId,
          sourceUrl: candidate.url,
          bytes: downloaded.bytes,
          contentType: downloaded.contentType,
          order,
        });
        const uploaded = await putR2Object(options.r2Client, {
          bucket: options.r2Config.bucket,
          key,
          bytes: downloaded.bytes,
          contentType: downloaded.contentType,
          sourceUrl: candidate.url,
        });

        await client.mutation(api.images.attachR2, {
          apartmentId,
          bucket: options.r2Config.bucket,
          key,
          contentUrl: r2ContentUrl(key, options.r2Config),
          etag: uploaded.etag,
          contentLength: downloaded.bytes.byteLength,
          kind: candidate.kind ?? imageKindFromUrl(candidate.url),
          sourceUrl: candidate.url,
          order,
          image: {
            name: `${listing.name} image ${order + 1}`,
            caption: candidate.caption,
            encodingFormat: downloaded.contentType,
            representativeOfPage: order === 0,
          },
        });
      } else {
        const uploadUrl = await client.mutation(api.images.generateUploadUrl, {});
        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": downloaded.contentType },
          body: downloaded.bytes,
        });

        if (!uploadResponse.ok) {
          failures += 1;
          console.warn(
            `  convex upload failed for ${candidate.url}: ${uploadResponse.status}`,
          );
          continue;
        }

        const { storageId } = await uploadResponse.json();
        await client.mutation(api.images.attach, {
          apartmentId,
          storageId,
          kind: candidate.kind ?? imageKindFromUrl(candidate.url),
          sourceUrl: candidate.url,
          order: existingImages.length + attached,
          image: {
            name: `${listing.name} image ${existingImages.length + attached + 1}`,
            caption: candidate.caption,
            encodingFormat: downloaded.contentType,
            representativeOfPage: existingImages.length + attached === 0,
          },
        });
      }
      attached += 1;
    } catch (error) {
      failures += 1;
      console.warn(`  image attach failed for ${candidate.url}: ${error.message}`);
    }

    await delay(REQUEST_DELAY_MS);
  }

  return { attached, failures };
}

async function extractPageImages(pageUrl) {
  try {
    const response = await fetch(pageUrl, {
      headers: requestHeaders(pageUrl),
      redirect: "follow",
    });

    if (!response.ok) {
      return { urls: [], error: `${response.status} ${response.statusText}` };
    }

    const html = await response.text();
    const finalUrl = response.url ?? pageUrl;
    return {
      candidates: collectImageUrls(html, finalUrl).map((url) => ({
        url,
        referer: finalUrl,
        caption: `Image from ${hostname(finalUrl)}.`,
      })),
    };
  } catch (error) {
    return { candidates: [], error: error.message };
  }
}

async function discoverSearchImageCandidates(listing) {
  const candidates = [];
  const queries = buildImageSearchQueries(listing);

  for (const query of queries) {
    candidates.push(...(await searchBingImages(query, listing)));

    const pages = await searchResultPages(query);
    for (const pageUrl of pages.slice(0, SEARCH_RESULT_PAGE_LIMIT)) {
      const pageImages = await extractPageImages(pageUrl);
      candidates.push(
        ...(pageImages.candidates ?? []).map((candidate) => ({
          ...candidate,
          kind: "building",
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
      score: candidate.score ?? scoreImageCandidate(candidate.url, listing, candidate.referer),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, SEARCH_DIRECT_IMAGE_LIMIT);
}

function buildImageSearchQueries(listing) {
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

async function searchResultPages(query) {
  const urls = [];
  const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(searchUrl, {
      headers: requestHeaders(searchUrl),
      redirect: "follow",
    });
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
  } catch (error) {
    console.warn(`  search page failed for "${query}": ${error.message}`);
  }

  return unique(urls).slice(0, SEARCH_RESULT_PAGE_LIMIT);
}

async function searchBingImages(query, listing) {
  const candidates = [];
  const searchUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2`;

  try {
    const response = await fetch(searchUrl, {
      headers: requestHeaders(searchUrl),
      redirect: "follow",
    });
    if (!response.ok) {
      return [];
    }

    const html = decodeHtml(await response.text());
    for (const match of html.matchAll(/\bm="({[^"]+})"/gi)) {
      try {
        const item = JSON.parse(match[1]);
        if (!item.murl || !isUsefulImageUrl(item.murl)) {
          continue;
        }
        const sourcePage = item.purl ?? searchUrl;
        candidates.push({
          url: item.murl,
          referer: sourcePage,
          kind: "building",
          caption: `Search-discovered building/location image from ${hostname(sourcePage)}.`,
          score: scoreImageCandidate(
            `${item.murl} ${item.t ?? ""}`,
            listing,
            sourcePage,
          ),
        });
      } catch {
        // Bing sometimes emits partial metadata records; the murl regex below is the fallback.
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
  } catch (error) {
    console.warn(`  image search failed for "${query}": ${error.message}`);
  }

  return uniqueCandidates(candidates)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, SEARCH_DIRECT_IMAGE_LIMIT);
}

function collectImageUrls(html, pageUrl) {
  const urls = [];

  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributesFromTag(tag[0]);
    const name = (attrs.property ?? attrs.name ?? "").toLowerCase();
    if (
      ["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"].includes(
        name,
      ) &&
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
      // Some listing pages include invalid JSON-LD; meta and img tags still cover those pages.
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
      .filter(Boolean)
      .filter(isUsefulImageUrl),
  );
}

function collectJsonLdImages(node, urls) {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectJsonLdImages(item, urls);
    }
    return;
  }

  if (node === null || typeof node !== "object") {
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

function scoreImageCandidate(imageUrl, listing, sourcePage) {
  const haystack = [
    imageUrl,
    sourcePage,
    hostname(imageUrl),
    hostname(sourcePage),
  ]
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
  if (listing.url && hostname(sourcePage) === hostname(listing.url)) {
    score += 35;
  }
  if (/streeteasy|equityapartments|avalon|stonehenge|brodsky|chelsea29|eve\.nyc|rockrose|apartments|zillow|trulia/i.test(haystack)) {
    score += 20;
  }
  if (/building|exterior|facade|amenity|lobby|roof|residence|apartment|gallery|photo/i.test(haystack)) {
    score += 16;
  }
  if (/floor[-_ ]?plan|floorplan|plan/i.test(haystack)) {
    score += 10;
  }
  if (/logo|icon|sprite|avatar|map|marker|staticmap|placeholder|default/i.test(haystack)) {
    score -= 80;
  }
  if (/unsplash|pexels|shutterstock|stock/i.test(haystack)) {
    score -= 40;
  }

  return score;
}

function termsForListing(listing) {
  return unique(
    compact([
      listing.name,
      listing.streetAddress,
      listing.neighborhood,
      listing.provider,
    ])
      .flatMap((value) =>
        String(value)
          .toLowerCase()
          .replace(/[#.,]/g, " ")
          .split(/\s+/),
      )
      .filter((term) => !["new", "york", "ny", "street", "st", "avenue", "ave", "apartment", "apartments"].includes(term)),
  );
}

async function downloadImage(imageUrl, referer) {
  const response = await fetch(imageUrl, {
    headers: requestHeaders(referer),
    redirect: "follow",
  });

  if (!response.ok) {
    console.warn(`  image download failed for ${imageUrl}: ${response.status}`);
    return null;
  }

  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (!contentType.startsWith("image/")) {
    return null;
  }

  const contentLength = Number(response.headers.get("content-length"));
  if (contentLength > MAX_IMAGE_BYTES) {
    console.warn(`  image too large for ${imageUrl}: ${contentLength} bytes`);
    return null;
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    console.warn(`  image too large for ${imageUrl}: ${bytes.byteLength} bytes`);
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

async function findExistingSearchRun(client, runId, startedAt) {
  const runs = await client.query(api.searchRuns.list, {});
  return runs.find((run) => run.notes?.includes(`automationRunId:${runId}`));
}

function attributesFromTag(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attrs[match[1].toLowerCase()] = decodeHtml(
      match[3] ?? match[4] ?? match[5] ?? "",
    );
  }
  return attrs;
}

function urlsFromSrcset(srcset) {
  return srcset
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function decodeDuckDuckGoUrl(rawUrl, baseUrl) {
  try {
    const parsedUrl = new URL(rawUrl, baseUrl);
    const uddg = parsedUrl.searchParams.get("uddg");
    return uddg ? new URL(uddg).toString() : parsedUrl.toString();
  } catch {
    return null;
  }
}

function isUsefulResultPage(url) {
  try {
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return false;
    }

    if (/duckduckgo|bing|google|yahoo|facebook|instagram|tiktok|pinterest|youtube|x\.com|twitter/i.test(parsedUrl.hostname)) {
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

function normalizeImageUrl(rawUrl, pageUrl) {
  if (!rawUrl || rawUrl.startsWith("data:") || rawUrl.startsWith("blob:")) {
    return null;
  }

  try {
    return new URL(decodeHtml(rawUrl), pageUrl).toString();
  } catch {
    return null;
  }
}

function isUsefulImageUrl(url) {
  if (!url.startsWith("http")) {
    return false;
  }

  if (/(\.svg|favicon|sprite|logo|icon|transparent|placeholder|mapbox|googleapis|\/path\/to\/|office-photo)/i.test(url)) {
    return false;
  }

  return true;
}

function imageDimensions(bytes, contentType) {
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

function jpegDimensions(bytes) {
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      break;
    }

    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
        0xce, 0xcf,
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

function imageKindFromUrl(url) {
  if (/floor[-_ ]?plan|floorplan|plan/i.test(url)) {
    return "floor_plan";
  }

  if (/building|exterior|amenity|lobby|roof|gym/i.test(url)) {
    return "building";
  }

  return "photo";
}

function sourceKeyFromUrl(url) {
  const parsedUrl = new URL(url);
  const host = parsedUrl.hostname.replace(/^www\./, "");
  return `${host}:${parsedUrl.pathname.replace(/\/$/, "")}`;
}

function providerFromUrl(url) {
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

function categoryForTrack(track) {
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

function freshnessForStatus(status) {
  if (status === "excluded") {
    return "stale_or_mismatch";
  }
  return "verified_live";
}

function tightenedStatusDecision(listing) {
  const originalStatus = listing.status ?? "monitor";
  if (originalStatus !== "shortlist") {
    return { status: originalStatus };
  }

  const track = listing.track ?? "unknown";
  const price = listing.price ?? listing.priceMin;
  const bedrooms = listing.bedrooms;
  const bathrooms = listing.bathrooms ?? listing.fullBathrooms;
  const squareFeet = listing.squareFeet ?? listing.squareFeetMax ?? listing.squareFeetMin;
  const freshness = listing.freshness ?? freshnessForStatus(originalStatus);
  const caveats = (listing.caveats ?? []).join(" ");

  if (freshness !== "verified_live") {
    return { status: "monitor", reason: "availability is not verified live" };
  }
  if (track === "unknown") {
    return { status: "monitor", reason: "track is not a known 1BR/2BR/3BR fit" };
  }
  if (hasHardShortlistCaveat(caveats)) {
    return { status: "monitor", reason: "unresolved must-have or layout caveat" };
  }

  if (track === "1br") {
    if (bedrooms !== 1 || bathrooms < 1) {
      return { status: "monitor", reason: "does not verify as a clean 1BR" };
    }
    if (price === undefined || price > 6000) {
      return { status: "monitor", reason: "outside 1BR hard cap" };
    }
    if (listing.photoConfidence !== "high" || listing.floorPlanConfidence !== "high") {
      return {
        status: "monitor",
        reason: "photos and floor plan are not both high confidence",
      };
    }
    if (squareFeet !== undefined && squareFeet < 620) {
      return { status: "monitor", reason: "1BR size is below the stricter fit bar" };
    }
    return { status: "shortlist" };
  }

  if (track === "2br") {
    if (bedrooms !== 2 || bathrooms < 2) {
      return { status: "monitor", reason: "2BR shortlist now requires 2BR/2BA" };
    }
    if (price === undefined || price > 9000) {
      return { status: "monitor", reason: "outside 2BR budget" };
    }
    if (listing.photoConfidence !== "high" || listing.floorPlanConfidence !== "high") {
      return {
        status: "monitor",
        reason: "2BR needs high-confidence photos and floor plan",
      };
    }
    if (squareFeet !== undefined && squareFeet < 900) {
      return { status: "monitor", reason: "2BR living area is below the stricter fit bar" };
    }
    return { status: "shortlist" };
  }

  if (track === "3br") {
    if (bedrooms < 3 || bathrooms < 3) {
      return { status: "monitor", reason: "3BR shortlist now requires a true 3BR/3BA" };
    }
    if (price === undefined || price > 15000) {
      return { status: "monitor", reason: "outside 3BR stretch budget" };
    }
    if (!isCoreNeighborhood(listing.neighborhood)) {
      return { status: "monitor", reason: "outside the core neighborhood set" };
    }
    if (listing.photoConfidence !== "high" || listing.floorPlanConfidence !== "high") {
      return {
        status: "monitor",
        reason: "3BR needs high-confidence photos and floor plan",
      };
    }
    return { status: "shortlist" };
  }

  return { status: "monitor", reason: "does not match a strict shortlist track" };
}

function hasHardShortlistCaveat(caveats) {
  return /no square footage|no floor plan|no dimensions|not explicit|could not verify|no clean explicit|income-restricted|only one bathroom|only two bathrooms|misses the third|not a true|currently configured|model photos|floor-plan-level only|broken price|call-for-pricing|outside core|outside preferred/i.test(
    caveats,
  );
}

function isCoreNeighborhood(neighborhood) {
  if (!neighborhood) {
    return false;
  }
  return /chelsea|west village|east village|lower east side|soho|noho|tribeca|little italy|greenwich village|gramercy|flatiron|stuy/i.test(
    neighborhood,
  );
}

function buildAddress(listing) {
  return prune({
    streetAddress: listing.streetAddress,
    addressLocality: listing.addressLocality ?? "New York",
    addressRegion: listing.addressRegion ?? "NY",
    postalCode: listing.postalCode,
    addressCountry: listing.addressCountry ?? "US",
  });
}

function propertyValue(name, value, unitText) {
  return prune({ name, value, unitText });
}

function dateToTimestamp(date) {
  if (typeof date === "number") {
    return date;
  }
  return new Date(`${date}T09:00:00-04:00`).getTime();
}

function requestHeaders(referer) {
  return {
    "User-Agent": USER_AGENT,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: referer,
  };
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function decodeJsonString(value) {
  try {
    return JSON.parse(`"${value.replaceAll('"', '\\"')}"`);
  } catch {
    return value
      .replaceAll("\\/", "/")
      .replaceAll("\\u0026", "&")
      .replaceAll("\\u003d", "=");
  }
}

function parseArgs(rawArgs) {
  return rawArgs.reduce((parsed, arg) => {
    if (!arg.startsWith("--")) {
      parsed.file = arg;
      return parsed;
    }

    const [key, value] = arg.slice(2).split("=");
    parsed[key] = value ?? true;
    return parsed;
  }, {});
}

function unique(items) {
  return [...new Set(items)];
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  const next = [];
  for (const candidate of candidates) {
    if (!candidate?.url || seen.has(candidate.url) || !isUsefulImageUrl(candidate.url)) {
      continue;
    }
    seen.add(candidate.url);
    next.push(candidate);
  }
  return next;
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function compact(items) {
  return items.filter(Boolean);
}

function compactLines(items) {
  return compact(items).map((item) => String(item).trim()).filter(Boolean);
}

function prune(value) {
  if (Array.isArray(value)) {
    return value.map(prune).filter((item) => item !== undefined);
  }

  if (value && typeof value === "object") {
    const next = {};
    for (const [key, item] of Object.entries(value)) {
      const pruned = prune(item);
      if (pruned !== undefined) {
        next[key] = pruned;
      }
    }
    return next;
  }

  return value === undefined ? undefined : value;
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
