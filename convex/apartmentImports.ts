import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const importStatus = v.union(
  v.literal("queued"),
  v.literal("fetching_source"),
  v.literal("researching"),
  v.literal("extracting"),
  v.literal("upserting"),
  v.literal("uploading_images"),
  v.literal("completed"),
  v.literal("failed"),
);

type ImportStatus =
  | "queued"
  | "fetching_source"
  | "researching"
  | "extracting"
  | "upserting"
  | "uploading_images"
  | "completed"
  | "failed";

function normalizeApartmentUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ConvexError("Enter a valid apartment link.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new ConvexError("Apartment links must start with http:// or https://.");
  }

  parsed.hash = "";
  return parsed.toString();
}

export const createFromUrl = mutation({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    const normalizedUrl = normalizeApartmentUrl(args.url);
    const now = Date.now();
    const message = "Queued apartment import.";
    const jobId = await ctx.db.insert("apartmentImportJobs", {
      sourceUrl: args.url.trim(),
      normalizedUrl,
      status: "queued",
      statusMessage: message,
      events: [{ at: now, status: "queued", message }],
      createdAt: now,
      updatedAt: now,
    });

    const scheduledFunctionId = await ctx.scheduler.runAfter(
      0,
      internal.apartmentImportActions.run,
      { jobId },
    );
    await ctx.db.patch(jobId, { scheduledFunctionId, updatedAt: Date.now() });

    return jobId;
  },
});

export const get = query({
  args: { jobId: v.id("apartmentImportJobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

export const listRecent = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("apartmentImportJobs")
      .withIndex("by_created_at")
      .order("desc")
      .take(10);
  },
});

export const listCompletedForRepair = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 10, 1), 50);
    const jobs = await ctx.db
      .query("apartmentImportJobs")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .order("desc")
      .take(limit);
    return jobs.filter((job) => job.apartmentId !== undefined);
  },
});

export const markStarted = internalMutation({
  args: { jobId: v.id("apartmentImportJobs") },
  handler: async (ctx, args) => {
    await patchJob(ctx, args.jobId, {
      status: "fetching_source",
      message: "Fetching the source listing.",
      startedAt: Date.now(),
    });
  },
});

export const setStatus = internalMutation({
  args: {
    jobId: v.id("apartmentImportJobs"),
    status: importStatus,
    message: v.string(),
  },
  handler: async (ctx, args) => {
    await patchJob(ctx, args.jobId, {
      status: args.status,
      message: args.message,
    });
  },
});

export const complete = internalMutation({
  args: {
    jobId: v.id("apartmentImportJobs"),
    apartmentId: v.id("apartments"),
    searchRunId: v.id("searchRuns"),
    attachedImageCount: v.number(),
    imageFailureCount: v.number(),
    warnings: v.array(v.string()),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await patchJob(ctx, args.jobId, {
      status: "completed",
      message: args.message ?? "Apartment imported.",
      apartmentId: args.apartmentId,
      searchRunId: args.searchRunId,
      attachedImageCount: args.attachedImageCount,
      imageFailureCount: args.imageFailureCount,
      warnings: args.warnings,
      completedAt: Date.now(),
    });
  },
});

export const fail = internalMutation({
  args: {
    jobId: v.id("apartmentImportJobs"),
    error: v.string(),
    warnings: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await patchJob(ctx, args.jobId, {
      status: "failed",
      message: "Apartment import failed.",
      error: args.error,
      warnings: args.warnings,
      completedAt: Date.now(),
    });
  },
});

type PatchJobArgs = {
  status: ImportStatus;
  message: string;
  apartmentId?: Id<"apartments">;
  searchRunId?: Id<"searchRuns">;
  attachedImageCount?: number;
  imageFailureCount?: number;
  warnings?: string[];
  error?: string;
  startedAt?: number;
  completedAt?: number;
};

async function patchJob(
  ctx: MutationCtx,
  jobId: Id<"apartmentImportJobs">,
  patch: PatchJobArgs,
) {
  const job = await ctx.db.get(jobId);
  if (job === null) {
    throw new Error("Apartment import job not found");
  }

  const at = Date.now();
  const nextEvent = {
    at,
    status: patch.status,
    message: patch.message,
  };

  await ctx.db.patch(jobId, {
    status: patch.status,
    statusMessage: patch.message,
    events: [...job.events, nextEvent],
    apartmentId: patch.apartmentId,
    searchRunId: patch.searchRunId,
    attachedImageCount: patch.attachedImageCount,
    imageFailureCount: patch.imageFailureCount,
    warnings: patch.warnings,
    error: patch.error,
    startedAt: patch.startedAt ?? job.startedAt,
    completedAt: patch.completedAt ?? job.completedAt,
    updatedAt: at,
  });
}
