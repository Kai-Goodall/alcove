# Autonomous apartment search

Alcove can search and scrape rental sources for you and load the results into
the dashboard — from the CLI (`npm run search`) or the in-app **Search** dialog.

There are two modes, by design:

1. **Key-free mode — no API keys, no paid AI.** Pure scraping of sources that
   expose structured data without a login (Kijiji, Zillow, Bamboo Housing,
   Craigslist, Reddit, your own list of apartment-complex sites). Free
   geocoding (OpenStreetMap Nominatim) powers proximity filtering and lets you
   type any city without touching config.
2. **AI mode (`--ai` / the in-app toggle).** Adds an Anthropic pass that
   discovers more listings via web search (Apartments.com, complex sites, and
   other places scrapers can't reach) and scores/ranks every candidate against
   your `alcove.config.mjs` preferences. Bring your own key: paste it into the
   in-app dialog (stored only in your browser) or set `ANTHROPIC_API_KEY` on
   the server. Degrades gracefully to key-free mode if a call fails.

AI mode also powers the in-app **Assistant** (header button): a chat panel that
reads your current listings and search profile, compares options, flags
caveats, and can web-search neighborhoods and buildings to help you decide.

Search is **region-agnostic**: each source is an adapter that decides whether
it can serve the requested location, and a typed city is geocoded to resolve
its region/country automatically. Pointing Alcove at a new city is a config
change (or just typing the city in the dialog), not new application code.

## Quick start

```bash
# Uses the search profile in alcove.config.mjs
npm run search

# Override criteria on the fly and import straight into Convex
npm run search -- --city=Waterloo --beds=1-2 --max-price=2200 \
  --near="University of Waterloo" --radius=6 --import

# AI mode (needs an Anthropic key)
npm run search -- --ai --import
```

Without `--import`, results are written to
`data/automation-backfill/search-<date>.json` (the standard import contract),
which you can review and load later with `npm run import:apartment-runs`.

### In the app

Click **Search** in the header, set city / bedrooms / max rent / proximity /
sources, optionally flip on **AI deep search** (paste an Anthropic key, or
leave blank to use the server's), and run it. The route scrapes, upserts,
attaches images, and lists what it added; the dashboard updates live. The
in-app path needs `NEXT_PUBLIC_CONVEX_URL`.

Click **Assistant** to chat about your collected listings — comparisons,
caveats, which to tour first, neighborhood questions (it can search the web).

## CLI options

| Flag | Description |
| --- | --- |
| `--city`, `--region`, `--country` | Override the configured location. A bare `--city` is geocoded to infer region/country. |
| `--beds=MIN-MAX` | Bedroom range (or a single number). Also `--min-beds` / `--max-beds`. |
| `--min-price`, `--max-price` | Monthly rent bounds. |
| `--currency` | e.g. `CAD`, `USD`. |
| `--near="PLACE"` | Proximity anchor (address/landmark); `""` disables. Defaults to `commuteTarget`. |
| `--radius=KM` | Radius around `--near` to keep. |
| `--sources=a,b,c` | Adapters to run. |
| `--limit=N` | Max listings per source. |
| `--out=FILE` | Output `runs.json` path. |
| `--import` | Upsert into Convex after searching. |
| `--ai` | AI mode: Anthropic discovery + ranking. |
| `--api-key=KEY` | Anthropic key for `--ai` (default: `ANTHROPIC_API_KEY` env). |
| `--dry-run` | Search and print without writing/importing. |

## Sources

| Adapter id | Site | Region | Notes |
| --- | --- | --- | --- |
| `kijiji` | Kijiji | Canada | Structured (`__APOLLO_STATE__`); most reliable in CA. |
| `zillow` | Zillow | US + Canada | Structured (`__NEXT_DATA__`); covers much of the purpose-built complex inventory (a large overlap with Apartments.com). Buildings expand to one row per advertised unit type. |
| `bamboo` | Bamboo Housing | Canada (university towns) | Structured (`__NEXT_DATA__`); great for Waterloo. |
| `craigslist` | Craigslist | Anywhere Craigslist operates | Uses Craigslist's own JSON search API + the official area reference, so any Craigslist city works. Rate-limited from datacenter IPs. |
| `reddit` | Reddit city subreddits | Configurable | **Best effort** — Reddit throttles unauthenticated clients hard. Runs several targeted queries (rent/sublet/lease + your bedroom range) and turns surviving posts into leads. Configure subs via `search.redditSubreddits`. AI mode reads Reddit much more reliably via web search. |
| `custom` | Your apartment-complex sites | — | Scrapes each URL in `search.customSites`: JSON-LD first (RentCafe/Entrata/Yardi sites often emit it), then a conservative "N bed … $X,XXX" heuristic, else a tracked lead row pointing at the page. |
| `rentals_ca` | Rentals.ca | Canada | **Best effort** — bot-protected, often 403 without residential IP. |
| `apartments` | Apartments.com | US | Walled (Akamai blocks non-browser clients outright). Use AI mode — Claude's web search reads it — or Add-by-URL. Zillow covers much of the same inventory key-free. |
| `marketplace` | Facebook Marketplace | — | Walled: requires login; not supported key-free. |

When a source is blocked, unmapped, or empty, the run records it as a **blind
spot** (visible in the CLI output and on the search run) instead of failing.

### Tracking specific apartment complexes

Add each complex's availability/floor-plans page to `search.customSites` in
`alcove.config.mjs`:

```js
customSites: [
  "https://example-complex.com/availability",
  { url: "https://another.com/floor-plans", label: "Another Tower" },
],
```

Complexes behind Cloudflare-style bot walls fall back to a single lead row so
they still show up in your dashboard as something to check; AI deep search can
usually read them fully. Reddit is a good way to *find* complexes people
recommend — ask the Assistant to search your city's subreddit for suggestions,
then add the sites here.

## Configuration

The `search` block in [`alcove.config.mjs`](../alcove.config.mjs) holds the
default criteria, proximity anchor, radius, source list, `customSites`,
`redditSubreddits`, per-source limit, and the Nominatim contact string.
`buildSearchCriteria(overrides)` layers CLI/UI overrides on top of those
defaults.

## AI mode and API keys

Three ways to provide the Anthropic key, in order of precedence:

1. **Pasted in the app** (Search dialog or Assistant panel) — stored in your
   browser's localStorage only, sent per-request, never persisted server-side.
2. `--api-key=…` on the CLI.
3. `ANTHROPIC_API_KEY` in the server/CLI environment.

Everything outside AI deep search and the Assistant works with no key at all.

## How it works

```
criteria (config + overrides; typed city geocoded to region/country)
      │
      ▼
 source adapters ──► RawListing[]  (plain fetch + embedded JSON / JSON APIs, no keys)
      │
      ▼
 filter (beds/price) ─► dedupe ─► geocode + proximity filter (Nominatim)
      │
      ▼            (optional AI mode)
 CompactListing[] ──► Anthropic discovery (web search) + scoring/ranking
      │
      ▼
 runs.json  ──►  import-apartment-runs.mjs   (CLI)
 upsert     ──►  api.apartments.upsert        (in-app route)
```

Adapters live in [`scripts/search/adapters/`](../scripts/search/adapters). Each
exports `id`, `label`, `supports(criteria)`, `unsupportedReason(criteria)`, and
`search(criteria, ctx)`. Add a module, register it in `adapters/index.mjs`, and
it's available everywhere.

## Respect source terms

The scrapers fetch third-party pages. Review each site's terms of use and rate
limits before running at scale. Facebook Marketplace and other login-walled
sources are intentionally **not** scraped. Nominatim usage is throttled to its
1 request/second policy; set `search.geocodeContact` to your own identifier.
Reddit requests are throttled and capped per run.
