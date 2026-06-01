# Alcove

A self-hosted dashboard for running a serious apartment search. Alcove turns a
messy hunt across portals, brokers, and operator sites into a single, ranked,
photo-rich shortlist you can browse, filter, favorite, annotate, and track
through touring.

It pairs a polished **Next.js** front end with a **Convex** real-time backend
and three ways to get listings in:

1. **Add by URL** — paste any listing link and a Claude agent researches it,
   verifies the details, structures them, and pulls in photos.
2. **Discover** — a Firecrawl crawler sweeps your curated sources and search
   queries to surface fresh candidate listings.
3. **Bulk import** — feed in structured runs from your own automation/agent and
   Alcove upserts them with images.

Everything that is specific to *one person's* hunt — the city, the commute
target, neighborhoods, budgets, and the sources to crawl — lives in a single
[`alcove.config.mjs`](./alcove.config.mjs), so you can point it at your own
search without touching application code.

> The defaults describe a Manhattan rental search. Edit `alcove.config.mjs` to
> make it yours.

---

## Table of contents

- [Features](#features)
- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Getting listings in](#getting-listings-in)
- [Scripts](#scripts)
- [Deployment](#deployment)
- [Project structure](#project-structure)
- [Documentation](#documentation)
- [Notable caveats](#notable-caveats)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **AI URL importer** — paste a listing link; a Claude agent (with web search +
  fetch) verifies and structures it, then attaches photos. Live job status is
  streamed into the UI.
- **Firecrawl discovery** — search + site-map your curated operators and queries
  into a ranked, de-duplicated candidate pool.
- **Ranked shortlist** — model-scored ordering with favorites, manual
  hide/exclude, and tour-status tracking (`not yet` → `touring` → `toured`).
- **Rich apartment drawer** — gallery, floor plans, stats, location map,
  commute link, move-in details, and free-form notes.
- **Filtering & search** — by bedroom track, price, bathrooms, favorites,
  toured-only, plus text search.
- **Image storage on Cloudflare R2** — served via a public custom domain or a
  built-in private proxy.
- **schema.org-shaped data** — listings, units, and offers use portable
  `RealEstateListing` / `Apartment` / `Offer` shapes plus an app-specific
  assessment block, so your data isn't locked in.

## How it works

```
                 ┌──────────────────────────────────────────────┐
                 │                  Next.js app                   │
                 │  apartment grid · filters · drawer · add-URL   │
                 └───────────────▲───────────────┬───────────────┘
                                 │ live query     │ mutations
                                 │                ▼
                 ┌──────────────────────────────────────────────┐
                 │                    Convex                      │
                 │  apartments · images · searchRuns · import     │
                 │  jobs   +   apartmentImportActions (AI import) │
                 └───▲───────────────▲───────────────────▲───────┘
                     │               │                    │
        upsert (CLI) │   upsert +    │ images             │ images
                     │   schedule    │                    ▼
   ┌─────────────────┴───┐   ┌───────┴────────┐   ┌───────────────┐
   │ import-apartment-    │   │  Anthropic     │   │ Cloudflare R2 │
   │ runs.mjs (your runs) │   │  (Claude +     │   │  (S3 images)  │
   └─────────────────────┘    │  web tools)    │   └───────────────┘
   ┌─────────────────────┐    └────────────────┘
   │ discover-apartments  │ → data/firecrawl-discovery/<date>.json
   │ -firecrawl.mjs       │   (candidate URLs you feed to your agent)
   └─────────────────────┘
```

The three data paths are described in detail in
[Getting listings in](#getting-listings-in) and
[`docs/architecture.md`](./docs/architecture.md).

## Tech stack

- [Next.js 16](https://nextjs.org/) (App Router, React 19) + Tailwind CSS v4
- [Convex](https://convex.dev/) — database, server functions, scheduling, file
  storage
- [Anthropic Claude](https://docs.anthropic.com/) — the URL import agent
- [Firecrawl](https://www.firecrawl.dev/) — listing discovery
- [Cloudflare R2](https://developers.cloudflare.com/r2/) — image storage (S3 API)
- [Google Static Maps](https://developers.google.com/maps/documentation/maps-static/overview)
  — location previews (optional)

## Quick start

> Full, click-by-click instructions (creating each account, getting each key)
> are in [`docs/setup.md`](./docs/setup.md). This is the short version.

**Prerequisites:** Node.js ≥ 20 and a Convex account. Anthropic, Firecrawl, R2,
and Google Maps are needed only for the features that use them.

```bash
# 1. Clone and install
git clone https://github.com/Neesh774/alcove.git
cd alcove
cp .env.example .env.local      # then fill in values (see docs/configuration.md)
npm install

# 2. Start Convex (writes CONVEX_DEPLOYMENT + NEXT_PUBLIC_CONVEX_URL to .env.local)
npx convex dev

# 3. In a second terminal, start the app
npm run dev                     # http://localhost:3000
```

With Convex and the app running you'll have an empty dashboard. Set
`ANTHROPIC_API_KEY` on your Convex deployment (`npx convex env set
ANTHROPIC_API_KEY ...`) and use **Add apartment** in the header to import your
first listing by URL.

Then make it your own by editing [`alcove.config.mjs`](./alcove.config.mjs).

## Configuration

Two places hold all configuration:

| File | What it controls |
| --- | --- |
| [`alcove.config.mjs`](./alcove.config.mjs) | Your *search profile*: city/region, commute target, neighborhoods, budget bands, must-haves, query sets, curated sources, and the Claude model. |
| `.env.local` (+ Convex/host env) | Secrets and service URLs. See [`.env.example`](./.env.example). |

Environment variables live in up to three places depending on which code uses
them — local `.env.local` for scripts and the dev server, the **Convex
deployment** env for the in-app importer, and your **host** (e.g. Vercel) for
the deployed app. Every variable and where it's needed is documented in
[`docs/configuration.md`](./docs/configuration.md).

## Getting listings in

| Path | Command / surface | Good for | Needs |
| --- | --- | --- | --- |
| **Add by URL** | "Add apartment" button in the app | one listing at a time, fully automated | Anthropic + R2 (on Convex) |
| **Discovery** | `npm run discover:apartments` | finding fresh candidate URLs | Firecrawl |
| **Bulk import** | `npm run import:apartment-runs` | loading structured runs from your own automation | Convex + R2 |

The discovery crawler outputs **candidate URLs** (not finished listings) to
`data/firecrawl-discovery/<date>.json`. Turning those candidates into the
structured `runs.json` that the bulk importer consumes is the job of *your own
automation* — an agent, a script, or a person. That contract is what makes
Alcove reusable: implement it however you like, as long as the output matches
the documented shape in [`docs/data-model.md`](./docs/data-model.md).

> No sample run data ships with this repo. Bring your own listings via any of
> the three paths above.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the Next.js dev server. |
| `npm run build` / `npm run start` | Production build / serve. |
| `npm run lint` | ESLint via `next lint`. |
| `npm run convex:dev` | Run the Convex dev backend (codegen + live functions). |
| `npm run convex:deploy` | Deploy Convex functions to production. |
| `npm run discover:apartments` | Firecrawl discovery → candidate URL JSON. |
| `npm run import:apartment-runs` | Upsert structured runs + attach images. |
| `npm run migrate:images:r2` | Migrate existing Convex-stored images to R2. |

Script flags (dry-run, image limits, storage backend, etc.) are documented in
[`docs/data-model.md`](./docs/data-model.md#import--migration-tooling). The
`scripts/probe-*.mjs` files are internal dev utilities (Playwright-based UI
probes) and are not part of normal operation.

## Deployment

- **Frontend:** any Node host. [Vercel](https://vercel.com/) is the easy path —
  import the repo and add the same env vars from `.env.local`.
- **Backend:** `npm run convex:deploy` (or connect Convex to your Git host).
  Remember to set `ANTHROPIC_API_KEY` and the `R2_*` vars on the **Convex**
  deployment, not just locally — the AI importer runs inside Convex.
- **Images:** create an R2 bucket and (optionally) map a public custom domain;
  otherwise images are served by the built-in `/api/images/r2` proxy.

See [`docs/setup.md`](./docs/setup.md#deployment) for the full checklist.

## Project structure

```
alcove/
├── alcove.config.mjs       # ← your search profile (edit this)
├── app/                    # Next.js App Router
│   ├── _components/        # UI: grid, drawer, filters, design-system primitives
│   ├── _lib/               # client helpers (apartment shaping, maps, hooks)
│   └── api/                # OG image + R2 image proxy route handlers
├── convex/                 # Convex backend
│   ├── schema.ts           # database schema (schema.org-shaped)
│   ├── apartments.ts       # queries + mutations for listings
│   ├── apartmentImports.ts # URL import jobs (queue + status)
│   ├── apartmentImportActions.ts  # the Claude-powered importer (Node action)
│   ├── images.ts           # image rows (Convex storage + R2)
│   └── searchRuns.ts       # search-run bookkeeping
├── scripts/                # CLIs: discovery, import, R2 migration, dev probes
├── data/                   # local run data (gitignored; folders kept via .gitkeep)
└── docs/                   # detailed documentation
```

## Documentation

- [`docs/setup.md`](./docs/setup.md) — step-by-step setup for every service.
- [`docs/configuration.md`](./docs/configuration.md) — `alcove.config.mjs`
  reference + full environment-variable table.
- [`docs/architecture.md`](./docs/architecture.md) — runtimes, data flow, and
  the three ingestion paths in depth.
- [`docs/data-model.md`](./docs/data-model.md) — Convex schema, the
  `runs.json` / discovery JSON shapes, `sourceKey` conventions, and CLI flags.
- [`convex/README.md`](./convex/README.md) — Convex-specific backend notes.

## Notable caveats

- **Icons are vendored, not from a package.** The UI's icons live as local SVGs
  in `app/_components/ui/icons/svg/` and compile to a typed React module via
  `npm run build:icons` — no icon dependency or license key needed. The current
  set was derived from [Nucleo](https://nucleoapp.com/); if you redistribute,
  confirm your icon licensing or replace the SVGs with your own. See
  [`app/_components/ui/icons/README.md`](./app/_components/ui/icons/README.md).
- **Single-user by default.** Alcove ships without authentication — it assumes a
  private, single-user deployment. Add auth (e.g. Convex Auth or Clerk) before
  exposing it publicly.
- **Respect source terms.** Discovery and the AI importer fetch third-party
  pages. Review the terms of the sites you crawl and any per-service rate
  limits/usage policies.

## Contributing

Contributions are welcome — see [`CONTRIBUTING.md`](./CONTRIBUTING.md). In
short: keep changes that are specific to one search inside `alcove.config.mjs`,
run `npm run lint` and `npx tsc --noEmit` before opening a PR, and don't commit
secrets or personal run data.

## License

[MIT](./LICENSE) © Neesh774
