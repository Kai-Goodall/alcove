import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const track = v.union(
  v.literal("1br"),
  v.literal("2br"),
  v.literal("3br"),
  v.literal("unknown"),
);

const status = v.union(
  v.literal("shortlist"),
  v.literal("monitor"),
  v.literal("excluded"),
  v.literal("archived"),
);

const confidence = v.union(
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
  v.literal("blocked"),
  v.literal("unknown"),
);

const freshness = v.union(
  v.literal("verified_live"),
  v.literal("availability_page_only"),
  v.literal("stale_or_mismatch"),
  v.literal("unverified"),
);

const imageStorageProvider = v.union(v.literal("convex"), v.literal("r2"));

const apartmentImportStatus = v.union(
  v.literal("queued"),
  v.literal("fetching_source"),
  v.literal("researching"),
  v.literal("extracting"),
  v.literal("upserting"),
  v.literal("uploading_images"),
  v.literal("completed"),
  v.literal("failed"),
);

const quantitativeValue = v.object({
  value: v.optional(v.number()),
  minValue: v.optional(v.number()),
  maxValue: v.optional(v.number()),
  unitCode: v.optional(v.string()),
  unitText: v.optional(v.string()),
});

const postalAddress = v.object({
  streetAddress: v.optional(v.string()),
  addressLocality: v.optional(v.string()),
  addressRegion: v.optional(v.string()),
  postalCode: v.optional(v.string()),
  addressCountry: v.optional(v.string()),
});

const geoCoordinates = v.object({
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
});

const locationFeatureSpecification = v.object({
  name: v.string(),
  value: v.optional(v.union(v.boolean(), v.number(), v.string())),
  propertyID: v.optional(v.string()),
  description: v.optional(v.string()),
});

const propertyValue = v.object({
  name: v.string(),
  value: v.optional(v.union(v.boolean(), v.number(), v.string())),
  unitText: v.optional(v.string()),
  propertyID: v.optional(v.string()),
  description: v.optional(v.string()),
});

const place = v.object({
  name: v.optional(v.string()),
  address: v.optional(postalAddress),
  geo: v.optional(geoCoordinates),
});

const realEstateListing = v.object({
  url: v.string(),
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  datePosted: v.optional(v.string()),
  provider: v.optional(v.string()),
  additionalProperty: v.optional(v.array(propertyValue)),
});

const apartment = v.object({
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  accommodationCategory: v.optional(v.string()),
  address: v.optional(postalAddress),
  geo: v.optional(geoCoordinates),
  floorSize: v.optional(quantitativeValue),
  floorLevel: v.optional(v.string()),
  numberOfRooms: v.optional(v.number()),
  numberOfBedrooms: v.optional(v.number()),
  numberOfBathroomsTotal: v.optional(v.number()),
  numberOfFullBathrooms: v.optional(v.number()),
  numberOfPartialBathrooms: v.optional(v.number()),
  amenityFeature: v.optional(v.array(locationFeatureSpecification)),
  petsAllowed: v.optional(v.boolean()),
  tourBookingPage: v.optional(v.string()),
  additionalProperty: v.optional(v.array(propertyValue)),
});

const offer = v.object({
  url: v.optional(v.string()),
  price: v.optional(v.number()),
  priceCurrency: v.optional(v.string()),
  availability: v.optional(v.string()),
  availabilityStarts: v.optional(v.string()),
  businessFunction: v.optional(v.string()),
  leaseLength: v.optional(quantitativeValue),
  additionalProperty: v.optional(v.array(propertyValue)),
});

const assessment = v.object({
  commute: v.optional(
    v.object({
      toLocation: place,
      minutes: v.optional(v.number()),
      route: v.optional(v.string()),
      notes: v.optional(v.string()),
    }),
  ),
  verification: v.object({
    freshness,
    note: v.optional(v.string()),
    lastVerifiedAt: v.number(),
  }),
  confidence: v.object({
    photos: confidence,
    floorPlan: confidence,
  }),
  mustHaveEvidence: v.optional(v.string()),
  daylight: v.optional(v.string()),
  kitchen: v.optional(v.string()),
  bathroom: v.optional(v.string()),
  floorPlan: v.optional(v.string()),
  furnitureFit: v.optional(v.string()),
  caveats: v.optional(v.array(v.string())),
  rejectionReasons: v.optional(v.array(v.string())),
  rawNotes: v.optional(v.string()),
});

export default defineSchema({
  apartments: defineTable({
    sourceKey: v.string(),
    status,
    track,
    rank: v.optional(v.number()),
    score: v.optional(v.number()),
    listing: realEstateListing,
    apartment,
    offer,
    assessment,
    tags: v.optional(v.array(v.string())),
    searchRunId: v.optional(v.id("searchRuns")),
    /** Manually toggled by the user from the UI; distinct from `status`. */
    isFavorite: v.optional(v.boolean()),
    /** Soft-hide from the main ranking while keeping the listing accessible. */
    hidden: v.optional(v.boolean()),
    /** Free-form notes added by the user, shown above the AI assessment. */
    userNotes: v.optional(v.string()),
    /** User-set tour progress. Undefined treated as "not_yet". */
    tourStatus: v.optional(
      v.union(
        v.literal("not_yet"),
        v.literal("touring"),
        v.literal("toured"),
      ),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_source_key", ["sourceKey"])
    .index("by_status", ["status"])
    .index("by_track", ["track"])
    .index("by_status_track", ["status", "track"])
    .index("by_updated_at", ["updatedAt"]),

  apartmentImages: defineTable({
    apartmentId: v.id("apartments"),
    storageProvider: v.optional(imageStorageProvider),
    storageId: v.optional(v.id("_storage")),
    r2: v.optional(
      v.object({
        bucket: v.string(),
        key: v.string(),
        etag: v.optional(v.string()),
        contentLength: v.optional(v.number()),
        migratedAt: v.optional(v.number()),
        uploadedAt: v.optional(v.number()),
      }),
    ),
    image: v.object({
      name: v.optional(v.string()),
      caption: v.optional(v.string()),
      encodingFormat: v.optional(v.string()),
      contentUrl: v.optional(v.string()),
      representativeOfPage: v.optional(v.boolean()),
      additionalProperty: v.optional(v.array(propertyValue)),
    }),
    kind: v.union(
      v.literal("photo"),
      v.literal("floor_plan"),
      v.literal("building"),
      v.literal("other"),
    ),
    order: v.number(),
    sourceUrl: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_apartment", ["apartmentId"])
    .index("by_storage", ["storageId"]),

  searchRuns: defineTable({
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    summary: v.optional(v.string()),
    sourcesSearched: v.optional(v.array(v.string())),
    blindSpots: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
  }).index("by_started_at", ["startedAt"]),

  apartmentImportJobs: defineTable({
    sourceUrl: v.string(),
    normalizedUrl: v.string(),
    status: apartmentImportStatus,
    statusMessage: v.optional(v.string()),
    events: v.array(
      v.object({
        at: v.number(),
        status: apartmentImportStatus,
        message: v.string(),
      }),
    ),
    scheduledFunctionId: v.optional(v.id("_scheduled_functions")),
    searchRunId: v.optional(v.id("searchRuns")),
    apartmentId: v.optional(v.id("apartments")),
    attachedImageCount: v.optional(v.number()),
    imageFailureCount: v.optional(v.number()),
    warnings: v.optional(v.array(v.string())),
    error: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_created_at", ["createdAt"])
    .index("by_status", ["status"]),
});
