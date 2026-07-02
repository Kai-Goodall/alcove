/**
 * Autonomous apartment search CLI (`npm run search`).
 *
 * Runs the key-free scraper engine against the sources in `alcove.config.mjs`
 * (or CLI overrides), writes a `runs.json` in the documented import contract,
 * and optionally upserts it into Convex via `import-apartment-runs.mjs`.
 *
 * Version 1 (default): pure scraping, no API keys, no paid AI.
 * Version 2 (`--ai`): adds an Anthropic enrichment pass (needs ANTHROPIC_API_KEY).
 *
 * Examples:
 *   npm run search
 *   npm run search -- --city=Waterloo --country=CA --beds=1-2 --max-price=2200 --near="University of Waterloo" --radius=6
 *   npm run search -- --sources=kijiji,bamboo --import
 *   npm run search -- --ai --import
 */

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { alcoveConfig, buildSearchCriteria } from "../alcove.config.mjs";
import { runSearch } from "./search/engine.mjs";
import { resolveLocation } from "./search/geo.mjs";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

const beds = parseRange(args.beds);
const overrides = {
  minBedrooms: numArg(args["min-beds"]) ?? beds.min,
  maxBedrooms: numArg(args["max-beds"]) ?? beds.max,
  minPrice: numArg(args["min-price"]),
  maxPrice: numArg(args["max-price"]),
  currency: args.currency,
  radiusKm: numArg(args.radius),
  sources: args.sources ? args.sources.split(",").map((s) => s.trim()) : undefined,
  perSourceLimit: numArg(args.limit),
  near:
    args.near !== undefined
      ? args.near
        ? { label: args.near, query: args.near }
        : null
      : undefined,
};

const criteria = buildSearchCriteria(clean(overrides));

// Allow location overrides on top of the config-derived criteria. A bare
// --city may sit in a different region/country than the configured profile,
// so geocode it once to fill those in (free, Nominatim).
if (args.city || args.region || args.country) {
  criteria.location = await resolveLocation(
    { city: args.city, region: args.region, country: args.country },
    criteria.location,
    { contact: criteria.geocodeContact, anchorQuery: criteria.near?.query },
  );
}

console.log(`Searching ${criteria.location?.city ?? "configured area"} …`);
console.log(
  `  beds ${criteria.minBedrooms ?? "*"}–${criteria.maxBedrooms ?? "*"}` +
    (criteria.maxPrice ? ` · ≤ ${criteria.maxPrice} ${criteria.currency}` : "") +
    (criteria.near ? ` · within ${criteria.radiusKm}km of ${criteria.near.label}` : "") +
    `\n  sources: ${criteria.sources.join(", ")}\n`,
);

let aiEnrich;
if (args.ai) {
  const { createAiEnricher } = await import("./search/ai/enrich.mjs");
  aiEnrich = createAiEnricher(alcoveConfig, {
    apiKey: typeof args["api-key"] === "string" ? args["api-key"] : undefined,
  });
}

const result = await runSearch(criteria, {
  onProgress: (msg) => console.log(`  · ${msg}`),
  aiEnrich,
});

console.log(`\n${result.listings.length} listing(s) found.`);
console.log(`Summary: ${result.summary}`);
if (result.blindSpots?.length) {
  console.log("Blind spots:");
  for (const spot of result.blindSpots) console.log(`  - ${spot}`);
}

const runDate = new Date().toISOString().slice(0, 10);
const runsFile = resolve(
  process.cwd(),
  args.out ?? `data/automation-backfill/search-${runDate}.json`,
);
const runsPayload = {
  runs: [
    {
      id: `search-${runDate}-${criteria.location?.city ?? "area"}`.toLowerCase().replace(/\s+/g, "-"),
      runDate,
      summary: result.summary,
      notes: `Autonomous ${args.ai ? "AI-assisted " : ""}search via npm run search.`,
      sourcesSearched: result.sourcesSearched,
      blindSpots: result.blindSpots,
      listings: result.listings,
    },
  ],
};

if (args["dry-run"]) {
  console.log(`\n[dry-run] would write ${result.listings.length} listing(s) to ${runsFile}`);
  for (const l of result.listings.slice(0, 10)) {
    console.log(`  - [${l.rank}] ${l.provider}: ${l.name ?? l.url}`);
  }
  process.exit(0);
}

await mkdir(dirname(runsFile), { recursive: true });
await writeFile(runsFile, JSON.stringify(runsPayload, null, 2));
console.log(`\nWrote ${runsFile}`);

if (args.import) {
  console.log("\nImporting into Convex…\n");
  await runImport(runsFile);
} else {
  console.log(
    `\nTo load these into Alcove:\n  npm run import:apartment-runs -- ${runsFile}\n` +
      `Or re-run with --import to do it now.`,
  );
}

function runImport(file) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/import-apartment-runs.mjs", file],
      { stdio: "inherit" },
    );
    child.on("exit", (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`import exited with code ${code}`)),
    );
    child.on("error", reject);
  });
}

function parseArgs(rawArgs) {
  const out = {};
  for (const arg of rawArgs) {
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.slice(2).split(/=(.*)/s);
    out[key] = value ?? true;
  }
  return out;
}

function parseRange(value) {
  if (!value || value === true) return {};
  const [min, max] = String(value).split("-");
  return { min: numArg(min), max: numArg(max ?? min) };
}

function numArg(value) {
  if (value === undefined || value === true || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

function printHelp() {
  console.log(`Alcove apartment search

Usage: npm run search -- [options]

Options:
  --city=NAME            Override the search city (default: alcove.config location)
  --region=NAME          Override region/province/state
  --country=CC           Override ISO country code (e.g. CA, US)
  --beds=MIN-MAX         Bedroom range, e.g. 1-2 (or a single number)
  --min-beds / --max-beds
  --min-price / --max-price   Monthly rent bounds
  --currency=CCY         e.g. CAD, USD
  --near="PLACE"         Proximity anchor (address/landmark); "" to disable
  --radius=KM            Radius around --near to keep (default: config)
  --sources=a,b,c        Adapters to run (kijiji,zillow,bamboo,craigslist,reddit,custom,rentals_ca)
  --limit=N              Max listings per source
  --out=FILE             Output runs.json path
  --import               Upsert results into Convex after searching
  --ai                   Version 2: Anthropic enrichment (needs an API key)
  --api-key=KEY          Anthropic key for --ai (default: ANTHROPIC_API_KEY env)
  --dry-run              Search and print, but don't write/import
  --help                 Show this help
`);
}
