import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

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

const propertyValue = v.object({
  name: v.string(),
  value: v.optional(v.union(v.boolean(), v.number(), v.string())),
  unitText: v.optional(v.string()),
  propertyID: v.optional(v.string()),
  description: v.optional(v.string()),
});

const locationFeatureSpecification = v.object({
  name: v.string(),
  value: v.optional(v.union(v.boolean(), v.number(), v.string())),
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
    lastVerifiedAt: v.optional(v.number()),
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

const apartmentInput = v.object({
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
});

export const list = query({
  args: {
    status: v.optional(status),
    track: v.optional(track),
  },
  handler: async (ctx, args) => {
    const apartments =
      args.status !== undefined && args.track !== undefined
        ? await ctx.db
            .query("apartments")
            .withIndex("by_status_track", (q) =>
              q.eq("status", args.status!).eq("track", args.track!),
            )
            .collect()
        : args.status !== undefined
          ? await ctx.db
              .query("apartments")
              .withIndex("by_status", (q) => q.eq("status", args.status!))
              .collect()
          : args.track !== undefined
            ? await ctx.db
                .query("apartments")
                .withIndex("by_track", (q) => q.eq("track", args.track!))
                .collect()
            : await ctx.db.query("apartments").collect();

    apartments.sort((a, b) => {
      const rankA = a.rank ?? Number.MAX_SAFE_INTEGER;
      const rankB = b.rank ?? Number.MAX_SAFE_INTEGER;
      const verifiedA = a.assessment.verification.lastVerifiedAt;
      const verifiedB = b.assessment.verification.lastVerifiedAt;
      return rankA - rankB || verifiedB - verifiedA;
    });

    return await Promise.all(
      apartments.map(async (apartmentDoc) => withImages(ctx, apartmentDoc)),
    );
  },
});

export const get = query({
  args: { id: v.id("apartments") },
  handler: async (ctx, args) => {
    const apartmentDoc = await ctx.db.get(args.id);
    if (apartmentDoc === null) {
      return null;
    }
    return await withImages(ctx, apartmentDoc);
  },
});

export const upsert = mutation({
  args: { apartment: apartmentInput },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("apartments")
      .withIndex("by_source_key", (q) =>
        q.eq("sourceKey", args.apartment.sourceKey),
      )
      .unique();
    const apartmentDoc = {
      ...args.apartment,
      assessment: {
        ...args.apartment.assessment,
        verification: {
          ...args.apartment.assessment.verification,
          lastVerifiedAt:
            args.apartment.assessment.verification.lastVerifiedAt ?? now,
        },
      },
      updatedAt: now,
    };

    if (existing !== null) {
      await ctx.db.patch(existing._id, apartmentDoc);
      return existing._id;
    }

    return await ctx.db.insert("apartments", {
      ...apartmentDoc,
      createdAt: now,
    });
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("apartments"),
    status,
    rejectionReasons: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const apartmentDoc = await ctx.db.get(args.id);
    if (apartmentDoc === null) {
      throw new Error("Apartment not found");
    }

    await ctx.db.patch(args.id, {
      status: args.status,
      assessment: {
        ...apartmentDoc.assessment,
        rejectionReasons: args.rejectionReasons,
      },
      updatedAt: Date.now(),
    });
  },
});

export const setFavorite = mutation({
  args: {
    id: v.id("apartments"),
    isFavorite: v.boolean(),
  },
  handler: async (ctx, args) => {
    const apartmentDoc = await ctx.db.get(args.id);
    if (apartmentDoc === null) {
      throw new Error("Apartment not found");
    }
    await ctx.db.patch(args.id, {
      isFavorite: args.isFavorite,
      updatedAt: Date.now(),
    });
  },
});

export const setTourStatus = mutation({
  args: {
    id: v.id("apartments"),
    tourStatus: v.union(
      v.literal("not_yet"),
      v.literal("touring"),
      v.literal("toured"),
    ),
  },
  handler: async (ctx, args) => {
    const apartmentDoc = await ctx.db.get(args.id);
    if (apartmentDoc === null) {
      throw new Error("Apartment not found");
    }
    await ctx.db.patch(args.id, {
      tourStatus: args.tourStatus,
      updatedAt: Date.now(),
    });
  },
});

export const setUserNotes = mutation({
  args: {
    id: v.id("apartments"),
    userNotes: v.string(),
  },
  handler: async (ctx, args) => {
    const apartmentDoc = await ctx.db.get(args.id);
    if (apartmentDoc === null) {
      throw new Error("Apartment not found");
    }
    await ctx.db.patch(args.id, {
      userNotes: args.userNotes,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("apartments") },
  handler: async (ctx, args) => {
    const images = await ctx.db
      .query("apartmentImages")
      .withIndex("by_apartment", (q) => q.eq("apartmentId", args.id))
      .collect();

    for (const image of images) {
      await ctx.storage.delete(image.storageId);
      await ctx.db.delete(image._id);
    }
    await ctx.db.delete(args.id);
  },
});

async function withImages(ctx: QueryCtx, apartmentDoc: Doc<"apartments">) {
  const images = await ctx.db
    .query("apartmentImages")
    .withIndex("by_apartment", (q) => q.eq("apartmentId", apartmentDoc._id))
    .collect();
  images.sort((a, b) => a.order - b.order || a._creationTime - b._creationTime);

  return {
    ...apartmentDoc,
    images: await Promise.all(
      images.map(async (image) => ({
        ...image,
        url: await ctx.storage.getUrl(image.storageId),
      })),
    ),
  };
}
