/**
 * Convert adapter output (RawListing) into the CompactListing shape consumed
 * by `scripts/import-apartment-runs.mjs` (see docs/data-model.md).
 *
 * @typedef {Object} RawListing
 * @property {string} source        Adapter id, e.g. "kijiji".
 * @property {string} sourceId      Stable per-source identifier.
 * @property {string} url           Canonical listing URL.
 * @property {string} [title]
 * @property {string} [description]
 * @property {number} [price]       Monthly rent, numeric.
 * @property {string} [currency]
 * @property {number} [bedrooms]
 * @property {number} [bathrooms]
 * @property {string} [address]     Free-form address line.
 * @property {string} [city]
 * @property {string} [region]
 * @property {string} [country]
 * @property {number} [lat]
 * @property {number} [lon]
 * @property {string[]} [imageUrls]
 * @property {string[]} [amenities]
 * @property {string} [availability]
 * @property {string} [postedAt]
 * @property {string} [provider]    Display name of the source.
 */

/** Map a bedroom count to Alcove's bedroom track. */
export function trackForBedrooms(bedrooms) {
  if (bedrooms == null || Number.isNaN(bedrooms)) return "unknown";
  if (bedrooms <= 1) return "1br";
  if (bedrooms === 2) return "2br";
  return "3br";
}

/**
 * @param {RawListing} raw
 * @param {{ distanceKm?: number|null, nearLabel?: string, radiusKm?: number }} [meta]
 * @returns {object} CompactListing
 */
export function toCompactListing(raw, meta = {}) {
  const bedrooms = numberOrUndefined(raw.bedrooms);
  const commuteNote =
    meta.distanceKm != null
      ? `~${meta.distanceKm} km from ${meta.nearLabel ?? "target"}`
      : undefined;

  return prune({
    key: `${raw.source}:${raw.sourceId}`,
    url: raw.url,
    provider: raw.provider ?? raw.source,
    name: raw.title,
    description: raw.description,
    streetAddress: raw.address,
    neighborhood: raw.city,
    addressLocality: raw.city,
    addressRegion: raw.region,
    addressCountry: raw.country,
    // All scraped rows land as "monitor": they are unverified leads until a
    // human (or the AI pass) confirms them, so they never auto-shortlist.
    status: "monitor",
    track: trackForBedrooms(bedrooms),
    price: numberOrUndefined(raw.price),
    priceCurrency: raw.currency,
    bedrooms,
    bathrooms: numberOrUndefined(raw.bathrooms),
    amenities: raw.amenities?.length ? raw.amenities : undefined,
    availabilityStarts: raw.availability,
    freshness: "unverified",
    verificationNote: "Scraped listing lead; details not independently verified.",
    photoConfidence: raw.imageUrls?.length ? "medium" : "low",
    floorPlanConfidence: "low",
    commute: commuteNote ? { notes: commuteNote } : undefined,
    tags: prune([raw.source, raw.city]).filter(Boolean),
    notes: commuteNote,
    // Carried through for image attachment during import.
    imageUrls: raw.imageUrls?.length ? raw.imageUrls : undefined,
  });
}

function numberOrUndefined(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function prune(value) {
  if (Array.isArray(value)) return value.filter((v) => v !== undefined);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return value;
}
