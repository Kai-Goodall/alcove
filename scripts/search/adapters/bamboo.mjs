/**
 * Bamboo Housing adapter (bamboohousing.ca) — Canadian student/shared housing,
 * strongest in university towns (Waterloo, Guelph, London, Kingston, ...).
 *
 * Bamboo is a Next.js app; its `/homepage` route embeds the city's listings in
 * `__NEXT_DATA__.props.pageProps.listings`, so a plain `fetch` + JSON parse
 * returns structured rows. No key or browser needed. Listings render in a
 * modal (no per-listing URL), so we key by the listing `_id`.
 */

import { fetchText, parseNextData, delay, DEFAULT_DELAY_MS } from "../http.mjs";

// Cities Bamboo covers (from its own city list).
const CITIES = new Set([
  "calgary", "edmonton", "guelph", "hamilton", "kingston", "london",
  "montreal", "niagara", "ottawa", "toronto", "vancouver", "waterloo",
  "kitchener", "cambridge",
]);

// Bamboo groups Kitchener/Cambridge under the Waterloo market.
const CITY_ALIASES = { kitchener: "Waterloo", cambridge: "Waterloo" };

export const id = "bamboo";
export const label = "Bamboo Housing";

export function supports(criteria) {
  const country = (criteria.location?.country ?? "").toUpperCase();
  const city = (criteria.location?.city ?? "").toLowerCase();
  return (country === "CA" || country === "CANADA") && CITIES.has(city);
}

export function unsupportedReason(criteria) {
  if ((criteria.location?.country ?? "").toUpperCase() !== "CA") {
    return "Bamboo Housing serves Canada only.";
  }
  return `Bamboo Housing does not list "${criteria.location?.city}".`;
}

export async function search(criteria, ctx = {}) {
  const log = ctx.log ?? (() => {});
  const cityRaw = criteria.location.city.toLowerCase();
  const cityName = CITY_ALIASES[cityRaw] ?? titleCase(cityRaw);
  const limit = criteria.perSourceLimit || 60;

  const collected = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages && page <= 4; page += 1) {
    const url = `https://bamboohousing.ca/homepage?CityName=${encodeURIComponent(
      cityName,
    )}&Sort=Recent&page=${page}`;
    const res = await fetchText(url);
    if (!res.ok) {
      log(`bamboo page ${page} failed: ${res.error}`);
      break;
    }
    const props = parseNextData(res.text)?.props?.pageProps;
    if (!props) break;
    totalPages = Number(props.totalPages) || totalPages;
    const listings = props.listings ?? [];
    if (!listings.length) break;
    collected.push(...listings.map((l) => normalize(l, cityName)));
    if (collected.length >= limit) break;
    await delay(DEFAULT_DELAY_MS);
  }

  return collected.filter(Boolean).slice(0, limit);
}

function normalize(l, cityName) {
  if (!l?._id) return null;
  const images = [l.MainUrl, ...(l.ImageUrls ?? [])].filter(Boolean);
  const availability = [l.StartTerm, l.RentDuration].filter(Boolean).join(" · ");
  const amenities = [];
  if (l.Ensuite) amenities.push("Ensuite");
  if (l.Coed) amenities.push("Co-ed");
  if (l.Utilities) amenities.push("Utilities included");

  return {
    source: "bamboo",
    sourceId: String(l._id),
    // No per-listing route; link to the city page where the modal opens.
    url: `https://bamboohousing.ca/homepage?CityName=${encodeURIComponent(cityName)}`,
    provider: "Bamboo Housing",
    title: l.Title,
    description: l.Description,
    price: numberOrUndefined(l.Price),
    currency: "CAD",
    bedrooms: numberOrUndefined(l.TotalBedrooms ?? l.RoomsAvailable),
    address: l.Address,
    city: cityName,
    region: "ON",
    country: "CA",
    imageUrls: dedupe(images).slice(0, 8),
    amenities: amenities.length ? amenities : undefined,
    availability: availability || undefined,
    postedAt: l.PostedDate,
  };
}

function numberOrUndefined(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function dedupe(arr) {
  return [...new Set(arr)];
}

function titleCase(s) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
