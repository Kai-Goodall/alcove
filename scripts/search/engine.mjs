/**
 * Search engine orchestrator.
 *
 * Given resolved criteria (from `buildSearchCriteria`), it runs each requested
 * source adapter, filters by bedrooms/price, geocodes + filters by proximity
 * (free, no key), dedupes across sources, and returns a result set plus a run
 * summary. The output `listings` are CompactListing objects ready for
 * `scripts/import-apartment-runs.mjs` or `api.apartments.upsert`.
 */

import { getAdapter } from "./adapters/index.mjs";
import { geocode, distanceKm } from "./geo.mjs";
import { toCompactListing } from "./normalize.mjs";

/**
 * @param {ReturnType<import("../../alcove.config.mjs").buildSearchCriteria>} criteria
 * @param {{ onProgress?: (msg: string) => void, aiEnrich?: Function }} [options]
 */
export async function runSearch(criteria, options = {}) {
  const log = options.onProgress ?? (() => {});
  const sourcesSearched = [];
  const blindSpots = [];
  let rawListings = [];

  // Anchor point for proximity filtering.
  let anchor = null;
  if (criteria.near?.query) {
    anchor = await geocode(criteria.near.query, { contact: criteria.geocodeContact });
    if (!anchor) blindSpots.push(`Could not geocode proximity anchor "${criteria.near.query}".`);
  }

  for (const sourceId of criteria.sources) {
    const adapter = getAdapter(sourceId);
    if (!adapter) {
      blindSpots.push(`Unknown source "${sourceId}".`);
      continue;
    }
    if (!adapter.supports(criteria)) {
      const reason = adapter.unsupportedReason?.(criteria) ?? "not supported for this region";
      blindSpots.push(`${adapter.label}: ${reason}`);
      log(`skip ${adapter.label}: ${reason}`);
      continue;
    }

    log(`searching ${adapter.label}…`);
    try {
      const found = await adapter.search(criteria, { log });
      log(`${adapter.label}: ${found.length} listing(s)`);
      sourcesSearched.push(adapter.label);
      if (!found.length) {
        blindSpots.push(`${adapter.label}: no listings returned (blocked, empty, or filtered).`);
      }
      rawListings.push(...found);
    } catch (error) {
      blindSpots.push(`${adapter.label}: ${error.message}`);
      log(`${adapter.label} errored: ${error.message}`);
    }
  }

  // Criteria filtering (bedrooms + price) — adapters filter best-effort, we
  // enforce here so every source is held to the same bar.
  let kept = rawListings.filter((l) => matchesCriteria(l, criteria));
  const droppedByCriteria = rawListings.length - kept.length;

  // Dedupe across sources.
  kept = dedupe(kept);

  // Proximity: geocode rows missing coordinates, then filter by radius.
  let withinRadius = 0;
  let outsideRadius = 0;
  const results = [];
  for (const raw of kept) {
    let dist = null;
    if (anchor) {
      let point = raw.lat != null && raw.lon != null ? { lat: raw.lat, lon: raw.lon } : null;
      if (!point && (raw.address || raw.city)) {
        point = await geocode(addressQuery(raw, criteria), { contact: criteria.geocodeContact });
      }
      dist = point ? distanceKm(anchor, point) : null;
      if (dist != null && criteria.radiusKm && dist > criteria.radiusKm) {
        outsideRadius += 1;
        continue;
      }
      if (dist != null) withinRadius += 1;
    }
    results.push(
      toCompactListing(raw, {
        distanceKm: dist,
        nearLabel: criteria.near?.label,
        radiusKm: criteria.radiusKm,
      }),
    );
  }

  // Rank: closest first when we have distance, else keep source order.
  results.sort((a, b) => distOf(a) - distOf(b));
  results.forEach((r, i) => {
    r.rank = i + 1;
  });

  let aiSummary = null;
  if (options.aiEnrich) {
    log("running AI enrichment pass…");
    const enriched = await options.aiEnrich({ results, criteria, log });
    if (enriched?.listings) {
      return finalize(enriched.listings, {
        sourcesSearched: [...sourcesSearched, ...(enriched.sourcesSearched ?? [])],
        blindSpots,
        summary: enriched.summary,
        stats: { raw: rawListings.length, droppedByCriteria, withinRadius, outsideRadius },
      });
    }
    aiSummary = enriched?.summary ?? null;
  }

  return finalize(results, {
    sourcesSearched,
    blindSpots,
    summary: aiSummary ?? defaultSummary(results, criteria, { withinRadius, outsideRadius }),
    stats: { raw: rawListings.length, droppedByCriteria, withinRadius, outsideRadius },
  });
}

function finalize(listings, meta) {
  return { listings, ...meta };
}

function matchesCriteria(l, criteria) {
  if (criteria.minBedrooms != null && l.bedrooms != null && l.bedrooms < criteria.minBedrooms) {
    return false;
  }
  if (criteria.maxBedrooms != null && l.bedrooms != null && l.bedrooms > criteria.maxBedrooms) {
    return false;
  }
  if (criteria.maxPrice != null && l.price != null && l.price > criteria.maxPrice) return false;
  if (criteria.minPrice != null && l.price != null && l.price < criteria.minPrice) return false;
  return true;
}

function dedupe(listings) {
  const seen = new Map();
  for (const l of listings) {
    const key = dedupeKey(l);
    const existing = seen.get(key);
    // Prefer the row with more signal (images + price + coords).
    if (!existing || score(l) > score(existing)) seen.set(key, l);
  }
  return [...seen.values()];
}

function dedupeKey(l) {
  if (l.url) {
    const canon = l.url.split("?")[0].replace(/\/$/, "").toLowerCase();
    // Same street address + price is a strong cross-source duplicate signal.
    if (l.address && l.price) return `${normalizeAddr(l.address)}|${l.price}`;
    return canon;
  }
  return `${l.source}:${l.sourceId}`;
}

function normalizeAddr(addr) {
  return addr.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function score(l) {
  return (l.imageUrls?.length ? 2 : 0) + (l.price != null ? 1 : 0) + (l.lat != null ? 1 : 0);
}

function addressQuery(raw, criteria) {
  return [raw.address, raw.city, raw.region, criteria.location?.country]
    .filter(Boolean)
    .join(", ");
}

function distOf(listing) {
  const note = listing.commute?.notes ?? "";
  const m = note.match(/~([\d.]+) km/);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

function defaultSummary(results, criteria, { withinRadius, outsideRadius }) {
  const bits = [`${results.length} listing(s) after filtering`];
  const beds = [criteria.minBedrooms, criteria.maxBedrooms].filter((v) => v != null);
  if (beds.length) bits.push(`${beds.join("–")} bed`);
  if (criteria.maxPrice) bits.push(`≤ ${criteria.maxPrice} ${criteria.currency}`);
  if (criteria.near) bits.push(`within ${criteria.radiusKm} km of ${criteria.near.label}`);
  if (outsideRadius) bits.push(`(${outsideRadius} dropped for distance, ${withinRadius} kept)`);
  return bits.join(" · ");
}
