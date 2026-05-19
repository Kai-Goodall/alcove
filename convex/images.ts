import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const imageKind = v.union(
  v.literal("photo"),
  v.literal("floor_plan"),
  v.literal("building"),
  v.literal("other"),
);

const imageInput = v.object({
  name: v.optional(v.string()),
  caption: v.optional(v.string()),
  encodingFormat: v.optional(v.string()),
  contentUrl: v.optional(v.string()),
  representativeOfPage: v.optional(v.boolean()),
});

function r2ContentUrl(bucket: string, key: string) {
  return `/api/images/r2?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`;
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const attach = mutation({
  args: {
    apartmentId: v.id("apartments"),
    storageId: v.id("_storage"),
    kind: imageKind,
    sourceUrl: v.optional(v.string()),
    image: v.optional(imageInput),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const apartment = await ctx.db.get(args.apartmentId);
    if (apartment === null) {
      throw new Error("Apartment not found");
    }

    const existingImages = await ctx.db
      .query("apartmentImages")
      .withIndex("by_apartment", (q) => q.eq("apartmentId", args.apartmentId))
      .collect();

    return await ctx.db.insert("apartmentImages", {
      apartmentId: args.apartmentId,
      storageProvider: "convex",
      storageId: args.storageId,
      image: {
        name: args.image?.name,
        caption: args.image?.caption,
        encodingFormat: args.image?.encodingFormat,
        contentUrl: args.image?.contentUrl,
        representativeOfPage: args.image?.representativeOfPage,
      },
      kind: args.kind,
      sourceUrl: args.sourceUrl,
      order: args.order ?? existingImages.length,
      createdAt: Date.now(),
    });
  },
});

export const attachR2 = mutation({
  args: {
    apartmentId: v.id("apartments"),
    bucket: v.string(),
    key: v.string(),
    contentUrl: v.optional(v.string()),
    etag: v.optional(v.string()),
    contentLength: v.optional(v.number()),
    kind: imageKind,
    sourceUrl: v.optional(v.string()),
    image: v.optional(imageInput),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const apartment = await ctx.db.get(args.apartmentId);
    if (apartment === null) {
      throw new Error("Apartment not found");
    }

    const existingImages = await ctx.db
      .query("apartmentImages")
      .withIndex("by_apartment", (q) => q.eq("apartmentId", args.apartmentId))
      .collect();

    return await ctx.db.insert("apartmentImages", {
      apartmentId: args.apartmentId,
      storageProvider: "r2",
      r2: {
        bucket: args.bucket,
        key: args.key,
        etag: args.etag,
        contentLength: args.contentLength,
        uploadedAt: Date.now(),
      },
      image: {
        name: args.image?.name,
        caption: args.image?.caption,
        encodingFormat: args.image?.encodingFormat,
        contentUrl:
          args.contentUrl ??
          args.image?.contentUrl ??
          r2ContentUrl(args.bucket, args.key),
        representativeOfPage: args.image?.representativeOfPage,
      },
      kind: args.kind,
      sourceUrl: args.sourceUrl,
      order: args.order ?? existingImages.length,
      createdAt: Date.now(),
    });
  },
});

export const markR2 = mutation({
  args: {
    id: v.id("apartmentImages"),
    bucket: v.string(),
    key: v.string(),
    contentUrl: v.optional(v.string()),
    etag: v.optional(v.string()),
    contentLength: v.optional(v.number()),
    contentType: v.optional(v.string()),
    deleteConvexStorage: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const image = await ctx.db.get(args.id);
    if (image === null) {
      throw new Error("Image not found");
    }

    const previousStorageId = image.storageId;

    await ctx.db.patch(args.id, {
      storageProvider: "r2",
      storageId: previousStorageId,
      r2: {
        bucket: args.bucket,
        key: args.key,
        etag: args.etag,
        contentLength: args.contentLength,
        migratedAt: Date.now(),
      },
      image: {
        ...image.image,
        encodingFormat: args.contentType ?? image.image.encodingFormat,
        contentUrl: args.contentUrl ?? r2ContentUrl(args.bucket, args.key),
      },
    });

    if (args.deleteConvexStorage && previousStorageId) {
      await ctx.storage.delete(previousStorageId);
      await ctx.db.patch(args.id, { storageId: undefined });
    }
  },
});

export const listForApartment = query({
  args: { apartmentId: v.id("apartments") },
  handler: async (ctx, args) => {
    const images = await ctx.db
      .query("apartmentImages")
      .withIndex("by_apartment", (q) => q.eq("apartmentId", args.apartmentId))
      .collect();

    images.sort((a, b) => a.order - b.order || a._creationTime - b._creationTime);

    return await Promise.all(
      images.map(async (image) => ({
        ...image,
        url:
          image.image.contentUrl ??
          (image.storageId ? await ctx.storage.getUrl(image.storageId) : null),
      })),
    );
  },
});

export const remove = mutation({
  args: { id: v.id("apartmentImages") },
  handler: async (ctx, args) => {
    const image = await ctx.db.get(args.id);
    if (image === null) {
      return;
    }

    if (image.storageId) {
      await ctx.storage.delete(image.storageId);
    }
    await ctx.db.delete(args.id);
  },
});
