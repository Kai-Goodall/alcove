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
3. `images.generateUploadUrl` returns a Convex upload URL.
4. The automation posts image bytes to that URL and receives a `storageId`.
5. `images.attach` links the stored file to an apartment as an `ImageObject`-style row.
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
  bytes, uploads them to Convex storage, and attaches up to four images per
  listing;
- falls back to search-derived building/location images when the listing page
  is blocked, stale, or image-poor;
- reuses existing search runs/listings/images on reruns so the import is
  resumable.

Useful variants:

```sh
npm run import:apartment-runs -- --dry-run --no-images
npm run import:apartment-runs -- data/automation-backfill/runs.json --image-limit=6
npm run import:apartment-runs -- data/automation-backfill/runs.json --no-search-images
```

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
