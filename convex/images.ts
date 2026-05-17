import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const imageKind = v.union(
  v.literal("photo"),
  v.literal("floor_plan"),
  v.literal("building"),
  v.literal("other"),
);

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
    image: v.optional(
      v.object({
        name: v.optional(v.string()),
        caption: v.optional(v.string()),
        encodingFormat: v.optional(v.string()),
        representativeOfPage: v.optional(v.boolean()),
      }),
    ),
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
      storageId: args.storageId,
      image: {
        name: args.image?.name,
        caption: args.image?.caption,
        encodingFormat: args.image?.encodingFormat,
        representativeOfPage: args.image?.representativeOfPage,
      },
      kind: args.kind,
      sourceUrl: args.sourceUrl,
      order: args.order ?? existingImages.length,
      createdAt: Date.now(),
    });
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
        url: await ctx.storage.getUrl(image.storageId),
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

    await ctx.storage.delete(image.storageId);
    await ctx.db.delete(args.id);
  },
});
