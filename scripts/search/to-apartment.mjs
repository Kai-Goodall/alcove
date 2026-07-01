/**
 * Convert a CompactListing (engine output) into the argument shape expected by
 * the Convex `api.apartments.upsert` mutation. Run-agnostic so it can be used
 * by the in-app search route (the CLI path goes through import-apartment-runs).
 */

import { trackForBedrooms } from "./normalize.mjs";

const AVAILABILITY_BY_STATUS = {
  shortlist: "https://schema.org/InStock",
  monitor: "https://schema.org/LimitedAvailability",
  excluded: "https://schema.org/Discontinued",
  archived: "https://schema.org/Discontinued",
};

/**
 * @param {object} listing CompactListing from the engine.
 * @param {{ searchRunId?: string, lastVerifiedAt?: number }} [options]
 */
export function compactToApartmentInput(listing, options = {}) {
  const status = listing.status ?? "monitor";
  const track = listing.track ?? trackForBedrooms(listing.bedrooms);
  const sourceKey = listing.key ?? sourceKeyFromUrl(listing.url);
  const now = options.lastVerifiedAt ?? Date.now();

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
      provider: listing.provider,
      additionalProperty: compact([
        listing.neighborhood && property("neighborhood", listing.neighborhood),
      ]),
    },
    apartment: {
      name: listing.name,
      description: listing.description ?? listing.notes,
      accommodationCategory: categoryForTrack(track),
      address: prune({
        streetAddress: listing.streetAddress,
        addressLocality: listing.addressLocality ?? listing.neighborhood,
        addressRegion: listing.addressRegion,
        postalCode: listing.postalCode,
        addressCountry: listing.addressCountry,
      }),
      numberOfBedrooms: listing.bedrooms,
      numberOfBathroomsTotal: listing.bathrooms,
      amenityFeature: listing.amenities?.map((name) => ({ name, value: true })),
    },
    offer: {
      url: listing.url,
      price: listing.price ?? listing.priceMin,
      priceCurrency: listing.priceCurrency ?? "USD",
      availability: listing.availability ?? AVAILABILITY_BY_STATUS[status],
      availabilityStarts: listing.availabilityStarts,
      businessFunction: "LeaseOut",
    },
    assessment: {
      commute: listing.commute?.notes
        ? { toLocation: { name: listing.commute.label ?? "target" }, notes: listing.commute.notes }
        : undefined,
      verification: {
        freshness: listing.freshness ?? "unverified",
        note: listing.verificationNote,
        lastVerifiedAt: now,
      },
      confidence: {
        photos: listing.photoConfidence ?? "unknown",
        floorPlan: listing.floorPlanConfidence ?? "unknown",
      },
      caveats: listing.caveats,
      rawNotes: listing.rawNotes ?? listing.notes,
    },
    tags: listing.tags,
    searchRunId: options.searchRunId,
  });
}

function sourceKeyFromUrl(url) {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}:${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}

function categoryForTrack(track) {
  if (track === "1br") return "Apartment, 1 bedroom";
  if (track === "2br") return "Apartment, 2 bedroom";
  if (track === "3br") return "Apartment, 3 bedroom";
  return "Apartment";
}

function property(name, value) {
  return { name, value };
}

function compact(items) {
  return items.filter(Boolean);
}

function prune(value) {
  if (Array.isArray(value)) {
    const arr = value.map(prune).filter((v) => v !== undefined);
    return arr.length ? arr : undefined;
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const pruned = prune(v);
      if (pruned !== undefined) out[k] = pruned;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return value;
}
