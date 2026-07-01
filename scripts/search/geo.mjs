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
 * Geocode a free-form address/place string to `{ lat, lon }` or null.
 * Results are cached; failures are cached as null so we don't retry forever.
 */
export async function geocode(query, options = {}) {
  const key = (query ?? "").trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);

  // Throttle to respect Nominatim's 1 request/second policy.
  const since = Date.now() - lastCallAt;
  if (since < 1100) await delay(1100 - since);
  lastCallAt = Date.now();

  const url = `${NOMINATIM}?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
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
    const point = hit ? { lat: Number(hit.lat), lon: Number(hit.lon) } : null;
    cache.set(key, point);
    return point;
  } catch {
    cache.set(key, null);
    return null;
  }
}
