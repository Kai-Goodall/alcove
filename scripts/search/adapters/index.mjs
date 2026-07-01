/**
 * Adapter registry. Each adapter exports:
 *   id, label, supports(criteria) -> boolean,
 *   unsupportedReason(criteria) -> string, search(criteria, ctx) -> RawListing[]
 *
 * Adding a source = drop a module here and register it. That's the whole
 * extensibility story for new regions/sites.
 */

import * as kijiji from "./kijiji.mjs";
import * as bamboo from "./bamboo.mjs";
import * as craigslist from "./craigslist.mjs";
import * as rentalsCa from "./rentals-ca.mjs";

/**
 * Sources that can't be scraped without a logged-in session or paid bot
 * unblocking. Registered as honest no-ops so configuring them yields a clear
 * blind-spot note instead of a silent gap. The AI version (with browser-grade
 * fetching) is the path to enabling these.
 */
function walledAdapter(id, label, reason) {
  return {
    id,
    label,
    supports: () => false,
    unsupportedReason: () => reason,
    search: async () => [],
  };
}

const ADAPTERS = [
  kijiji,
  bamboo,
  craigslist,
  rentalsCa,
  walledAdapter(
    "apartments",
    "Apartments.com",
    "Apartments.com is behind aggressive bot management; reliable scraping needs a paid unblocking service. Use the AI version or Add-by-URL instead.",
  ),
  walledAdapter(
    "marketplace",
    "Facebook Marketplace",
    "Facebook Marketplace requires an authenticated session and forbids scraping in its terms; not supported in the key-free version.",
  ),
];

const BY_ID = new Map(ADAPTERS.map((a) => [a.id, a]));

export function getAdapter(id) {
  return BY_ID.get(id) ?? null;
}

export function listAdapterIds() {
  return [...BY_ID.keys()];
}
