/**
 * Zillow adapter (US + Canada). Zillow's rentals search pages embed the full
 * result set in `__NEXT_DATA__` (searchPageState.cat1.searchResults
 * .listResults), so a plain fetch with browser headers returns structured
 * listings — buildings with unit mixes, prices, coordinates, and photos.
 *
 * Zillow carries a large share of purpose-built apartment-complex inventory
 * (much of what Apartments.com lists), which makes it the main key-free answer
 * for "complex" listings. Access can still be bot-checked from datacenter
 * IPs; failures surface as blind spots.
 */

import { fetchText, parseNextData, delay, DEFAULT_DELAY_MS } from "../http.mjs";

// Region names -> the abbreviation Zillow uses in its city slugs.
const REGION_ABBREVIATIONS = {
  // Canadian provinces
  "alberta": "AB", "british columbia": "BC", "manitoba": "MB",
  "new brunswick": "NB", "newfoundland and labrador": "NL",
  "nova scotia": "NS", "ontario": "ON", "prince edward island": "PE",
  "quebec": "QC", "saskatchewan": "SK",
  // US states
  "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
  "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
  "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
  "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
  "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
  "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
  "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE",
  "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", "ohio": "OH", "oklahoma": "OK", "oregon": "OR",
  "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
  "vermont": "VT", "virginia": "VA", "washington": "WA",
  "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
  "district of columbia": "DC",
};

export const id = "zillow";
export const label = "Zillow";

function regionAbbrev(criteria) {
  const region = (criteria.location?.region ?? "").trim();
  if (!region) return null;
  if (/^[A-Za-z]{2}$/.test(region)) return region.toUpperCase();
  return REGION_ABBREVIATIONS[region.toLowerCase()] ?? null;
}

export function supports(criteria) {
  const country = (criteria.location?.country ?? "").toUpperCase();
  const supportedCountry =
    country === "US" || country === "USA" || country === "CA" || country === "CANADA";
  return supportedCountry && Boolean(criteria.location?.city) && Boolean(regionAbbrev(criteria));
}

export function unsupportedReason(criteria) {
  const country = (criteria.location?.country ?? "").toUpperCase();
  if (country !== "US" && country !== "USA" && country !== "CA" && country !== "CANADA") {
    return "Zillow covers the US and Canada only.";
  }
  if (!regionAbbrev(criteria)) {
    return `Zillow needs a known state/province for "${criteria.location?.city}" (set location.region).`;
  }
  return "Zillow needs a search city (set location.city).";
}

export async function search(criteria, ctx = {}) {
  const log = ctx.log ?? (() => {});
  const limit = criteria.perSourceLimit || 60;
  const slug = `${criteria.location.city} ${regionAbbrev(criteria)}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const collected = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages && page <= 3; page += 1) {
    const url =
      page === 1
        ? `https://www.zillow.com/${slug}/rentals/`
        : `https://www.zillow.com/${slug}/rentals/${page}_p/`;
    const res = await fetchText(url, { timeoutMs: 25000 });
    if (!res.ok) {
      log(`zillow page ${page} failed (${res.status || res.error}).`);
      break;
    }
    const state = parseNextData(res.text)?.props?.pageProps?.searchPageState;
    const results = state?.cat1?.searchResults?.listResults;
    if (!Array.isArray(results) || !results.length) {
      if (page === 1) log("zillow returned no parseable results (layout change or bot check).");
      break;
    }
    totalPages = Math.min(Number(state?.cat1?.searchList?.totalPages) || 1, 3);
    const country = (criteria.location?.country ?? "US").toUpperCase().startsWith("CA")
      ? "CA"
      : "US";
    for (const result of results) collected.push(...normalize(result, country));
    if (collected.length >= limit) break;
    await delay(DEFAULT_DELAY_MS);
  }

  return collected.slice(0, limit);
}

/**
 * One Zillow result may be a single unit or a whole building with a unit mix.
 * Buildings are expanded into one row per advertised unit tier (price+beds)
 * so bedroom/price filtering works per-unit.
 */
function normalize(result, country) {
  if (result?.statusType && result.statusType !== "FOR_RENT") return [];
  const address = joinAddress(result);
  const urlPath = result.detailUrl ?? "";
  const url = urlPath.startsWith("http") ? urlPath : `https://www.zillow.com${urlPath}`;
  if (!urlPath) return [];
  const { amount: basePrice, currency } = parsePrice(
    result.unformattedPrice ?? result.price,
  );
  const images = [
    ...(result.carouselPhotos ?? []).map((p) => p?.url),
    result.imgSrc,
  ].filter(Boolean);
  const base = {
    source: "zillow",
    url,
    provider: "Zillow",
    address: result.addressStreet ?? address,
    city: result.addressCity,
    region: result.addressState,
    country,
    lat: result.latLong?.latitude,
    lon: result.latLong?.longitude,
    imageUrls: [...new Set(images)].slice(0, 8),
  };
  const buildingName = result.buildingName ?? result.communityName;
  const title = buildingName
    ? `${buildingName} — ${address}`
    : result.statusText && !/for rent/i.test(result.statusText)
      ? `${result.statusText} — ${address}`
      : address;

  const units = Array.isArray(result.units)
    ? result.units.filter((u) => u && !u.roomForRent)
    : [];
  if (!units.length) {
    return [
      {
        ...base,
        sourceId: String(result.zpid ?? result.id ?? url),
        title,
        price: basePrice,
        currency: currency ?? (country === "CA" ? "CAD" : "USD"),
        bedrooms: numeric(result.beds),
        bathrooms: numeric(result.baths),
        description: result.area ? `${result.area} sqft` : undefined,
      },
    ];
  }

  return units.slice(0, 4).map((unit) => {
    const { amount, currency: unitCurrency } = parsePrice(unit.price);
    const beds = numeric(unit.beds);
    return {
      ...base,
      sourceId: `${result.zpid ?? result.id ?? url}:${beds ?? "x"}br`,
      title: beds != null ? `${title} · ${beds === 0 ? "Studio" : `${beds} BR`}` : title,
      price: amount,
      currency: unitCurrency ?? currency ?? (country === "CA" ? "CAD" : "USD"),
      bedrooms: beds,
      description: typeof unit.price === "string" && unit.price.includes("+")
        ? "Starting price for this unit type; see building page for exact units."
        : undefined,
    };
  });
}

function joinAddress(result) {
  if (result.address) return result.address;
  return [result.addressStreet, result.addressCity, result.addressState]
    .filter(Boolean)
    .join(", ");
}

/** "C$1,600+" / "$2,400/mo" / 2400 -> { amount, currency } */
function parsePrice(value) {
  if (typeof value === "number") return { amount: value, currency: undefined };
  if (typeof value !== "string") return { amount: undefined, currency: undefined };
  const currency = value.includes("C$") ? "CAD" : value.includes("$") ? "USD" : undefined;
  const m = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return { amount: m ? Number(m[1]) : undefined, currency };
}

function numeric(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
