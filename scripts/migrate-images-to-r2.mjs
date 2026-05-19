import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import {
  createR2Client,
  ensureR2Bucket,
  getR2Config,
  loadEnvLocal,
  putR2Object,
  r2ContentUrl,
  r2ObjectKey,
} from "./r2.mjs";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const args = parseArgs(process.argv.slice(2));
loadEnvLocal();
if (args.bucket) {
  process.env.R2_BUCKET_NAME = args.bucket;
}

const convexUrl =
  process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;

if (!convexUrl) {
  throw new Error(
    "Missing NEXT_PUBLIC_CONVEX_URL. Check .env.local or pass CONVEX_URL.",
  );
}

const shouldDryRun = Boolean(args["dry-run"]);
const shouldForce = Boolean(args.force);
const shouldDeleteConvexStorage =
  args["delete-convex-storage"] !== "false" && !args["keep-convex-storage"];
const r2Config = getR2Config();
const r2Client = createR2Client(r2Config);
const convex = new ConvexHttpClient(convexUrl);

if (!shouldDryRun && args["create-bucket"] !== "false" && !args["no-create-bucket"]) {
  const bucketState = await ensureR2Bucket(r2Client, r2Config.bucket);
  console.log(`r2 bucket ${r2Config.bucket}: ${bucketState}`);
}

const apartments = await convex.query(api.apartments.list, {});

let scanned = 0;
let skipped = 0;
let migrated = 0;
let failures = 0;

for (const apartment of apartments) {
  for (const image of apartment.images ?? []) {
    scanned += 1;

    if (!shouldForce && image.storageProvider === "r2" && image.r2?.key) {
      skipped += 1;
      continue;
    }

    if (!image.url) {
      failures += 1;
      console.warn(`missing image url for ${image._id}`);
      continue;
    }

    try {
      const downloaded = await downloadImage(image.url);
      const key = r2ObjectKey({
        apartmentId: apartment._id,
        imageId: image._id,
        sourceUrl: image.sourceUrl ?? image.url,
        bytes: downloaded.bytes,
        contentType: downloaded.contentType,
        order: image.order,
      });
      const contentUrl = r2ContentUrl(key, r2Config);

      if (shouldDryRun) {
        console.log(`[dry-run] ${image._id} -> ${key}`);
        skipped += 1;
        continue;
      }

      const uploaded = await putR2Object(r2Client, {
        bucket: r2Config.bucket,
        key,
        bytes: downloaded.bytes,
        contentType: downloaded.contentType,
        sourceUrl: image.sourceUrl ?? image.url,
      });

      await convex.mutation(api.images.markR2, {
        id: image._id,
        bucket: r2Config.bucket,
        key,
        contentUrl,
        etag: uploaded.etag,
        contentLength: downloaded.bytes.byteLength,
        contentType: downloaded.contentType,
        deleteConvexStorage: shouldDeleteConvexStorage,
      });

      migrated += 1;
      console.log(`migrated ${image._id} -> ${key}`);
    } catch (error) {
      failures += 1;
      console.warn(`failed ${image._id}: ${error.message}`);
    }
  }
}

console.log(
  `${shouldDryRun ? "[dry-run] " : ""}done: ${scanned} scanned, ${migrated} migrated, ${skipped} skipped, ${failures} failed`,
);

async function downloadImage(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`download failed: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`not an image: ${contentType || "unknown content type"}`);
  }

  const contentLength = Number(response.headers.get("content-length"));
  if (contentLength > MAX_IMAGE_BYTES) {
    throw new Error(`image too large: ${contentLength} bytes`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`image too large: ${bytes.byteLength} bytes`);
  }

  return { bytes, contentType };
}

function parseArgs(rawArgs) {
  return rawArgs.reduce((parsed, arg) => {
    if (!arg.startsWith("--")) {
      return parsed;
    }

    const [key, value] = arg.slice(2).split("=");
    parsed[key] = value ?? true;
    return parsed;
  }, {});
}
