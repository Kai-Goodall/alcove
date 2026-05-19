# Alcove Convex Backend

This backend uses standard schema.org-shaped objects where they fit, plus one
small app-specific assessment block for the apartment-search automation.

## Data Model

Each `apartments` document is an apartment listing composed of:

- `listing`: schema.org `RealEstateListing`-style source page data.
- `apartment`: schema.org `Apartment` / `Accommodation`-style unit data.
- `offer`: schema.org `Offer`-style price, availability, and lease data.
- `assessment`: Alcove-specific search notes for commute, verification,
  confidence, furniture fit, caveats, and rejection reasons.

The goal is to keep common real-estate fields portable while preserving the
extra evaluation criteria from the automation.

## Automation Flow

1. `searchRuns.create` starts a run.
2. `apartments.upsert` writes each shortlist, monitor, or excluded listing.
3. The automation uploads image bytes to Cloudflare R2 using the S3 API.
4. `images.attachR2` links the R2 object to an apartment as an
   `ImageObject`-style row.
5. The app reads `image.url`, which points to a public R2 URL when configured
   or the private `/api/images/r2` proxy otherwise.
6. `searchRuns.finish` stores run summary, searched sources, and blind spots.

## Import Tooling

Backfill or import automation output from a normalized JSON file:

```sh
npm run import:apartment-runs
```

The default input is `data/automation-backfill/runs.json`. The script:

- normalizes compact run data into the `RealEstateListing`, `Apartment`,
  `Offer`, and `assessment` shapes above;
- applies the stricter shortlist gate so only tour-worthy, high-confidence
  rows remain `shortlist`; conditional rows are imported as `monitor`;
- upserts listings by stable `sourceKey`;
- visits each source URL, extracts page image candidates, downloads image
  bytes, uploads them to R2, and attaches up to four images per listing;
- falls back to search-derived building/location images when the listing page
  is blocked, stale, or image-poor;
- reuses existing search runs/listings/images on reruns so the import is
  resumable.

Useful variants:

```sh
npm run import:apartment-runs -- --dry-run --no-images
npm run import:apartment-runs -- data/automation-backfill/runs.json --image-limit=6
npm run import:apartment-runs -- data/automation-backfill/runs.json --no-search-images
npm run import:apartment-runs -- data/automation-backfill/runs.json --image-storage=convex
npm run migrate:images:r2 -- --dry-run
npm run migrate:images:r2
npm run migrate:images:r2 -- --bucket=alcove
```

Required R2 env vars are `R2_S3_API_URL`, `R2_S3_ACCESS_KEY_ID`, and
`R2_S3_SECRET_ACCESS_KEY`. Set `R2_BUCKET_NAME` / `R2_BUCKET`, pass
`--bucket=...`, or embed the bucket in `R2_S3_API_URL`; otherwise the tooling
defaults to `alcove`. If the bucket is public behind a custom domain,
set `R2_PUBLIC_URL` / `NEXT_PUBLIC_R2_PUBLIC_URL`; otherwise images are served
through the private Next proxy. Existing Convex storage files are deleted after
a successful R2 migration by default; pass `--keep-convex-storage` for a
non-destructive copy.

## Stable Identity

Use a stable `sourceKey` so reruns update the same row:

```txt
streeteasy:https://streeteasy.com/building/example/4f
equity:beatrice:105-w-29th:unit-12a
```

## Example Upsert Payload

```json
{
  "apartment": {
    "sourceKey": "equity:beatrice:105-w-29th:unit-12a",
    "status": "shortlist",
    "track": "1br",
    "rank": 1,
    "listing": {
      "url": "https://www.equityapartments.com/new-york-city/chelsea/beatrice-apartments",
      "name": "Beatrice Apartments unit 12A",
      "provider": "Equity Apartments"
    },
    "apartment": {
      "name": "105 W 29th St #12A",
      "address": {
        "streetAddress": "105 W 29th St",
        "addressLocality": "New York",
        "addressRegion": "NY",
        "addressCountry": "US"
      },
      "floorSize": { "value": 643, "unitText": "sq ft" },
      "numberOfBedrooms": 1,
      "numberOfBathroomsTotal": 1,
      "amenityFeature": [
        { "name": "Dishwasher", "value": true },
        { "name": "Laundry", "value": true },
        { "name": "Air conditioning", "value": true }
      ]
    },
    "offer": {
      "url": "https://www.equityapartments.com/new-york-city/chelsea/beatrice-apartments",
      "price": 5890,
      "priceCurrency": "USD",
      "availabilityStarts": "2026-05-15",
      "businessFunction": "LeaseOut"
    },
    "assessment": {
      "verification": {
        "freshness": "verified_live",
        "lastVerifiedAt": 1778944027000,
        "note": "Verified live on direct operator page."
      },
      "confidence": {
        "photos": "medium",
        "floorPlan": "high"
      },
      "commute": {
        "toLocation": {
          "name": "1 Example Plaza",
          "address": {
            "streetAddress": "1 Example Plaza",
            "addressLocality": "New York",
            "addressRegion": "NY",
            "addressCountry": "US"
          }
        },
        "minutes": 18,
        "route": "N/R/W to Prince St or short cab"
      },
      "furnitureFit": "Living area appears likely to fit 100 inch couch and coffee table; confirm dimensions before touring."
    }
  }
}
```
