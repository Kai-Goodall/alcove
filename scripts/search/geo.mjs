/**
 * Free geocoding + distance helpers for proximity filtering.
 *
 * Uses OpenStreetMap Nominatim (no API key). Per its usage policy we send a
 * descriptive User-Agent, cache results in-process, and throttle to ~1 req/s.
 * See https://operations.osmfoundation.org/policies/nominatim/.
 */

import { delay } from "./http.mjs";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const cache = new Map();
let lastCallAt = 0;

/** Kilometres between two {lat, lon} points (haversine). */
export function distanceKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.asin(Math.sqrt(h)) * 10) / 10;
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Geocode a free-form query to a detailed place record, or null:
 *   { lat, lon, city, countryCode ("CA"), regionCode ("ON"), regionName }
 * Results (including failures) are cached in-process.
 */
export async function geocodeFull(query, options = {}) {
  const key = (query ?? "").trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);

  // Throttle to respect Nominatim's 1 request/second policy.
  const since = Date.now() - lastCallAt;
  if (since < 1100) await delay(1100 - since);
  lastCallAt = Date.now();

  const url = `${NOMINATIM}?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": options.contact || "alcove-search",
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      cache.set(key, null);
      return null;
    }
    const data = await response.json();
    const hit = Array.isArray(data) && data[0];
    if (!hit) {
      cache.set(key, null);
      return null;
    }
    const address = hit.address ?? {};
    // "ISO3166-2-lvl4" looks like "CA-ON" / "US-NY" — the province/state code.
    const iso2 = Object.entries(address).find(([k]) => k.startsWith("ISO3166-2"))?.[1];
    const place = {
      lat: Number(hit.lat),
      lon: Number(hit.lon),
      city:
        address.city ?? address.town ?? address.village ?? address.municipality,
      countryCode: address.country_code
        ? address.country_code.toUpperCase()
        : undefined,
      regionCode:
        typeof iso2 === "string" && iso2.includes("-")
          ? iso2.split("-")[1]
          : undefined,
      regionName: address.state ?? address.province,
    };
    cache.set(key, place);
    return place;
  } catch {
    cache.set(key, null);
    return null;
  }
}

/**
 * Geocode a free-form address/place string to `{ lat, lon }` or null.
 * Results are cached; failures are cached as null so we don't retry forever.
 */
export async function geocode(query, options = {}) {
  const place = await geocodeFull(query, options);
  return place ? { lat: place.lat, lon: place.lon } : null;
}

/**
 * Resolve the effective search location when the user typed a city that may
 * not match the configured country/region (e.g. config says New York but the
 * search dialog says "Waterloo"). Geocodes the city once and fills in the
 * country/region so source adapters that gate on country work as expected.
 *
 * Bare city names are ambiguous ("Waterloo" is in Ontario, Iowa, and Belgium),
 * so pass `options.anchorQuery` (the proximity anchor, e.g. "University of
 * Waterloo") — its region/country disambiguate the city. Typing "City, ON" or
 * "City, Canada" also works; the city is normalized from the geocoder result.
 *
 * @param {{ city?: string, region?: string, country?: string }} requested
 * @param {{ city?: string, region?: string, country?: string, timezone?: string }} base
 * @param {{ contact?: string, anchorQuery?: string }} [options]
 */
export async function resolveLocation(requested, base = {}, options = {}) {
  const typedCity = requested.city?.trim();
  const explicitCountry = requested.country;
  const explicitRegion = requested.region;
  const cityChanged =
    typedCity &&
    typedCity.toLowerCase() !== (base.city ?? "").trim().toLowerCase();

  // City unchanged (or absent): the configured location already describes it;
  // just apply any explicit overrides. Same when the caller pinned both.
  if (!cityChanged || (explicitCountry && explicitRegion)) {
    return {
      ...base,
      city: bareCity(typedCity) ?? base.city,
      region: explicitRegion ?? base.region,
      country: explicitCountry ?? base.country,
    };
  }

  // Disambiguation hints, most specific first: explicit region/country, then
  // whatever place the proximity anchor resolves to.
  const anchor =
    !explicitRegion && !explicitCountry && options.anchorQuery
      ? await geocodeFull(options.anchorQuery, options)
      : null;
  const queries = [];
  if (explicitRegion || explicitCountry) {
    queries.push([typedCity, explicitRegion, explicitCountry].filter(Boolean).join(", "));
  }
  if (anchor?.countryCode) {
    queries.push(
      [typedCity, anchor.regionName ?? anchor.regionCode, anchor.countryCode]
        .filter(Boolean)
        .join(", "),
    );
  }
  queries.push(typedCity);

  let place = null;
  for (const query of queries) {
    place = await geocodeFull(query, options);
    if (place?.countryCode) break;
  }

  if (!place?.countryCode) {
    // Unresolvable — fall back to the explicit values or the configured base.
    return {
      ...base,
      city: bareCity(typedCity),
      region: explicitRegion ?? base.region,
      country: explicitCountry ?? base.country,
    };
  }
  return {
    ...base,
    city: place.city ?? bareCity(typedCity),
    region: explicitRegion ?? place.regionCode ?? place.regionName ?? base.region,
    country: explicitCountry ?? place.countryCode,
  };
}

/** "Waterloo, ON" -> "Waterloo" (adapters key on the bare city name). */
function bareCity(city) {
  return city ? city.split(",")[0].trim() : undefined;
}
