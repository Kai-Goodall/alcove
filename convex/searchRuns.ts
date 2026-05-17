import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const runStatus = v.union(
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
);

export const create = mutation({
  args: {
    startedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("searchRuns", {
      startedAt: args.startedAt ?? Date.now(),
      status: "running",
      notes: args.notes,
    });
  },
});

export const finish = mutation({
  args: {
    id: v.id("searchRuns"),
    status: runStatus,
    summary: v.optional(v.string()),
    sourcesSearched: v.optional(v.array(v.string())),
    blindSpots: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      completedAt: Date.now(),
      status: args.status,
      summary: args.summary,
      sourcesSearched: args.sourcesSearched,
      blindSpots: args.blindSpots,
      notes: args.notes,
    });
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("searchRuns")
      .withIndex("by_started_at")
      .order("desc")
      .take(25);
  },
});
