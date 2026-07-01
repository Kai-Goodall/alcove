# Autonomous apartment search

Alcove can search and scrape rental sources for you and load the results into
the dashboard — from the CLI (`npm run search`) or the in-app **Search** dialog.

There are two versions of the feature, by design:

1. **Version 1 — no API keys, no paid AI.** Pure scraping of sources that
   expose structured data without a login (Kijiji, Bamboo Housing, Craigslist).
   Free geocoding (OpenStreetMap Nominatim) powers proximity filtering.
2. **Version 2 — AI deep search (`--ai`).** Adds an Anthropic pass that
   discovers more listings via web search and scores/ranks every candidate
   against your `alcove.config.mjs` preferences. Requires `ANTHROPIC_API_KEY`
   and degrades gracefully to Version 1 if the key is missing or a call fails.

It is **region-agnostic**: each source is an adapter that decides whether it can
serve the configured `location`. Pointing Alcove at a new city is a config
change (and, for a brand-new metro, a one-line entry in an adapter's city map),
not new application code. Defaults target Waterloo/Kitchener, Ontario.

## Quick start

```bash
# Uses the search profile in alcove.config.mjs
npm run search

# Override criteria on the fly and import straight into Convex
npm run search -- --city=Waterloo --country=CA --beds=1-2 --max-price=2200 \
  --near="University of Waterloo" --radius=6 --import

# Version 2: AI deep search (needs ANTHROPIC_API_KEY)
npm run search -- --ai --import
```

Without `--import`, results are written to
`data/automation-backfill/search-<date>.json` (the standard import contract),
which you can review and load later with `npm run import:apartment-runs`.

### In the app

Click **Search** in the header, set bedrooms / max rent / proximity / sources,
optionally flip on **AI deep search**, and run it. The route scrapes, upserts,
and attaches images; the dashboard updates live. The in-app path needs
`NEXT_PUBLIC_CONVEX_URL` (and `ANTHROPIC_API_KEY` on the server for AI).

## CLI options

| Flag | Description |
| --- | --- |
| `--city`, `--region`, `--country` | Override the configured location. |
| `--beds=MIN-MAX` | Bedroom range (or a single number). Also `--min-beds` / `--max-beds`. |
| `--min-price`, `--max-price` | Monthly rent bounds. |
| `--currency` | e.g. `CAD`, `USD`. |
| `--near="PLACE"` | Proximity anchor (address/landmark); `""` disables. Defaults to `commuteTarget`. |
| `--radius=KM` | Radius around `--near` to keep. |
| `--sources=a,b,c` | Adapters to run. |
| `--limit=N` | Max listings per source. |
| `--out=FILE` | Output `runs.json` path. |
| `--import` | Upsert into Convex after searching. |
| `--ai` | Version 2 Anthropic enrichment. |
| `--dry-run` | Search and print without writing/importing. |

## Sources

| Adapter id | Site | Region | Notes |
| --- | --- | --- | --- |
| `kijiji` | Kijiji | Canada | Structured (`__APOLLO_STATE__`); most reliable. |
| `bamboo` | Bamboo Housing | Canada (university towns) | Structured (`__NEXT_DATA__`); great for Waterloo. |
| `craigslist` | Craigslist | US + Canada | RSS. Blocked on some datacenter IPs; works from residential. |
| `rentals_ca` | Rentals.ca | Canada | **Best effort** — bot-protected, often 403 without residential IP. |
| `apartments` | Apartments.com | US | Walled: needs paid unblocking. Use `--ai` or Add-by-URL. |
| `marketplace` | Facebook Marketplace | — | Walled: requires login; not supported key-free. |

When a source is blocked, unmapped, or empty, the run records it as a **blind
spot** (visible in the CLI output and on the search run) instead of failing.

## Configuration

The `search` block in [`alcove.config.mjs`](../alcove.config.mjs) holds the
default criteria, proximity anchor, radius, source list, per-source limit, and
the Nominatim contact string. `buildSearchCriteria(overrides)` layers CLI/UI
overrides on top of those defaults.

## How it works

```
criteria (config + overrides)
      │
      ▼
 source adapters ──► RawListing[]  (plain fetch + embedded JSON / RSS, no keys)
      │
      ▼
 filter (beds/price) ─► dedupe ─► geocode + proximity filter (Nominatim)
      │
      ▼            (optional --ai)
 CompactListing[] ──► Anthropic discovery + scoring/ranking
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
