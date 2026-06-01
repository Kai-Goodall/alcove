// Generate the daily apartment-search automation prompt from alcove.config.mjs.
//
//   npm run prompt:automation              # print the prompt
//   npm run prompt:automation > prompt.txt # save it
//
// Paste the output into a scheduled agent automation (Codex, Claude, etc.).
// The prompt drives a deep daily search, writes a date-stamped runs JSON to
// data/automation-backfill/, and imports it with `npm run import:apartment-runs`.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { alcoveConfig } from "../alcove.config.mjs";

const REPO_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const money = (n) => `$${Number(n).toLocaleString("en-US")}`;

function budgetPhrase(band) {
  const parts = [];
  if (band.preferred) {
    parts.push(`preferred ${money(band.preferred[0])}–${money(band.preferred[1])}`);
  } else if (band.max !== undefined) {
    parts.push(`up to ${money(band.max)}`);
  }
  if (band.hardCap !== undefined) parts.push(`hard cap ${money(band.hardCap)}`);
  if (band.stretch !== undefined) {
    parts.push(`stretch to ${money(band.stretch)} only for an unusually strong apartment`);
  }
  return parts.join("; ");
}

function trackBlock(key, band, index) {
  const letter = String.fromCharCode(65 + index); // A, B, C, ...
  const lines = [
    `Track ${letter}: ${band.label} apartments.`,
    `- Budget ${budgetPhrase(band)}.`,
  ];
  if (band.note) lines.push(`- ${capitalize(band.note)}.`);
  if (band.extra) lines.push(`- ${capitalize(band.extra)}.`);
  return lines.join("\n");
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function buildAutomationPrompt(config = alcoveConfig) {
  const { location, commuteTarget, neighborhoods, budgets, mustHaves, furnitureFit, automation } =
    config;
  const city = location.city;
  const commute = commuteTarget?.name;
  const tracks = Object.entries(budgets);
  const trackLabels = tracks.map(([, b]) => b.label).join(", ");
  const dataDir = "data/automation-backfill";

  const sampleQueries = neighborhoods
    .slice(0, 6)
    .map((n) => `"${n} ${city} rental building availability 1 bedroom 2 bedroom 3 bedroom"`)
    .join(", ");

  return `Automation: ${automation.name}

Run a deep, extensive apartment search for the user. Spend materially longer than a quick pass and aim for broad recall before ranking. Reason carefully and prioritize current, live, verified availability over stale indexed search results.

Working directory: ${REPO_PATH}

Critical freshness/link rules:
- Do NOT rely on Google/search-result snippets alone. Open every candidate URL before including it.
- Only include a listing in the main shortlist if the opened page currently shows the same unit, price, bed/bath count, and availability that you report.
- If a link is broken, redirects to a generic building page, shows a different unit, shows stale/no-longer-available inventory, or cannot be verified, exclude it from the main shortlist or put it in a clearly labeled lower-confidence monitor section.
- Prefer direct building/property-manager availability pages and active listing detail pages over old aggregated result pages.
- Include the source URL that actually verified the listing, not just a search result URL.
- For each candidate, include a short freshness note such as: "verified live on page", "availability page only", "search result stale, excluded", or "photos/floor plan inaccessible".
- If the site exposes current inventory tables, open the specific unit/floor-plan row when possible. If only the building page is accessible, say exactly what could and could not be verified.
- Be aggressive about rejecting mismatches. A smaller but accurate list is better than a long list with stale or wrong links.

Shortlist strictness:
- Keep the main shortlist intentionally small. It should mean "strong enough to tour," not "plausible if caveats resolve."
- A candidate belongs in the shortlist only if it is verified live, has strong apartment quality, has strong photo/floor-plan or size confidence, clears the commute requirement, and has no unresolved must-have failures.
- Conditional rows belong in monitor, not shortlist: missing square footage/floor plan, missing living-room dimensions, unclear laundry/dishwasher/A/C, model-only photos, building-page-only availability, stale/mismatched evidence, or too many caveats.
- It is acceptable for a track to have no shortlist candidates. Do not pad the shortlist just to fill every track.

The user has ${tracks.length} acceptable apartment tracks (${trackLabels}):

${tracks.map(([key, band], i) => trackBlock(key, band, i)).join("\n\n")}

Shared requirements for all tracks:
- ${capitalize(automation.moveIn)}
- Neighborhoods: ${neighborhoods.join(", ")}, plus immediately adjacent areas only if unusually strong${commute ? ` and still commuting well to ${commute}` : ""}.
${commute ? `- Commute to ${commute} is a hard priority: easy, ideally walking distance or one subway line, usually under/about 30 minutes. Include route/time and downgrade transfer-heavy or 35+ minute commutes unless exceptional.\n` : ""}- Must-haves: ${mustHaves.join(", ")}.
${furnitureFit ? `- Space is a hard filter. ${capitalize(furnitureFit)}. For 1BRs, verify the main living area comfortably fits these while keeping a usable walkway. For larger units, verify the main living room still does; extra bedrooms are bonus office/guest/flex rooms unless the layout suggests otherwise.\n` : ""}- Highest priority is the apartment/unit itself: daylight, windows, clean/renovated feel, bathroom/kitchen quality, and usable living area.

Anti-bias / discovery rules:
- Every run must begin with a fresh-market discovery sweep before revisiting prior winners. Do not anchor on the current shortlist/monitor set.
- Bias toward listings that are new, newly updated, newly repriced, or newly surfaced on direct operator pages since the last run.
- If a portal or operator supports sorting/filtering by newest, updated, available now, or recently reduced, use those views early in the run.
- A repeated apartment only deserves time if it still looks best after the fresh sweep or if the opened page shows a material change in price, availability, unit type, or evidence quality.
- Explicitly separate which listings are new this run, which remain viable from prior runs, and which prior candidates dropped out or went stale.

Search process requirements:
1. Start with broad search-engine discovery across all tracks, e.g. ${sampleQueries}, and similar neighborhood/building queries.
2. Open direct building and property-manager availability pages wherever possible. Inspect large rental operators and building sites including but not limited to: ${automation.operators.join(", ")}, and smaller direct building sites surfaced by search.
3. Also search ${automation.portals.join(", ")} where reasonable.
4. For each source, filter/query by track budgets (${tracks.map(([, b]) => `${b.label} ${budgetPhrase(b)}`).join("; ")}), plus must-haves and the move-in window. Start from newest/updated/reduced views before general relevance. Collect a broad candidate set first, then rank.
5. Inspect actual unit photos and floor plans where accessible. Distinguish evidence confirmed from photos/floor plan vs claimed only in text. If photos are model-only, missing, low-quality, or impossible to inspect, mark lower confidence rather than treating it as confirmed.
6. For promising listings, verify living-room dimensions or floor-plan fit where available. If no dimensions are provided, infer cautiously from photos and say what must be confirmed before touring.
7. Eliminate or downgrade units that fail live-page verification, commute, furniture fit, daylight, bathroom/kitchen quality, A/C/heat, bathroom-count expectations, or availability.
8. Only after the fresh-market discovery pass should you revisit prior shortlist/monitor rows to check whether they still beat newly found inventory.

Database handoff requirements:
- Do not modify UI files or add client-side listing logic. Keep persistence work in the Convex/backend tooling in ${REPO_PATH}.
- Every run must do both: persist apartments to the Alcove Convex backend AND send the user the normal human-readable summary. The database write does not replace messaging the user.
- Write a date-specific JSON file in ${REPO_PATH}/${dataDir}/ using the compact runs shape documented in docs/data-model.md. Include the run id/date, summary, sources searched, blind spots, and every shortlist, monitor, and excluded/stale candidate.
- For each listing include the source URL, stable sourceKey when the URL alone is not enough, provider, name, address/unit/neighborhood, status, track, rank when applicable, price/range, bed/bath count, square feet/range, availability, freshness, verification note, commute, must-have evidence, photo/floor-plan confidence, furniture fit, caveats, rejection reasons, and raw notes. Include enough building/address/neighborhood detail for image-search fallback to work well.
- Use stable listing identity: source URLs should generally become the sourceKey; use provider/building/unit keys for building inventory rows so reruns update instead of duplicating.
- From ${REPO_PATH}, run \`npm run import:apartment-runs -- ${dataDir}/<date-specific-file>.json\` to upsert listings, enforce the stricter shortlist rules, visit the source links, download fetchable page images, upload them to image storage (Cloudflare R2 by default), and attach them to the listing rows.
- Leave image fetching enabled. The importer tries the listing page first, then uses search/image-search fallback from the building name, address, provider, and neighborhood when exact unit images are blocked or missing. Only use publicly fetchable images from real pages/search results; do not invent image URLs or bypass access controls.
- If a page/image fetch is blocked, 404s, or exposes no real image candidates, still upsert the listing with the correct confidence/caveat and report the blocked source.
- If the importer fails, report the exact command and failure, and leave the JSON file in place so it can be rerun.

Output:
- First provide a ranked shortlist split by track. If a track has no genuinely shortlist-worthy rows, say so instead of padding it.
- For every candidate include source links, rent, neighborhood, availability${commute ? `, commute to ${commute}` : ""}, must-have evidence, photo/floor-plan confidence, space/furniture assessment, freshness/link verification note, caveats, and why it is worth touring.
- Then include a broader "also found / monitor" section with weaker candidates (price, timing, space, photos, commute, stale/mismatched links, missing availability, unresolved must-haves, or missing the expected bathroom count).
- Include a short "what changed since last run" subsection separating new additions, still-viable repeats, and dropped/stale prior candidates.
- Mention sources searched and important blind spots, especially sites that blocked photos, lacked current availability, or produced stale/mismatched listings.
- End with a short database note: how many rows were upserted, how many images were attached, whether fallback image search was needed, and which source pages (if any) blocked image fetching.`;
}

process.stderr.write(
  `# ${alcoveConfig.automation.name}\n` +
    `# Generated from alcove.config.mjs. Edit that file and re-run to customize.\n` +
    `# Paste the prompt below into a scheduled agent automation (Codex, Claude, etc.).\n` +
    `# Tip: \`npm run prompt:automation > prompt.txt\` to save it.\n\n`,
);
process.stdout.write(buildAutomationPrompt() + "\n");
