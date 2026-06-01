// Firecrawl discovery tuning.
//
// The *market profile* (location, query sets, curated sources, neighborhoods)
// lives in ../alcove.config.mjs so you only edit it once. This file keeps the
// mechanical knobs: how candidates are classified, scored, and filtered.
// Customize the host pattern lists below if your market uses different
// portals/brokers/operators.

import { alcoveConfig, CONFIG_VERSION as PROFILE_VERSION } from "../alcove.config.mjs";

export const CONFIG_VERSION = PROFILE_VERSION;

export const DEFAULTS = {
  querySet: "balanced",
  searchLimit: 8,
  mapLimit: 60,
  maxCandidates: 120,
  degradedThreshold: 25,
  directOperatorThreshold: 5,
  searchConcurrency: 3,
  mapConcurrency: 2,
  timeoutMs: 60_000,
  searchCountry: alcoveConfig.location.country,
  searchLocation: alcoveConfig.location.searchLocation,
  mapLocation: alcoveConfig.location.mapLocation,
};

export const QUERY_SETS = alcoveConfig.querySets;

export const CURATED_ROOTS = alcoveConfig.curatedSources;

// Per-neighborhood regex overrides for labels that need more than a simple
// word-boundary match (abbreviations, alternate names). Keyed by the label as
// it appears in alcoveConfig.neighborhoods.
const NEIGHBORHOOD_PATTERN_OVERRIDES = {
  "Lower East Side": /\blower east side\b|\bles\b/i,
  "Stuy Town": /\bstuy\s*town\b|\bstuyvesant\b|\bpeter cooper\b/i,
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const NEIGHBORHOOD_HINTS = alcoveConfig.neighborhoods.map((label) => [
  label,
  NEIGHBORHOOD_PATTERN_OVERRIDES[label] ??
    new RegExp(`\\b${escapeRegExp(label)}\\b`, "i"),
]);

// Sites where availability comes straight from the property manager/operator.
export const DIRECT_OPERATOR_HOST_PATTERNS = [
  "equityapartments.com",
  "avaloncommunities.com",
  "brodsky.com",
  "stonehengenyc.com",
  "rockrose.com",
  "eve.nyc",
  "stuytown.com",
  "beamliving.com",
  "thechelseaapts.com",
  "chelsea29.com",
  "relatedrentals.com",
  "roseassociates.com",
  "glenwoodnyc.com",
  "tfc.com",
  "gothamorg.com",
];

// Aggregator/portal sites (listings re-posted from many sources).
export const PORTAL_HOST_PATTERNS = [
  "streeteasy.com",
  "zillow.com",
  "apartments.com",
  "renthop.com",
  "leasebreak.com",
  "craigslist.org",
  "trulia.com",
  "apartmentfinder.com",
  "realtor.com",
];

// Brokerage sites.
export const BROKER_HOST_PATTERNS = [
  "elliman.com",
  "corcoran.com",
  "compass.com",
  "serhant.com",
  "sothebysrealty.com",
  "nestseekers.com",
  "brownharrisstevens.com",
];

export const TRACK_HINTS = [
  ["1br", /\b(1\s*(?:br|bed|bedroom)|one bedroom)\b/i],
  ["2br", /\b(2\s*(?:br|bed|bedroom)|two bedroom)\b/i],
  ["3br", /\b(3\s*(?:br|bed|bedroom)|three bedroom)\b/i],
];

export const TRACKING_QUERY_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
  "gclsrc",
  "mc_cid",
  "mc_eid",
  "ref",
  "source",
  "featured",
  "from_map",
  "similarhdp2",
  "infeed",
  "lstt",
]);

export const PRESERVED_QUERY_PARAMS_BY_HOST = {
  "stuytown.com": ["unitSpk"],
};

export const REJECT_PATH_PATTERNS = [
  /\/(?:about|contact|privacy|terms|accessibility|careers|press)(?:\/|$)/i,
  /\/blog(?:\/|$)/i,
  /\/faq(?:\/|$)/i,
  /\/residents?(?:\/|$)/i,
  /\/resident-login(?:\/|$)/i,
];

export const SOFT_DEPRIORITIZE_PATTERNS = [
  /amenit/i,
  /neighborhood/i,
  /gallery/i,
  /photo/i,
  /community/i,
];
