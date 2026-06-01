# Data model & ingestion contracts

This is the reference for anyone wiring **their own automation or database** to
Alcove. It covers the Convex schema, the `runs.json` import contract, the
discovery output shape, `sourceKey` conventions, and the CLI flags.

## Convex schema

Defined in [`convex/schema.ts`](../convex/schema.ts). Listings use schema.org
shapes where they fit, plus an Alcove-specific `assessment`.

### `apartments`

| Field | Type | Notes |
| --- | --- | --- |
| `sourceKey` | `string` | **Stable identity.** Re-imports upsert by this. |
| `status` | `"shortlist" \| "monitor" \| "excluded" \| "archived"` | Pipeline state. |
| `track` | `"1br" \| "2br" \| "3br" \| "unknown"` | Bedroom track. |
| `rank` | `number?` | Sort order within results. |
| `score` | `number?` | Optional model score. |
| `listing` | `RealEstateListing` | `url`, `name?`, `description?`, `provider?`, `additionalProperty?`. |
| `apartment` | `Apartment` | address, geo, floor size, beds/baths, amenities, etc. |
| `offer` | `Offer` | `price?`, `priceCurrency?`, `availability?`, `availabilityStarts?`, lease. |
| `assessment` | object | commute, `verification` (freshness + `lastVerifiedAt`), `confidence` (photos/floorPlan), caveats, rejection reasons, daylight/kitchen/bathroom/floorPlan/furnitureFit notes. |
| `tags` | `string[]?` | Free-form tags. |
| `isFavorite` | `boolean?` | User toggle. |
| `hidden` | `boolean?` | Soft-hide from ranking. |
| `userNotes` | `string?` | User notes, shown above the AI assessment. |
| `tourStatus` | `"not_yet" \| "touring" \| "toured"?` | Tour progress. |
| `createdAt` / `updatedAt` | `number` | Epoch ms. |

Indexes: `by_source_key`, `by_status`, `by_track`, `by_status_track`,
`by_updated_at`.

### `apartmentImages`

Linked to an apartment; stored on Convex file storage (`storageId`) or R2
(`r2: { bucket, key, etag?, contentLength?, ... }`). Carries an
`image` (`ImageObject`-like) block, a `kind`
(`photo`/`floor_plan`/`building`/`other`), `order`, and `sourceUrl`.

### `searchRuns`

`startedAt`, `completedAt?`, `status` (`running`/`completed`/`failed`),
`summary?`, `sourcesSearched?`, `blindSpots?`, `notes?`.

### `apartmentImportJobs`

Queue + status timeline for the Add-by-URL flow: `sourceUrl`, `normalizedUrl`,
`status`, an `events[]` log, and links to the resulting `apartmentId` /
`searchRunId`.

## `sourceKey` conventions

Use a stable, human-meaningful key so reruns update the same row instead of
duplicating it. Examples:

```txt
streeteasy:https://streeteasy.com/building/example/4f
equity:beatrice:105-w-29th:unit-12a
```

If you don't supply one, the import tooling derives a key from the listing URL.

## `runs.json` — the bulk-import contract

`npm run import:apartment-runs` reads a JSON file (default path
`data/automation-backfill/runs.json`, override with a positional arg). **No
sample ships in this repo** — your automation produces this file. Shape:

```jsonc
{
  "runs": [
    {
      "id": "daily-search-2026-05-13",      // stable run id (deduped on rerun)
      "runDate": "2026-05-13",               // YYYY-MM-DD
      "summary": "…",                        // optional
      "notes": "…",                          // optional
      "sourcesSearched": ["streeteasy.com"], // optional
      "blindSpots": ["no Tribeca coverage"], // optional
      "listings": [ /* CompactListing objects, see below */ ]
    }
  ]
}
```

### `CompactListing` fields

Each entry in `listings[]`. Only `url` is strictly required; richer fields
produce better cards. (This mirrors the `CompactListing` type in
[`convex/apartmentImportActions.ts`](../convex/apartmentImportActions.ts).)

| Field | Type | Notes |
| --- | --- | --- |
| `url` | `string` | **Required.** Canonical listing URL. |
| `key` / `sourceKey` | `string?` | Stable identity (see above). |
| `provider` | `string?` | e.g. "Equity Apartments". |
| `name` | `string?` | Specific, e.g. "105 W 29th St #12A". |
| `streetAddress`, `neighborhood` | `string?` | Address parts. |
| `status` | status enum? | Defaults applied if omitted. |
| `track` | track enum? | Inferred from `bedrooms` if omitted. |
| `rank`, `score` | `number?` | Ordering. |
| `price`, `priceMin`, `priceMax`, `priceDisplay`, `priceCurrency` | mixed | Rent. |
| `bedrooms`, `bathrooms`, `fullBathrooms`, `partialBathrooms` | `number?` | Counts. |
| `squareFeet`, `squareFeetMin`, `squareFeetMax`, `floorLevel`, `rooms`, `layout` | mixed | Size/layout. |
| `availability`, `availabilityStarts`, `availabilityDisplay` | `string?` | Availability. |
| `freshness`, `verificationNote`, `verifiedOn` | mixed | Verification. |
| `commute` | `{ minutes?, route?, notes? }?` | Paired with `alcoveConfig.commuteTarget`. |
| `amenities` | `string[]?` | User-facing amenity labels. |
| `laundry`, `dishwasher` | `"yes" \| "no" \| "unknown"?` | Key amenities. |
| `petsAllowed` | `boolean?` | |
| `tourUrl` | `string?` | Tour booking link. |
| `mustHaveEvidence`, `daylight`, `kitchen`, `bathroom`, `floorPlan`, `furnitureFit` | `string?` | Assessment prose. |
| `photoConfidence`, `floorPlanConfidence` | confidence enum? | |
| `caveats`, `rejectionReasons`, `tags` | `string[]?` | |
| `notes`, `rawNotes` | `string?` | Short notes. |

The importer normalizes these into the schema.org shapes, applies a stricter
shortlist gate (tour-worthy + high confidence stays `shortlist`; conditional
rows become `monitor`), upserts by `sourceKey`, and attaches images.

### Writing directly instead

You don't have to use `runs.json`. Your automation can call the Convex
mutation `api.apartments.upsert` directly with a fully-shaped apartment object
(see the example below) — that's the same entry point the importers use.

```jsonc
// api.apartments.upsert  ({ apartment: { ... } })
{
  "sourceKey": "equity:beatrice:105-w-29th:unit-12a",
  "status": "shortlist",
  "track": "1br",
  "rank": 1,
  "listing": {
    "url": "https://www.equityapartments.com/.../beatrice-apartments",
    "name": "Beatrice Apartments unit 12A",
    "provider": "Equity Apartments"
  },
  "apartment": {
    "name": "105 W 29th St #12A",
    "address": { "streetAddress": "105 W 29th St", "addressLocality": "New York", "addressRegion": "NY", "addressCountry": "US" },
    "floorSize": { "value": 643, "unitText": "sq ft" },
    "numberOfBedrooms": 1,
    "numberOfBathroomsTotal": 1,
    "amenityFeature": [ { "name": "Dishwasher", "value": true }, { "name": "Laundry", "value": true } ]
  },
  "offer": { "url": "https://…", "price": 5890, "priceCurrency": "USD", "availabilityStarts": "2026-05-15", "businessFunction": "LeaseOut" },
  "assessment": {
    "verification": { "freshness": "verified_live", "lastVerifiedAt": 1778944027000 },
    "confidence": { "photos": "medium", "floorPlan": "high" },
    "commute": { "toLocation": { "name": "1 Example Plaza" }, "minutes": 18, "route": "N/R/W to Prince St" }
  }
}
```

## Discovery output shape

`npm run discover:apartments` writes
`data/firecrawl-discovery/<date>.json`:

```jsonc
{
  "runDate": "2026-05-20",
  "generatedAt": "2026-05-20T12:00:00.000Z",
  "configVersion": 1,
  "status": "ok",            // or "degraded"
  "degraded": false,
  "degradedReasons": [],
  "queries": [ /* the query set used */ ],
  "mappedRoots": [ /* curated sources mapped */ ],
  "stats": { "rawCount": 0, "uniqueCount": 0, "keptCount": 0, "directOperatorCount": 0, "…": 0 },
  "errors": [],
  "candidates": [
    {
      "url": "…", "canonicalUrl": "…", "domain": "…",
      "providerHint": "…", "sourceKind": "direct_operator_unit",
      "trackHints": ["1br"], "neighborhoodHints": ["Chelsea"],
      "priority": 100, "flags": ["availability_signal", "price_signal"]
    }
  ]
}
```

These are **candidates to research**, not finished listings. Feed them to your
automation to produce `runs.json` (or use the in-app Add-by-URL importer).

## Import & migration tooling

`npm run import:apartment-runs -- [file] [flags]`:

| Flag | Default | Effect |
| --- | --- | --- |
| `[file]` (positional) | `data/automation-backfill/runs.json` | Input file. |
| `--dry-run` | off | Print planned upserts without writing. |
| `--no-images` | off | Skip image fetch/upload. |
| `--no-search-images` | off | Don't fall back to search-derived images. |
| `--image-limit=N` | 4 | Max images per listing. |
| `--image-storage=r2\|convex` | `r2` | Where to store images. |
| `--bucket=NAME` | from env | Override the R2 bucket. |
| `--no-create-bucket` | off | Don't auto-create the bucket. |

`npm run migrate:images:r2 -- [flags]`:

| Flag | Effect |
| --- | --- |
| `--dry-run` | Report what would migrate. |
| `--bucket=NAME` | Target bucket. |
| `--keep-convex-storage` | Copy instead of deleting the Convex source files. |

Required R2 env for both: `R2_S3_API_URL`, `R2_S3_ACCESS_KEY_ID`,
`R2_S3_SECRET_ACCESS_KEY` (+ optional bucket/public-URL vars). See
[`docs/configuration.md`](./configuration.md#cloudflare-r2).
