import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BROKER_HOST_PATTERNS,
  CONFIG_VERSION,
  CURATED_ROOTS,
  DEFAULTS,
  DIRECT_OPERATOR_HOST_PATTERNS,
  NEIGHBORHOOD_HINTS,
  PORTAL_HOST_PATTERNS,
  PRESERVED_QUERY_PARAMS_BY_HOST,
  QUERY_SETS,
  REJECT_PATH_PATTERNS,
  SOFT_DEPRIORITIZE_PATTERNS,
  TRACK_HINTS,
  TRACKING_QUERY_PARAMS,
} from "./discover-apartments-firecrawl-config.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);

export async function main(argv = process.argv.slice(2)) {
  loadEnvLocal();
  const args = parseArgs(argv);
  const runDate = args.date ?? new Date().toISOString().slice(0, 10);
  const outFile =
    args.out ?? `data/firecrawl-discovery/${runDate}.json`;
  const outputPath = resolve(process.cwd(), outFile);
  const querySetName = args["query-set"] ?? DEFAULTS.querySet;
  const queries = resolveQuerySet(querySetName);
  const mappedRoots = await resolveRoots(args["roots-file"]);
  const searchLimit = parsePositiveInt(args["search-limit"], DEFAULTS.searchLimit);
  const mapLimit = parsePositiveInt(args["map-limit"], DEFAULTS.mapLimit);
  const maxCandidates = parsePositiveInt(
    args["max-candidates"],
    DEFAULTS.maxCandidates,
  );
  const degradedThreshold = parsePositiveInt(
    args["degraded-threshold"],
    DEFAULTS.degradedThreshold,
  );
  const directOperatorThreshold = DEFAULTS.directOperatorThreshold;
  const baseUrl = normalizeBaseUrl(
    process.env.FIRECRAWL_BASE_URL ?? "https://api.firecrawl.dev",
  );
  const apiKey = process.env.FIRECRAWL_API_KEY;

  const context = {
    runDate,
    generatedAt: new Date().toISOString(),
    configVersion: CONFIG_VERSION,
    querySet: querySetName,
    queries,
    mappedRoots,
    searchLimit,
    mapLimit,
    maxCandidates,
    degradedThreshold,
    directOperatorThreshold,
    baseUrl,
  };

  const errors = [];
  const warnings = [];
  const rawSearchItems = [];
  const rawMapItems = [];

  if (!apiKey) {
    errors.push({
      stage: "config",
      target: "FIRECRAWL_API_KEY",
      message: "Missing FIRECRAWL_API_KEY in environment or .env.local.",
    });
  } else {
    const searchResults = await runWithConcurrency(
      queries,
      DEFAULTS.searchConcurrency,
      async (query) => {
        try {
          const response = await firecrawlSearch({
            apiKey,
            baseUrl,
            query,
            limit: searchLimit,
          });
          rawSearchItems.push(...response.items);
        } catch (error) {
          errors.push({
            stage: "search",
            target: query,
            message: error.message,
          });
        }
      },
    );
    void searchResults;

    const mapResults = await runWithConcurrency(
      mappedRoots,
      DEFAULTS.mapConcurrency,
      async (root) => {
        try {
          const response = await firecrawlMap({
            apiKey,
            baseUrl,
            root,
            limit: mapLimit,
          });
          rawMapItems.push(...response.items);
        } catch (error) {
          errors.push({
            stage: "map",
            target: root.url,
            message: error.message,
          });
        }
      },
    );
    void mapResults;
  }

  const allRawItems = [...rawSearchItems, ...rawMapItems];
  const filteredReasonCounts = {};
  const uniqueByKey = new Map();

  for (const rawItem of allRawItems) {
    const shaped = shapeCandidate(rawItem);
    if (shaped.filteredReason) {
      filteredReasonCounts[shaped.filteredReason] =
        (filteredReasonCounts[shaped.filteredReason] ?? 0) + 1;
      continue;
    }

    const existing = uniqueByKey.get(shaped.dedupeKey);
    if (!existing || shaped.priority > existing.priority) {
      uniqueByKey.set(shaped.dedupeKey, shaped);
    }
  }

  const uniqueCandidates = [...uniqueByKey.values()].sort((a, b) => {
    return (
      b.priority - a.priority ||
      a.domain.localeCompare(b.domain) ||
      a.canonicalUrl.localeCompare(b.canonicalUrl)
    );
  });

  const topCandidates = uniqueCandidates.slice(0, maxCandidates);
  const directOperatorCount = topCandidates.filter((candidate) =>
    candidate.sourceKind.startsWith("direct_operator"),
  ).length;

  if (topCandidates.length < degradedThreshold) {
    warnings.push(
      `Unique candidate pool is below threshold: ${topCandidates.length} < ${degradedThreshold}.`,
    );
  }
  if (directOperatorCount < directOperatorThreshold) {
    warnings.push(
      `Direct-operator candidate pool is below threshold: ${directOperatorCount} < ${directOperatorThreshold}.`,
    );
  }

  const degraded =
    errors.length > 0 ||
    topCandidates.length < degradedThreshold ||
    directOperatorCount < directOperatorThreshold;
  const status =
    errors.length > 0 ? "degraded" : degraded ? "degraded" : "ok";

  const output = {
    runDate: context.runDate,
    generatedAt: context.generatedAt,
    configVersion: context.configVersion,
    status,
    degraded,
    degradedReasons: warnings,
    queries: context.queries,
    mappedRoots: context.mappedRoots,
    stats: {
      rawSearchCount: rawSearchItems.length,
      rawMapCount: rawMapItems.length,
      rawCount: allRawItems.length,
      uniqueCount: uniqueCandidates.length,
      keptCount: topCandidates.length,
      directOperatorCount,
      filteredCount: allRawItems.length - uniqueCandidates.length,
      filteredReasonCounts,
      errorCount: errors.length,
      searchLimit,
      mapLimit,
      maxCandidates,
      degradedThreshold,
      directOperatorThreshold,
    },
    errors,
    candidates: topCandidates,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        output: outputPath,
        status,
        degraded,
        uniqueCount: uniqueCandidates.length,
        keptCount: topCandidates.length,
        directOperatorCount,
        errorCount: errors.length,
      },
      null,
      2,
    ),
  );
}

export function shapeCandidate(rawItem) {
  const url = rawItem.url?.trim();
  const canonicalUrl = canonicalizeUrl(url);
  const domain = hostnameFromUrl(canonicalUrl);
  const providerHint = inferProviderHint(domain, rawItem.providerHint);
  const sourceKind = classifySourceKind({
    url: canonicalUrl,
    domain,
    text: collectText(rawItem),
  });
  const trackHints = inferTrackHints(rawItem);
  const neighborhoodHints = inferNeighborhoodHints(rawItem);
  const flags = inferFlags({
    url: canonicalUrl,
    text: collectText(rawItem),
    sourceKind,
  });
  const filteredReason = getFilteredReason({
    url: canonicalUrl,
    sourceKind,
    flags,
    text: collectText(rawItem),
  });
  const priority = scoreCandidate({
    sourceKind,
    flags,
    trackHints,
    neighborhoodHints,
    discoveryMethod: rawItem.discoveryMethod,
  });

  return {
    url,
    canonicalUrl,
    domain,
    providerHint,
    sourceKind,
    discoveryMethod: rawItem.discoveryMethod,
    discoveryQuery: rawItem.discoveryQuery,
    mapRoot: rawItem.mapRoot,
    title: rawItem.title ?? null,
    snippet: pickSnippet(rawItem),
    trackHints,
    neighborhoodHints,
    priority,
    dedupeKey: buildDedupeKey(canonicalUrl),
    flags,
    filteredReason,
  };
}

export function canonicalizeUrl(input) {
  if (!input) return "";
  try {
    const url = new URL(input);
    url.hash = "";
    url.protocol = "https:";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");

    const preservedParams = PRESERVED_QUERY_PARAMS_BY_HOST[url.hostname] ?? [];
    const nextSearch = new URLSearchParams();

    for (const [key, value] of url.searchParams.entries()) {
      if (TRACKING_QUERY_PARAMS.has(key.toLowerCase())) {
        continue;
      }
      if (preservedParams.includes(key)) {
        nextSearch.set(key, value);
      }
    }

    url.search = nextSearch.toString() ? `?${nextSearch.toString()}` : "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return input.trim();
  }
}

export function inferTrackHints(rawItem) {
  const text = collectText(rawItem);
  return TRACK_HINTS.filter(([, pattern]) => pattern.test(text)).map(
    ([track]) => track,
  );
}

export function inferNeighborhoodHints(rawItem) {
  const text = collectText(rawItem);
  return NEIGHBORHOOD_HINTS.filter(([, pattern]) => pattern.test(text)).map(
    ([label]) => label,
  );
}

export function scoreCandidate({
  sourceKind,
  flags,
  trackHints,
  neighborhoodHints,
  discoveryMethod,
}) {
  const baseScores = {
    direct_operator_unit: 100,
    direct_operator_inventory: 94,
    direct_operator_building: 86,
    broker_listing: 78,
    portal_unit: 74,
    portal_building: 60,
    generic_listing: 46,
  };

  let score = baseScores[sourceKind] ?? 32;

  if (flags.includes("availability_signal")) score += 6;
  if (flags.includes("price_signal")) score += 6;
  if (flags.includes("floorplan_signal")) score += 5;
  if (flags.includes("unit_like")) score += 4;
  if (trackHints.length > 0) score += 4;
  if (neighborhoodHints.length > 0) score += 3;
  if (discoveryMethod === "firecrawl_map") score += 2;
  if (flags.includes("soft_deprioritized")) score -= 18;

  return Math.max(0, Math.min(100, score));
}

function normalizeBaseUrl(input) {
  return input.replace(/\/+$/, "");
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${token}`);
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    index += 1;
  }

  return args;
}

function parsePositiveInt(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected positive integer, got: ${value}`);
  }
  return parsed;
}

function resolveQuerySet(name) {
  const queries = QUERY_SETS[name];
  if (!queries) {
    throw new Error(
      `Unknown query set "${name}". Available: ${Object.keys(QUERY_SETS).join(", ")}`,
    );
  }
  return queries;
}

async function resolveRoots(rootsFile) {
  if (!rootsFile) {
    return CURATED_ROOTS;
  }

  const raw = await readFile(resolve(process.cwd(), rootsFile), "utf8");
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed);
    const list = Array.isArray(parsed) ? parsed : parsed.roots;
    if (!Array.isArray(list)) {
      throw new Error(`roots-file must be a JSON array or { roots: [] } object.`);
    }
    return list.map(normalizeRootConfig);
  }

  return trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((url) => normalizeRootConfig({ url }));
}

function normalizeRootConfig(root) {
  if (typeof root === "string") {
    return { provider: hostnameFromUrl(root), url: root, search: "availability apartment floorplan" };
  }
  return {
    provider: root.provider ?? hostnameFromUrl(root.url),
    url: root.url,
    search: root.search ?? "availability apartment floorplan",
  };
}

async function firecrawlSearch({ apiKey, baseUrl, query, limit }) {
  const response = await fetchWithJson(`${baseUrl}/v2/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      limit,
      country: DEFAULTS.searchCountry,
      location: DEFAULTS.searchLocation,
      scrapeOptions: {
        formats: [{ type: "markdown" }],
      },
    }),
  });

  const webResults = response?.data?.web ?? [];
  return {
    items: webResults.map((item) => ({
      url: item.url,
      title: item.title,
      snippet: item.description ?? item.markdown ?? null,
      markdown: item.markdown ?? null,
      discoveryMethod: "firecrawl_search",
      discoveryQuery: query,
    })),
  };
}

async function firecrawlMap({ apiKey, baseUrl, root, limit }) {
  const response = await fetchWithJson(`${baseUrl}/v2/map`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: root.url,
      search: root.search,
      limit,
      ignoreQueryParameters: true,
      ignoreCache: true,
      sitemap: "include",
      location: DEFAULTS.mapLocation,
    }),
  });

  const links = response?.links ?? response?.data?.links ?? [];
  return {
    items: links.map((url) => ({
      url,
      title: null,
      snippet: null,
      providerHint: root.provider,
      discoveryMethod: "firecrawl_map",
      mapRoot: root.url,
    })),
  };
}

async function fetchWithJson(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULTS.timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 240)}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function runWithConcurrency(items, limit, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(runners);
}

function collectText(rawItem) {
  return compact([
    rawItem.url,
    rawItem.title,
    rawItem.snippet,
    rawItem.markdown,
    rawItem.providerHint,
  ]).join(" ");
}

function pickSnippet(rawItem) {
  const source = rawItem.snippet ?? rawItem.markdown;
  if (!source) return null;
  return source.replace(/\s+/g, " ").trim().slice(0, 320);
}

function classifySourceKind({ url, domain, text }) {
  const isDirect = matchesHost(domain, DIRECT_OPERATOR_HOST_PATTERNS);
  const isPortal = matchesHost(domain, PORTAL_HOST_PATTERNS);
  const isBroker = matchesHost(domain, BROKER_HOST_PATTERNS);
  const unitLike = hasUnitLikeSignal(url, text);
  const inventoryLike = hasInventorySignal(url, text);

  if (isDirect) {
    if (unitLike) return "direct_operator_unit";
    if (inventoryLike) return "direct_operator_inventory";
    return "direct_operator_building";
  }

  if (isBroker) return "broker_listing";
  if (isPortal) return unitLike ? "portal_unit" : "portal_building";
  return "generic_listing";
}

function inferFlags({ url, text, sourceKind }) {
  const flags = [];
  if (sourceKind.startsWith("direct_operator")) flags.push("direct_operator");
  if (sourceKind.startsWith("portal")) flags.push("portal");
  if (sourceKind === "broker_listing") flags.push("broker");
  if (hasUnitLikeSignal(url, text)) flags.push("unit_like");
  if (hasInventorySignal(url, text)) flags.push("inventory_signal");
  if (/\b(available|availability|move[- ]?in|listed|for rent|rent)\b/i.test(text)) {
    flags.push("availability_signal");
  }
  if (/\$\s?\d[\d,]*/.test(text)) flags.push("price_signal");
  if (/\bfloor\s?plan|\b3d\b|\bvirtual tour\b/i.test(text)) {
    flags.push("floorplan_signal");
  }
  if (SOFT_DEPRIORITIZE_PATTERNS.some((pattern) => pattern.test(text))) {
    flags.push("soft_deprioritized");
  }
  return flags;
}

function getFilteredReason({ url, sourceKind, flags, text }) {
  if (!url) return "missing_url";

  const pathname = pathnameFromUrl(url);
  if (REJECT_PATH_PATTERNS.some((pattern) => pattern.test(pathname))) {
    return "non_listing_path";
  }

  if (
    sourceKind === "generic_listing" &&
    !flags.includes("availability_signal") &&
    !flags.includes("inventory_signal") &&
    !flags.includes("unit_like")
  ) {
    return "generic_without_listing_signal";
  }

  if (
    flags.includes("soft_deprioritized") &&
    !flags.includes("availability_signal") &&
    !flags.includes("inventory_signal") &&
    !flags.includes("unit_like")
  ) {
    return "marketing_page";
  }

  if (
    !/\b(apartments?|rentals?|bedrooms?|beds?|units?|floorplans?|availability|listed)\b/i.test(
      text,
    )
  ) {
    return "missing_rental_signal";
  }

  return null;
}

function inferProviderHint(domain, provided) {
  if (provided) return provided;
  const hints = [
    ["equityapartments.com", "Equity Apartments"],
    ["avaloncommunities.com", "Avalon Communities"],
    ["brodsky.com", "Brodsky"],
    ["stonehengenyc.com", "Stonehenge NYC"],
    ["rockrose.com", "Rockrose"],
    ["eve.nyc", "EVE NYC"],
    ["stuytown.com", "StuyTown / Beam Living"],
    ["thechelseaapts.com", "The Chelsea / Greystar"],
    ["chelsea29.com", "Chelsea29"],
    ["streeteasy.com", "StreetEasy"],
    ["zillow.com", "Zillow"],
    ["apartments.com", "Apartments.com"],
    ["renthop.com", "RentHop"],
  ];
  return hints.find(([pattern]) => domain.includes(pattern))?.[1] ?? domain;
}

function buildDedupeKey(canonicalUrl) {
  return canonicalUrl.replace(/^https?:\/\//i, "").toLowerCase();
}

function hostnameFromUrl(input) {
  try {
    return new URL(input).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function pathnameFromUrl(input) {
  try {
    return new URL(input).pathname;
  } catch {
    return input;
  }
}

function matchesHost(domain, patterns) {
  return patterns.some((pattern) => domain === pattern || domain.endsWith(`.${pattern}`));
}

function hasUnitLikeSignal(url, text) {
  return (
    /\/(?:unit|apt|apartment)\b/i.test(url) ||
    /[#/](?:\d+[a-z]?|[a-z]?\d+[a-z]?|[0-9]{1,2}[a-z]{1,2})$/i.test(pathnameFromUrl(url)) ||
    /\b(?:apt|unit|#)\s*[a-z0-9-]{1,6}\b/i.test(text)
  );
}

function hasInventorySignal(url, text) {
  return (
    /\b(availability|available|rentals?|floorplans?|inventory|apartments?|units?|apartments? for rent|conventional)\b/i.test(
      text,
    ) || /\/(?:floorplans?|availability|apartments)(?:\/|$)/i.test(url)
  );
}

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function compact(values) {
  return values.filter(Boolean);
}

if (process.argv[1] === SCRIPT_PATH) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
