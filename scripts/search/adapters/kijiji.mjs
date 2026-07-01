/**
 * Kijiji adapter (Canada). Kijiji is a Next.js app that embeds its search
 * results as Apollo state inside `__NEXT_DATA__`, so a single `fetch` + JSON
 * parse yields fully-structured listings — no headless browser or key needed.
 *
 * Region support: Canada. Cities are mapped to Kijiji's location code below;
 * add entries to extend coverage. Unknown cities are skipped with a note.
 */

import { fetchText, parseNextData, delay, DEFAULT_DELAY_MS } from "../http.mjs";

// city (lowercase) -> { slug, locationId } for the apartments/condos category.
const CITY_CODES = {
  "kitchener": { slug: "kitchener-waterloo", locationId: 1700212 },
  "waterloo": { slug: "kitchener-waterloo", locationId: 1700212 },
  "cambridge": { slug: "kitchener-waterloo", locationId: 1700212 },
  "toronto": { slug: "city-of-toronto", locationId: 1700273 },
  "ottawa": { slug: "ottawa", locationId: 1700185 },
  "hamilton": { slug: "hamilton", locationId: 80014 },
  "london": { slug: "london", locationId: 1700214 },
  "guelph": { slug: "guelph", locationId: 1700242 },
  "vancouver": { slug: "greater-vancouver-area", locationId: 80003 },
  "calgary": { slug: "calgary", locationId: 1700199 },
  "edmonton": { slug: "edmonton", locationId: 1700203 },
  "montreal": { slug: "city-of-montreal", locationId: 1700281 },
};

export const id = "kijiji";
export const label = "Kijiji";

export function supports(criteria) {
  const country = (criteria.location?.country ?? "").toUpperCase();
  const city = (criteria.location?.city ?? "").toLowerCase();
  return (country === "CA" || country === "CANADA") && Boolean(CITY_CODES[city]);
}

export function unsupportedReason(criteria) {
  const city = (criteria.location?.city ?? "").toLowerCase();
  if ((criteria.location?.country ?? "").toUpperCase() !== "CA") {
    return "Kijiji adapter currently supports Canada only.";
  }
  if (!CITY_CODES[city]) {
    return `No Kijiji location code for "${criteria.location?.city}". Add one to CITY_CODES in adapters/kijiji.mjs.`;
  }
  return null;
}

export async function search(criteria, ctx = {}) {
  const log = ctx.log ?? (() => {});
  const city = criteria.location.city.toLowerCase();
  const { slug, locationId } = CITY_CODES[city];
  const limit = criteria.perSourceLimit || 60;
  const pages = Math.min(3, Math.ceil(limit / 40) || 1);

  const collected = [];
  for (let page = 1; page <= pages; page += 1) {
    const url = buildUrl(slug, locationId, criteria, page);
    const res = await fetchText(url);
    if (!res.ok) {
      log(`kijiji page ${page} failed: ${res.error}`);
      break;
    }
    const listings = extractListings(res.text);
    if (!listings.length) break;
    collected.push(...listings);
    if (collected.length >= limit) break;
    await delay(DEFAULT_DELAY_MS);
  }

  return collected.slice(0, limit).map((raw) => normalize(raw)).filter(Boolean);
}

function buildUrl(slug, locationId, criteria, page) {
  const params = new URLSearchParams({ ad: "offering" });
  if (criteria.maxPrice) params.set("price", `__${Math.round(criteria.maxPrice)}`);
  const pagePart = page > 1 ? `/page-${page}` : "";
  return `https://www.kijiji.ca/b-apartments-condos/${slug}${pagePart}/c37l${locationId}?${params}`;
}

function extractListings(html) {
  const nextData = parseNextData(html);
  const apollo = nextData?.props?.pageProps?.__APOLLO_STATE__;
  if (!apollo) return [];
  return Object.entries(apollo)
    .filter(([key]) => key.startsWith("RealEstateListing:"))
    .map(([, value]) => value)
    .filter((v) => v && v.url);
}

function normalize(raw) {
  const attrs = attrMap(raw.attributes?.all);
  const bedrooms = parseBedrooms(attrs.numberbedrooms);
  const bathrooms = parseBathrooms(attrs.numberbathrooms);
  const amenities = collectAmenities(attrs);
  const loc = raw.location ?? {};

  return {
    source: "kijiji",
    sourceId: String(raw.id),
    url: raw.url,
    provider: "Kijiji",
    title: raw.title,
    description: raw.description,
    price: raw.price?.amount != null ? raw.price.amount / 100 : undefined,
    currency: "CAD",
    bedrooms,
    bathrooms,
    address: loc.address,
    city: loc.name,
    region: "ON",
    country: "CA",
    lat: loc.latitude ?? loc.mapLatitude,
    lon: loc.longitude ?? loc.mapLongitude,
    imageUrls: (raw.imageUrls ?? [])
      .map((u) => u.replace(/rule=kijijica-\d+-jpg/, "rule=kijijica-960-jpg"))
      .slice(0, 8),
    amenities: amenities.length ? amenities : undefined,
    availability: attrs.dateavailable,
    postedAt: raw.activationDate,
  };
}

function attrMap(all = []) {
  const map = {};
  for (const a of all) {
    const values = a.canonicalValues ?? [];
    map[a.canonicalName] = values.length === 1 ? values[0] : values;
  }
  return map;
}

function parseBedrooms(value) {
  if (value == null) return undefined;
  const v = String(Array.isArray(value) ? value[0] : value).toLowerCase();
  if (v.includes("bachelor") || v === "0") return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

function parseBathrooms(value) {
  if (value == null) return undefined;
  const raw = parseFloat(Array.isArray(value) ? value[0] : value);
  if (!Number.isFinite(raw)) return undefined;
  // Kijiji encodes bathrooms x10 (e.g. "15" = 1.5, "20" = 2).
  return raw >= 10 ? raw / 10 : raw;
}

const AMENITY_LABELS = {
  laundryinunit: "In-unit laundry",
  laundryinbuilding: "Laundry in building",
  dishwasher: "Dishwasher",
  airconditioning: "Air conditioning",
  balcony: "Balcony",
  elevator: "Elevator",
  furnished: "Furnished",
  petsallowed: "Pets allowed",
  parkingincluded: "Parking included",
  wheelchairaccessible: "Wheelchair accessible",
  gym: "Gym",
  pool: "Pool",
};

function collectAmenities(attrs) {
  const out = [];
  for (const [key, label] of Object.entries(AMENITY_LABELS)) {
    const val = attrs[key];
    if (val === "1" || val === "true" || val === "yes") out.push(label);
  }
  return out;
}
