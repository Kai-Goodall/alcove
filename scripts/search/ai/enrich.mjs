/**
 * Version 2 — AI enrichment layer.
 *
 * Wraps the key-free engine's scraped results with an Anthropic pass that:
 *   1. Discovers additional listings via web search (sources the scrapers
 *      can't reach without keys/logins, plus operator/broker pages).
 *   2. Scores every candidate against the search profile in alcove.config.mjs
 *      (must-haves, budgets, neighborhoods, furniture fit, commute), improves
 *      names/notes, flags caveats, and promotes strong rows to `shortlist`.
 *   3. Ranks the merged set.
 *
 * Everything degrades gracefully: if the API key is missing or a call fails,
 * the scraped results pass through unchanged. Requires ANTHROPIC_API_KEY.
 */

import Anthropic from "@anthropic-ai/sdk";

/**
 * Build the `aiEnrich` callback the engine expects.
 * @param {import("../../../alcove.config.mjs").alcoveConfig} config
 */
export function createAiEnricher(config) {
  return async function aiEnrich({ results, criteria, log = () => {} }) {
    if (!process.env.ANTHROPIC_API_KEY) {
      log("AI enrichment skipped: ANTHROPIC_API_KEY not set.");
      return { listings: results };
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const model = process.env.ANTHROPIC_MODEL ?? config.anthropicModel ?? "claude-sonnet-4-6";

    let listings = results;
    const sourcesSearched = [];

    // 1. Discovery — find more listings beyond what scrapers reached.
    try {
      const discovered = await discoverListings(client, model, config, criteria, log);
      if (discovered.length) {
        log(`AI discovered ${discovered.length} additional candidate(s).`);
        listings = mergeByUrl(listings, discovered);
        sourcesSearched.push("AI web search");
      }
    } catch (error) {
      log(`AI discovery failed: ${error.message}`);
    }

    // 2. Scoring / enrichment / ranking over the merged set.
    let summary;
    try {
      const enriched = await scoreListings(client, model, config, criteria, listings, log);
      if (enriched?.listings?.length) {
        listings = enriched.listings;
        summary = enriched.summary;
      }
    } catch (error) {
      log(`AI scoring failed: ${error.message}`);
    }

    return { listings, summary, sourcesSearched };
  };
}

async function discoverListings(client, model, config, criteria, log) {
  const city = criteria.location?.city ?? config.location.city;
  const beds = [criteria.minBedrooms, criteria.maxBedrooms].filter((v) => v != null).join("–");
  const message = await client.messages.create({
    model,
    max_tokens: 3000,
    system:
      "You are an apartment-search assistant. Use web search to find CURRENTLY LISTED rental apartments matching the user's criteria, including sources a simple scraper can't reach (Apartments.com, Zillow/Rentals.ca, operator and broker pages, local listings). Verify each is a live rental listing. Return ONLY a JSON array (no prose) of objects: {url, name, price, bedrooms, bathrooms, address, provider}. Omit fields you cannot verify. Max 15 items.",
    tools: [
      {
        type: "web_search_20260209",
        name: "web_search",
        max_uses: 6,
        user_location: {
          type: "approximate",
          city,
          region: criteria.location?.region ?? config.location.region,
          country: criteria.location?.country ?? config.location.country,
          timezone: config.location.timezone,
        },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          `Find rental apartments in ${city}.`,
          beds && `Bedrooms: ${beds}.`,
          criteria.maxPrice && `Max monthly rent: ${criteria.maxPrice} ${criteria.currency}.`,
          criteria.near && `Prefer within ${criteria.radiusKm}km of ${criteria.near.label}.`,
          `Must-haves to favor: ${(config.mustHaves ?? []).join(", ")}.`,
        ]
          .filter(Boolean)
          .join(" "),
      },
    ],
  });

  const raw = parseJsonArray(textOf(message));
  return raw
    .filter((r) => r && typeof r.url === "string")
    .map((r) => ({
      source: "ai",
      sourceId: r.url,
      key: `ai:${r.url}`,
      url: r.url,
      provider: r.provider ?? "AI discovery",
      name: r.name,
      status: "monitor",
      track: trackFor(r.bedrooms),
      price: numeric(r.price),
      priceCurrency: criteria.currency,
      bedrooms: numeric(r.bedrooms),
      bathrooms: numeric(r.bathrooms),
      streetAddress: r.address,
      freshness: "unverified",
      verificationNote: "Discovered via AI web search; verify before touring.",
      photoConfidence: "low",
      floorPlanConfidence: "low",
      tags: ["ai"],
    }));
}

async function scoreListings(client, model, config, criteria, listings, log) {
  if (!listings.length) return null;
  // Keep the payload compact so one call covers the whole set.
  const compact = listings.map((l, i) => ({
    i,
    key: l.key,
    name: l.name,
    provider: l.provider,
    price: l.price,
    currency: l.priceCurrency,
    bedrooms: l.bedrooms,
    bathrooms: l.bathrooms,
    address: l.streetAddress ?? l.neighborhood,
    note: l.notes,
    amenities: l.amenities,
  }));

  const message = await client.messages.create({
    model,
    max_tokens: 6000,
    system: buildScoringSystemPrompt(config),
    messages: [
      {
        role: "user",
        content: `Search criteria: ${JSON.stringify({
          bedrooms: [criteria.minBedrooms, criteria.maxBedrooms],
          maxPrice: criteria.maxPrice,
          currency: criteria.currency,
          near: criteria.near?.label,
          radiusKm: criteria.radiusKm,
        })}\n\nCandidates:\n${JSON.stringify(compact)}\n\nReturn ONLY the JSON described in your instructions.`,
      },
    ],
  });

  const parsed = parseJsonObject(textOf(message));
  if (!parsed?.listings) return null;

  const byIndex = new Map(parsed.listings.map((r) => [r.i, r]));
  const byKey = new Map(parsed.listings.map((r) => [r.key, r]));

  const enriched = listings.map((l, i) => {
    const verdict = byIndex.get(i) ?? byKey.get(l.key);
    if (!verdict) return l;
    return {
      ...l,
      name: verdict.name ?? l.name,
      status: normalizeStatus(verdict.status) ?? l.status,
      score: numeric(verdict.score) ?? l.score,
      notes: verdict.notes ?? l.notes,
      caveats: verdict.caveats ?? l.caveats,
      daylight: verdict.daylight ?? l.daylight,
      rawNotes: l.rawNotes,
    };
  });

  // Rank by AI score (desc), keeping unscored rows after scored ones.
  enriched.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  enriched.forEach((l, idx) => {
    l.rank = idx + 1;
  });

  log(`AI scored ${parsed.listings.length}/${listings.length} listing(s).`);
  return { listings: enriched, summary: parsed.summary };
}

function buildScoringSystemPrompt(config) {
  const budgets = Object.values(config.budgets ?? {})
    .map((b) => `${b.label}: ${b.note ?? ""}`)
    .join("; ");
  return [
    `You are the ${config.appName} ranking agent. Score scraped apartment leads against the user's real preferences.`,
    config.neighborhoods?.length && `Preferred areas: ${config.neighborhoods.join(", ")}.`,
    config.mustHaves?.length && `Must-haves: ${config.mustHaves.join(", ")}.`,
    config.furnitureFit && `Furniture that must fit: ${config.furnitureFit}.`,
    budgets && `Budget guidance by track: ${budgets}.`,
    config.commuteTarget && `Short commute to ${config.commuteTarget.name} is valuable.`,
    "",
    "For each candidate return a JSON object. Respond with ONLY this JSON (no prose):",
    `{"summary": string, "listings": [{"i": number, "key": string, "score": number (0-100 fit), "status": "shortlist"|"monitor"|"excluded", "name": string, "notes": string (<=280 chars, explain fit/caveats), "caveats": string[], "daylight": string?}]}`,
    "Only use status 'shortlist' for genuinely strong, tour-worthy fits. Do not invent facts not implied by the candidate data.",
  ]
    .filter(Boolean)
    .join("\n");
}

// --- helpers -------------------------------------------------------------

function textOf(message) {
  return (message.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

function parseJsonArray(text) {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function mergeByUrl(base, extra) {
  const seen = new Set(base.map((l) => canon(l.url)));
  const merged = [...base];
  for (const item of extra) {
    if (!seen.has(canon(item.url))) {
      seen.add(canon(item.url));
      merged.push(item);
    }
  }
  return merged;
}

function canon(url) {
  return (url ?? "").split("?")[0].replace(/\/$/, "").toLowerCase();
}

function normalizeStatus(status) {
  return ["shortlist", "monitor", "excluded", "archived"].includes(status) ? status : null;
}

function trackFor(bedrooms) {
  const n = Number(bedrooms);
  if (!Number.isFinite(n)) return "unknown";
  if (n <= 1) return "1br";
  if (n === 2) return "2br";
  return "3br";
}

function numeric(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
