export const CONFIG_VERSION = 1;

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
  searchCountry: "US",
  searchLocation: "New York,New York,United States",
  mapLocation: {
    country: "US",
    languages: ["en-US"],
  },
};

export const QUERY_SETS = {
  balanced: [
    "Chelsea NYC rental building availability 1 bedroom Manhattan",
    "West Village Manhattan 1 bedroom rental availability laundry dishwasher",
    "Greenwich Village Manhattan 1 bedroom rental availability renovated",
    "Flatiron Gramercy Manhattan 1 bedroom rental building availability",
    "East Village Lower East Side Manhattan 1 bedroom rental building availability",
    "Chelsea Manhattan 2 bedroom 2 bath rental availability",
    "West Village Greenwich Village Manhattan 2 bedroom 2 bath rental availability",
    "SoHo NoHo Tribeca Manhattan 2 bedroom 2 bath rental availability",
    "East Village Manhattan 2 bedroom 2 bath rental availability washer dryer dishwasher",
    "Tribeca Manhattan true 3 bedroom 3 bath rental availability",
    "SoHo NoHo Manhattan true 3 bedroom 3 bath rental availability",
    "Chelsea Manhattan true 3 bedroom 3 bath rental availability",
    "site:streeteasy.com/building Manhattan 1 bedroom available now Chelsea West Village Greenwich Village",
    "site:streeteasy.com/building Manhattan 2 bedroom 2 bath available now Chelsea Tribeca SoHo",
    "site:streeteasy.com/building Manhattan 3 bedroom 3 bath available now Tribeca SoHo Chelsea",
    "site:zillow.com/homedetails Manhattan 1 bedroom rental Chelsea West Village",
    "site:apartments.com/new-york-ny Manhattan 2 bedroom 2 bathroom available now",
    "site:renthop.com Manhattan 3 bedroom 3 bathroom rental availability",
  ],
  broad: [
    "Manhattan rental building availability Chelsea West Village East Village Tribeca",
    "Chelsea NYC rental building availability 1 bedroom 2 bedroom 3 bedroom",
    "West Village luxury rentals availability 2 bedroom 2 bath Manhattan",
    "Greenwich Village apartment building availability Manhattan",
    "SoHo NoHo rental building availability Manhattan",
    "Tribeca 3 bedroom 3 bath rentals availability Manhattan",
    "Gramercy Flatiron luxury rentals availability Manhattan",
    "East Village LES apartment buildings availability Manhattan",
    "site:streeteasy.com/building Manhattan available rental Chelsea",
    "site:streeteasy.com/building Manhattan available rental West Village",
    "site:streeteasy.com/building Manhattan available rental Tribeca",
    "site:zillow.com/homedetails Manhattan rental apartment Chelsea",
    "site:apartments.com/new-york-ny Manhattan apartment rental available now",
    "site:renthop.com Manhattan apartment rental available now",
  ],
};

export const CURATED_ROOTS = [
  {
    provider: "Equity Apartments",
    url: "https://www.equityapartments.com/new-york-city/",
    search:
      "chelsea west village gramercy tribeca apartment availability floor plan 1 bedroom 2 bedroom 3 bedroom",
  },
  {
    provider: "Avalon Communities",
    url: "https://www.avaloncommunities.com/new-york/new-york-city-apartments/",
    search:
      "new york city apartment availability floor plan 1 bedroom 2 bedroom 3 bedroom",
  },
  {
    provider: "Brodsky",
    url: "https://brodsky.com/rentals/",
    search:
      "west village greenwich village chelsea apartment available one bedroom two bedroom three bedroom",
  },
  {
    provider: "Stonehenge NYC",
    url: "https://www.stonehengenyc.com/apartments",
    search:
      "manhattan available apartment floorplan one bedroom two bedroom three bedroom",
  },
  {
    provider: "Rockrose",
    url: "https://rockrose.com/zh/listing/",
    search: "new york available apartment 1 bed 2 bed 3 bed",
  },
  {
    provider: "EVE NYC",
    url: "https://eve.nyc/floorplans/",
    search: "available floorplans 1 bedroom 2 bedroom 3 bedroom",
  },
  {
    provider: "StuyTown / Beam Living",
    url: "https://www.stuytown.com/nyc-apartments-for-rent",
    search: "available apartments 1 bedroom 2 bedroom 3 bedroom",
  },
  {
    provider: "The Chelsea / Greystar",
    url: "https://www.thechelseaapts.com/new-york/the-chelsea/conventional",
    search: "available apartment floorplan 1 bedroom 2 bedroom",
  },
  {
    provider: "Chelsea29",
    url: "https://www.chelsea29.com/floorplans",
    search: "available floorplans 1 bedroom 2 bedroom",
  },
];

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

export const BROKER_HOST_PATTERNS = [
  "elliman.com",
  "corcoran.com",
  "compass.com",
  "serhant.com",
  "sothebysrealty.com",
  "nestseekers.com",
  "brownharrisstevens.com",
];

export const NEIGHBORHOOD_HINTS = [
  ["Chelsea", /\bchelsea\b/i],
  ["West Village", /\bwest village\b/i],
  ["Greenwich Village", /\bgreenwich village\b/i],
  ["East Village", /\beast village\b/i],
  ["Lower East Side", /\blower east side\b|\bles\b/i],
  ["SoHo", /\bsoho\b/i],
  ["NoHo", /\bnoho\b/i],
  ["Tribeca", /\btribeca\b/i],
  ["Little Italy", /\blittle italy\b/i],
  ["Gramercy", /\bgramercy\b/i],
  ["Flatiron", /\bflatiron\b/i],
  ["Stuy Town", /\bstuy\s*town\b|\bstuyvesant\b|\bpeter cooper\b/i],
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
