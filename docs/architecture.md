# Architecture

Alcove is a Next.js front end over a Convex backend, fed by three independent
ingestion paths and backed by Cloudflare R2 for images. This page explains how
the pieces fit and where code runs.

## Runtimes

Three distinct runtimes share the codebase. Knowing which is which explains the
project layout and why `alcove.config.mjs` is plain ESM.

| Runtime | What runs there | Reads |
| --- | --- | --- |
| **Browser / Next.js** | `app/**` — UI, route handlers (`/api/og`, `/api/images/r2`) | `NEXT_PUBLIC_*`, server-side `R2_*` for the image proxy |
| **Convex** | `convex/**` — queries, mutations, the `apartmentImportActions` Node action, scheduler | Convex deployment env (`ANTHROPIC_API_KEY`, `R2_*`) |
| **Local CLI** | `scripts/**` — discovery, import, R2 migration | `.env.local` / shell |

`alcove.config.mjs` is imported by all three, so it stays plain JavaScript with
no Node-only APIs. UI icons are vendored as local SVGs (see
`app/_components/ui/icons/`), so there's no icon package or license to install.

## Data model

Convex stores four tables (full field list in
[`docs/data-model.md`](./data-model.md)):

- **`apartments`** — one row per listing. Composed of schema.org-shaped
  `listing` (`RealEstateListing`), `apartment` (`Apartment`/`Accommodation`),
  and `offer` (`Offer`) blocks, plus an Alcove-specific `assessment` (commute,
  verification freshness, confidence, caveats, rejection reasons) and
  user-facing state (`isFavorite`, `hidden`, `tourStatus`, `userNotes`).
  Identified by a stable `sourceKey` so re-imports update in place.
- **`apartmentImages`** — image rows linked to an apartment, stored on Convex
  file storage or R2.
- **`searchRuns`** — bookkeeping for each ingestion run (summary, sources
  searched, blind spots).
- **`apartmentImportJobs`** — queue + status timeline for the Add-by-URL flow.

The schema.org shaping is deliberate: common real-estate fields stay portable,
so your data isn't trapped in an app-specific format.

## The three ingestion paths

### 1. Add by URL (in-app, AI)

```
User pastes URL
  → apartmentImports.createFromUrl (mutation)
      inserts an apartmentImportJobs row (status: queued)
      schedules apartmentImportActions.run (Node action)
  → run():
      fetch page snapshot (HTML → text, JSON-LD, image candidates)
      Claude (web_search + web_fetch) → structured listing (Zod-validated)
        retries once with validator feedback if required fields are missing
      apartments.upsert (by sourceKey)
      download + upload up to N images → R2 → images.attachR2
      searchRuns.finish, mark job completed
```

The UI subscribes to the job row and shows live status
(`queued → fetching_source → researching → extracting → upserting →
uploading_images → completed`). The agent's standards (neighborhoods, budgets,
commute, must-haves) come from `buildExtractionPrompt(alcoveConfig)`. There is
also a `repairCompletedImports` action that re-runs extraction for rows missing
required fields.

Runs in: **Convex**. Needs: `ANTHROPIC_API_KEY`, `R2_*` on the deployment.

### 2. Discovery (Firecrawl)

```
npm run discover:apartments
  → Firecrawl search over alcoveConfig.querySets[<set>]
  → Firecrawl map over alcoveConfig.curatedSources
  → shape, classify (operator/portal/broker), score, de-dupe, filter
  → write data/firecrawl-discovery/<date>.json (ranked candidates + stats)
```

The output is **candidate URLs**, not finished listings. It's the "what's out
there" step. Runs in: **local CLI**. Needs: `FIRECRAWL_API_KEY`.

### 3. Bulk import (your runs)

```
npm run import:apartment-runs [-- file.json ...flags]
  → read runs.json (your structured listings)
  → for each run: searchRuns.create
  → for each listing: apartments.upsert (by stable sourceKey)
      then fetch/derive images → R2 (or Convex storage) → images.attach*
  → reuses existing runs/listings/images on reruns (resumable)
```

Runs in: **local CLI**. Needs: Convex URL + `R2_*`. The `runs.json` shape is
documented in [`docs/data-model.md`](./data-model.md).

## How the paths connect (and where you plug in)

Discovery produces candidate URLs; bulk import consumes finished, structured
runs. **The step in between — turning candidates into structured listings — is
intentionally yours.** That can be:

- an agent/automation that reads the discovery JSON, researches each candidate,
  and emits `runs.json`; or
- the in-app Add-by-URL importer, one listing at a time; or
- a human curating a `runs.json` by hand.

As long as your automation emits the documented `runs.json` shape (or calls
`apartments.upsert` directly), Alcove doesn't care how it was produced. This is
what makes the repo reusable with *your own* automation and database.

## Images

Images are stored on Cloudflare R2 via the S3 API. Object keys are content-
addressed (`apartments/<id>/<part>-<sha>.<ext>`) for dedupe. Serving is either:

- **public** — directly from an R2 custom domain (`R2_PUBLIC_URL`); or
- **private** — through `app/api/images/r2/route.ts`, which signs requests with
  the `R2_*` credentials and caches aggressively.

Convex file storage is supported as a fallback (`--image-storage=convex`), and
`npm run migrate:images:r2` moves existing Convex-stored images to R2.

## Front end

The App Router renders a single dashboard (`app/page.tsx` → `HomePage`) that
live-queries `apartments.list` from Convex. Selecting a card opens a drawer
(gallery, stats, location map, move-in, notes). Filtering/sorting happens client
-side over the live list. The design system lives in `app/_components/ui/`.
`generateMetadata` builds per-apartment Open Graph metadata, rendered by the
`/api/og` route.
