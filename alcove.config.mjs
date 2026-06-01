/**
 * Alcove search profile.
 *
 * This is the one file to edit to point Alcove at *your* apartment hunt:
 * where you're searching, the place you want a short commute to, the
 * neighborhoods and budgets you care about, and the sources to crawl.
 *
 * It is imported by three runtimes, so keep it plain ESM (no TS, no Node-only
 * APIs, just data + pure functions):
 *   - the Convex importer action  (convex/apartmentImportActions.ts)
 *   - the Firecrawl discovery CLI (scripts/discover-apartments-firecrawl*.mjs)
 *   - the offline import CLI       (scripts/import-apartment-runs.mjs)
 *
 * The defaults below describe a Manhattan rental search. Replace them with
 * your own city, target, neighborhoods, budgets, and sources.
 *
 * @typedef {Object} PostalAddress
 * @property {string} [streetAddress]
 * @property {string} [addressLocality]
 * @property {string} [addressRegion]
 * @property {string} [postalCode]
 * @property {string} [addressCountry]
 *
 * @typedef {Object} CommuteTarget
 * @property {string} name
 * @property {PostalAddress} address
 *
 * @typedef {Object} BudgetBand
 * @property {string} label                 Human label, e.g. "1BR".
 * @property {[number, number]} [preferred] Preferred [min, max] monthly rent.
 * @property {number} [hardCap]             Absolute ceiling.
 * @property {number} [max]                 Upper bound when there is no range.
 * @property {number} [stretch]             Allowed only if unusually strong.
 * @property {string} [note]               Extra shortlist requirement.
 *
 * @typedef {Object} CuratedSource
 * @property {string} provider
 * @property {string} url
 * @property {string} search
 */

export const CONFIG_VERSION = 1;

export const alcoveConfig = {
  /** Branding shown in the UI title and metadata. */
  appName: "Alcove",

  /**
   * Where you're searching. Used for Firecrawl's `location`/`country` and for
   * the Anthropic web-search tool's `user_location`.
   */
  location: {
    city: "New York",
    region: "New York",
    /** ISO 3166-1 alpha-2 country code. */
    country: "US",
    /** IANA timezone for the web-search tool. */
    timezone: "America/New_York",
    /** Firecrawl `search` location string ("City,Region,Country"). */
    searchLocation: "New York,New York,United States",
    /** Firecrawl `map` location object. */
    mapLocation: {
      country: "US",
      languages: ["en-US"],
    },
  },

  /**
   * The place you want a short commute to (office, campus, etc.).
   * Set to `null` to disable commute notes/scoring entirely.
   * @type {CommuteTarget | null}
   */
  commuteTarget: {
    name: "1 Example Plaza",
    address: {
      streetAddress: "1 Example Plaza",
      addressLocality: "New York",
      addressRegion: "NY",
      addressCountry: "US",
    },
  },

  /** Neighborhoods you care about. Drives candidate tagging and scoring. */
  neighborhoods: [
    "Chelsea",
    "West Village",
    "Greenwich Village",
    "East Village",
    "Lower East Side",
    "SoHo",
    "NoHo",
    "Tribeca",
    "Little Italy",
    "Gramercy",
    "Flatiron",
    "Stuy Town",
  ],

  /**
   * Budget bands by bedroom track. Consumed by the AI importer's shortlist
   * gate. Keys must match the tracks Alcove understands: "1br", "2br", "3br".
   * @type {Record<string, BudgetBand>}
   */
  budgets: {
    "1br": { label: "1BR", preferred: [4000, 5500], hardCap: 6000 },
    "2br": {
      label: "2BR",
      max: 9000,
      note: "true 2BR/2BA is expected for shortlist",
    },
    "3br": {
      label: "3BR",
      max: 14000,
      stretch: 15000,
      note: "true 3BR/3BA is expected for shortlist",
    },
  },

  /** Non-negotiable features the AI importer weighs when ranking. */
  mustHaves: [
    "in-unit or in-building laundry",
    "dishwasher",
    "big windows / good daylight",
    "renovated bathroom",
    "air conditioning and heating",
  ],

  /**
   * Furniture you need to fit, in plain language. Set to `null` to skip.
   * @type {string | null}
   */
  furnitureFit:
    "queen bed, 100 inch couch with ottoman, 47.4 x 29 inch coffee table, sideboard, accent chair",

  /** Anthropic model for the in-app URL importer. Overridable via ANTHROPIC_MODEL. */
  anthropicModel: "claude-sonnet-4-6",

  /**
   * Firecrawl discovery query sets (`npm run discover:apartments`). Each query
   * is run through Firecrawl search. Tune these to your market and tracks.
   */
  querySets: {
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
  },

  /**
   * Direct-operator / property-manager sites to map on each discovery run.
   * Firecrawl crawls each `url` filtered by `search` for availability pages.
   * @type {CuratedSource[]}
   */
  curatedSources: [
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
  ],
};

/** Render one budget band as a sentence for the extraction prompt. */
function budgetLine(track, band) {
  const money = (n) => `$${n.toLocaleString("en-US")}`;
  const parts = [`${band.label} budget`];
  if (band.preferred) {
    parts.push(`preferred ${money(band.preferred[0])}-${money(band.preferred[1])}`);
  } else if (band.max !== undefined) {
    parts.push(`up to ${money(band.max)}`);
  }
  if (band.hardCap !== undefined) parts.push(`hard cap ${money(band.hardCap)}`);
  if (band.stretch !== undefined) {
    parts.push(`stretch to ${money(band.stretch)} only if unusually strong`);
  }
  let line = parts.join(", ") + ".";
  if (band.note) line += ` ${capitalize(band.note)}.`;
  return `- ${line}`;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Build the system prompt for the AI URL importer from the search profile.
 * Editing `alcoveConfig` above automatically updates the agent's standards.
 *
 * @param {typeof alcoveConfig} [config]
 * @returns {string}
 */
export function buildExtractionPrompt(config = alcoveConfig) {
  const rankingStandards = [
    "- Main shortlist means strong enough to tour, not merely plausible.",
    `- Target neighborhoods (${config.location.city}): ${config.neighborhoods.join(
      ", ",
    )}, and very strong adjacent areas.`,
    config.commuteTarget &&
      `- Commute to ${config.commuteTarget.name} should be easy, ideally walking or one transit line, usually under/about 30 minutes.`,
    config.mustHaves.length > 0 &&
      `- Must-haves: ${config.mustHaves.join(", ")}.`,
    config.furnitureFit && `- Furniture fit matters: ${config.furnitureFit}.`,
    ...Object.entries(config.budgets).map(([track, band]) =>
      budgetLine(track, band),
    ),
  ]
    .filter(Boolean)
    .join("\n");

  return `
You are the ${config.appName} apartment import agent. Research exactly one apartment link and return field-by-field structured data for the ${config.appName} database.

Use the provided URL as the source of truth, then use web search/fetch to fill gaps from direct building, broker, operator, or portal pages. Be strict about live verification. Do not invent unavailable fields. Return null only for nullable fields that are genuinely not verified. Use "unknown" for laundry and dishwasher only after checking listing text, amenity lists, unit/building details, photos, floor plan evidence, and direct operator/broker pages.

Ranking standards:
${rankingStandards}

Structured output rules:
- The schema is intentionally compact so it can be grammar-constrained reliably. Put each fact into its field; do not invent extra JSON keys.
- name must be specific and useful: preferably "Building #Unit" or "Street Address #Unit". Do not use generic names like "Apartment listing", "StreetEasy listing", "Rental unit", "Available apartment", or a neighborhood-only title when a building, address, or unit exists.
- buildingName is the named building when present, otherwise null. unit is the exact unit/apartment identifier when present, otherwise null.
- streetAddress is the formatted street/unit address line as verified from the source. If the source separates unit, include the street in streetAddress and unit in unit; name should still include the unit.
- addressLink should be a source, maps, or detail URL that verifies the address. If there is no separate address URL, set addressLink to the verified listing URL.
- price must be numeric monthly rent in USD when verified. Put formatted price text in priceDisplay.
- bedrooms and bathrooms must be numbers, including 0 for a verified studio and decimals like 1.5 when present.
- laundry and dishwasher must be exactly "yes", "no", or "unknown".
- amenities is for user-facing amenity labels only. Do not put prose there.
- notes must be short, under about 360 characters, and should explain fit/caveats such as daylight, renovation, floor plan, or furniture fit. Never dump page text or restate all structured fields in notes.
- sourcesSearched should list real URLs/domains searched or fetched.

Required field guardrail for manual add:
- Do not return a listing just because the URL card looks promising. Open/fetch the detail page first and extract the core fields from the page itself.
- Required rich fields are name, url, addressLink, streetAddress, price, bedrooms, bathrooms, laundry, and dishwasher. If one is missing from the source page, keep looking on the detail page, embedded structured data, unit row, official building availability page, broker page, or property-manager page before giving up.
- If price, bedrooms, bathrooms, streetAddress, or a verifying addressLink still cannot be verified after deeper searching, say exactly what is missing in warnings and return null/unknown in the structured field; the importer will reject it instead of adding an incomplete active row.

Allowed status values: shortlist, monitor, excluded, archived.
Allowed track values: 1br, 2br, 3br, unknown.
Allowed freshness values: verified_live, availability_page_only, stale_or_mismatch, unverified.
Allowed confidence values: high, medium, low, blocked, unknown.
`.trim();
}
