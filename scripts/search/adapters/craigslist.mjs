/**
 * Craigslist adapter — uses Craigslist's own JSON search API.
 *
 * Craigslist retired its RSS feeds in 2023 and the HTML search page is now a
 * client-rendered SPA, so both older scraping paths are dead. The SPA loads
 * results from `sapi.craigslist.org` (no key, no login), and the official
 * `reference.craigslist.org/Areas` endpoint maps every Craigslist area to an
 * AreaID, so any Craigslist city works without a hand-maintained table.
 *
 * The API returns a compact packed format. Decoding (verified live):
 *   data.decode.minPostingId / minPostedDate — offsets for item ids/dates
 *   item[0] = postingId - minPostingId
 *   item[1] = postedDate - minPostedDate (seconds)
 *   item[3] = price (integer, in the area's currency)
 *   item[4] = "loc:desc~lat~lon" (indexes into decode.locations/-Descriptions)
 *   tagged sub-arrays: [4, ...imageIds], [5, bedrooms, sqft], [6, urlSlug],
 *   [10, formattedPrice]; the longest bare string is the title.
 *
 * Craigslist still rate-limits aggressively from datacenter IPs; failures are
 * reported as blind spots rather than failing the run.
 */

import { fetchJson } from "../http.mjs";

export const id = "craigslist";
export const label = "Craigslist";

const AREAS_URL = "https://reference.craigslist.org/Areas";
const SAPI_URL = "https://sapi.craigslist.org/web/v8/postings/search/full";

let areasPromise = null;

async function loadAreas() {
  if (!areasPromise) {
    areasPromise = (async () => {
      const res = await fetchJson(AREAS_URL, { timeoutMs: 25000 });
      if (!res.ok || !Array.isArray(res.data)) {
        areasPromise = null; // allow retry on the next run
        throw new Error(`could not load Craigslist area reference (${res.error ?? "bad data"})`);
      }
      return res.data;
    })();
  }
  return areasPromise;
}

function findArea(areas, city, country) {
  const needle = city.trim().toLowerCase();
  if (!needle) return null;
  // Same city name can exist in several countries (Waterloo ON vs Waterloo IA),
  // so restrict to the requested country when we know it.
  const cc = (country ?? "").toUpperCase();
  const pool = cc ? areas.filter((a) => (a.Country ?? "").toUpperCase() === cc) : areas;
  const fields = (a) =>
    [a.Hostname, a.ShortDescription, a.Description].filter(Boolean).map((s) => s.toLowerCase());
  // Exact field match first, then substring (e.g. "waterloo" ->
  // "kitchener-waterloo-cambridge"), then sub-area names.
  return (
    pool.find((a) => fields(a).includes(needle)) ??
    pool.find((a) => fields(a).some((f) => f.includes(needle))) ??
    pool.find((a) =>
      (a.SubAreas ?? []).some((s) =>
        [s.ShortDescription, s.Description].filter(Boolean).some(
          (f) => f.toLowerCase() === needle,
        ),
      ),
    ) ??
    null
  );
}

export function supports(criteria) {
  return Boolean(criteria.location?.city);
}

export function unsupportedReason() {
  return "Craigslist needs a search city (set location.city).";
}

export async function search(criteria, ctx = {}) {
  const log = ctx.log ?? (() => {});
  const city = criteria.location.city;
  const limit = criteria.perSourceLimit || 60;

  const areas = await loadAreas();
  const area = findArea(areas, city, criteria.location?.country);
  if (!area) {
    throw new Error(`no Craigslist area matches "${city}".`);
  }

  // The sapi endpoint only accepts its fixed page size of 360.
  const params = new URLSearchParams({
    batch: `${area.AreaID}-0-360-0-0`,
    cc: area.Country ?? "US",
    lang: "en",
    searchPath: "apa",
  });
  const res = await fetchJson(`${SAPI_URL}?${params}`, {
    referer: `https://${area.Hostname}.craigslist.org/`,
    timeoutMs: 25000,
  });
  if (!res.ok) {
    log(`craigslist blocked or unavailable (${res.status || res.error}).`);
    return [];
  }

  const data = res.data?.data;
  const decode = data?.decode;
  const items = data?.items;
  if (!decode || !Array.isArray(items)) {
    log("craigslist returned an unrecognized payload; skipping.");
    return [];
  }
  const currency = data?.areas?.[String(area.AreaID)]?.currency ?? (area.Country === "CA" ? "CAD" : "USD");

  return items
    .map((item) => decodeItem(item, { decode, area, currency }))
    .filter(Boolean)
    .slice(0, limit);
}

function decodeItem(item, { decode, area, currency }) {
  if (!Array.isArray(item) || item.length < 5) return null;
  const postingId =
    typeof item[0] === "number" ? (decode.minPostingId ?? 0) + item[0] : null;
  if (!postingId) return null;
  const postedAt =
    typeof item[1] === "number" && decode.minPostedDate
      ? new Date((decode.minPostedDate + item[1]) * 1000).toISOString()
      : undefined;
  const price = typeof item[3] === "number" && item[3] > 0 ? item[3] : undefined;

  // "loc:descIdx~lat~lon"
  let lat;
  let lon;
  let locationDescription;
  if (typeof item[4] === "string") {
    const [locPart, latPart, lonPart] = item[4].split("~");
    lat = numeric(latPart);
    lon = numeric(lonPart);
    const descIdx = numeric(locPart.split(":")[1]);
    if (descIdx && Array.isArray(decode.locationDescriptions)) {
      const desc = decode.locationDescriptions[descIdx];
      if (typeof desc === "string") locationDescription = desc;
    }
  }

  let slug;
  let bedrooms;
  let sqft;
  const imageIds = [];
  let title;
  for (const field of item.slice(5)) {
    if (Array.isArray(field)) {
      const [tag, ...rest] = field;
      if (tag === 6 && typeof rest[0] === "string") slug = rest[0];
      if (tag === 5) {
        bedrooms = numeric(rest[0]);
        sqft = numeric(rest[1]);
      }
      if (tag === 4) {
        for (const entry of rest) {
          if (typeof entry !== "string") continue;
          // "3:00m0m_h2qQuvjxu1y_0dd0cj" -> images.craigslist.org/00m0m_h2qQuvjxu1y_600x450.jpg
          const idPart = entry.split(":")[1];
          if (!idPart) continue;
          const segments = idPart.split("_");
          if (segments.length >= 2) {
            imageIds.push(`${segments[0]}_${segments[1]}`);
          }
        }
      }
    } else if (typeof field === "string") {
      // The title is the longest bare string in the tail of the record.
      if (!title || field.length > title.length) title = field;
    }
  }

  const url = `https://${area.Hostname}.craigslist.org/apa/d/${slug ?? "listing"}/${postingId}.html`;

  return {
    source: "craigslist",
    sourceId: String(postingId),
    url,
    provider: "Craigslist",
    title: title ?? slug ?? `Craigslist posting ${postingId}`,
    description: sqft ? `${sqft} sqft` : undefined,
    price,
    currency,
    bedrooms,
    address: locationDescription,
    city: locationDescription ?? area.ShortDescription,
    region: area.Region,
    country: area.Country,
    lat,
    lon,
    imageUrls: imageIds.slice(0, 8).map(
      (imageId) => `https://images.craigslist.org/${imageId}_600x450.jpg`,
    ),
    postedAt,
  };
}

function numeric(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
