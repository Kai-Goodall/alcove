/**
 * Alcove search profile.
 *
 * This is the one file to edit to point Alcove at *your* apartment hunt:
 * where you're searching, the place you want a short commute to, the
 * neighborhoods and budgets you care about, and the sources to check.
 *
 * It is imported by:
 *   - the Convex importer action  (convex/apartmentImportActions.ts)
 *   - the offline import CLI       (scripts/import-apartment-runs.mjs)
 *   - the automation prompt generator (scripts/generate-automation-prompt.mjs)
 *
 * Keep it plain ESM (no TS, no Node-only APIs, just data + pure functions).
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
 * @property {string} [extra]              Additional automation-only guidance.
 */

export const CONFIG_VERSION = 2;

export const alcoveConfig = {
  /** Branding shown in the UI title and metadata. */
  appName: "Alcove",

  /**
   * Where you're searching. Used for the Anthropic web-search tool's
   * `user_location` in the in-app URL importer.
   */
  location: {
    city: "New York",
    region: "New York",
    /** ISO 3166-1 alpha-2 country code. */
    country: "US",
    /** IANA timezone for the web-search tool. */
    timezone: "America/New_York",
  },

  /**
   * The place you want a short commute to (office, campus, etc.).
   * Set to `null` to disable commute notes/scoring entirely.
   * @type {CommuteTarget | null}
   */
  commuteTarget: {
    name: "Your office",
    address: {
      streetAddress: "1 Example Plaza",
      addressLocality: "New York",
      addressRegion: "NY",
      addressCountry: "US",
    },
  },

  /** Neighborhoods you care about. */
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
   * Budget bands by bedroom track. Consumed by the in-app importer's shortlist
   * gate and the automation prompt. Keys: "1br", "2br", "3br".
   * @type {Record<string, BudgetBand>}
   */
  budgets: {
    "1br": {
      label: "1BR",
      preferred: [4000, 5500],
      hardCap: 6000,
      note: "high photo and floor-plan/size confidence expected for shortlist",
    },
    "2br": {
      label: "2BR",
      max: 9000,
      note: "2BR/2BA is the expected standard; downgrade 2BR/1BA unless exceptional on location, light, layout, renovation, and price",
    },
    "3br": {
      label: "3BR",
      max: 14000,
      stretch: 15000,
      note: "true 3BR/3BA is the target; downgrade 3BR/2BA unless exceptional",
      extra:
        "Strongly favor a real living room and generous layouts over over-partitioned units",
    },
  },

  /** Non-negotiable features the search weighs when ranking. */
  mustHaves: [
    "in-unit or in-building laundry",
    "dishwasher",
    "big windows / good daylight",
    "relatively new or well-renovated bathroom",
    "air conditioning and heating",
  ],

  /**
   * Furniture you need to fit, in plain language. Set to `null` to skip.
   * @type {string | null}
   */
  furnitureFit:
    "queen bed; 100 inch couch with ottoman; coffee table 47.4 in W x 29 in D x 15.5 in H; sideboard 54.3 in W x 15.7 in D x 30.3 in H; accent chair. The couch/ottoman and coffee table must fit comfortably with a usable walkway; sideboard and chair are nice-to-have",

  /** Anthropic model for the in-app URL importer. Overridable via ANTHROPIC_MODEL. */
  anthropicModel: "claude-sonnet-4-6",

  /**
   * Settings for the daily search automation. Generate the prompt with
   * `npm run prompt:automation` and paste it into your Codex (or other agent)
   * scheduled automation. See docs/automation.md.
   */
  automation: {
    /** Suggested automation id/name. */
    name: "daily-manhattan-apartment-search",
    /** Move-in timing requirement, in plain language. */
    moveIn:
      "Move-in for June 1, with June 1–June 7 the ideal window. Available now is acceptable if likely workable; later availability should be a caveat.",
    /**
     * Direct operators / property managers to inspect first (their own
     * availability pages are the freshest, most reliable source).
     */
    operators: [
      "TF Cornerstone",
      "Equity",
      "Avalon",
      "Related",
      "Beam Living / StuyTown",
      "Brodsky",
      "Glenwood",
      "Stonehenge",
      "Rose Associates",
      "Rockrose",
      "Gotham",
      "Fetner",
      "Dermot",
      "Bozzuto",
      "Greystar",
      "Moinian",
      "Lalezarian",
      "AKN",
      "Solil",
      "UDR",
      "Pan Am Equities",
      "Bettina",
      "Icon Realty",
      "Centurion",
      "Jakobson",
      "Ogden CAP",
      "Milford",
    ],
    /** Aggregator/portal and broker sources to sweep after operators. */
    portals: [
      "StreetEasy",
      "Zillow",
      "Apartments.com",
      "RentHop",
      "Leasebreak",
      "Craigslist (where reasonable)",
      "broker and brokerage inventory pages",
    ],
  },
};

/** Render one budget band as a sentence for the importer prompt. */
function budgetLine(band) {
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
 * Build the system prompt for the in-app AI URL importer from the search
 * profile. Editing `alcoveConfig` above automatically updates the agent's
 * standards. The Convex importer calls this for you.
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
    ...Object.values(config.budgets).map((band) => budgetLine(band)),
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
