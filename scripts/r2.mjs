import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export const DEFAULT_R2_BUCKET = "alcove";

export function loadEnvLocal(cwd = process.cwd()) {
  for (const file of [".env.local", ".env"]) {
    try {
      const text = readFileSync(resolve(cwd, file), "utf8");
      for (const line of text.split("\n")) {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.+?)\s*$/);
        if (!match || process.env[match[1]]) {
          continue;
        }
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      // Environment can also come from the shell or deployment platform.
    }
  }
}

export function getR2Config() {
  const endpointInput = process.env.R2_S3_API_URL;
  const accessKeyId = process.env.R2_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_S3_SECRET_ACCESS_KEY;

  if (!endpointInput || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing R2_S3_API_URL, R2_S3_ACCESS_KEY_ID, or R2_S3_SECRET_ACCESS_KEY.",
    );
  }

  const endpointUrl = new URL(endpointInput);
  const inferredBucket = endpointUrl.pathname.split("/").filter(Boolean)[0];
  endpointUrl.pathname = "";
  endpointUrl.search = "";
  endpointUrl.hash = "";

  const publicBaseUrl =
    process.env.R2_PUBLIC_URL ?? process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

  return {
    endpoint: endpointUrl.toString().replace(/\/$/, ""),
    accessKeyId,
    secretAccessKey,
    bucket:
      process.env.R2_BUCKET_NAME ??
      process.env.R2_BUCKET ??
      inferredBucket ??
      DEFAULT_R2_BUCKET,
    publicBaseUrl: publicBaseUrl?.replace(/\/$/, ""),
  };
}

export function createR2Client(config = getR2Config()) {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export async function ensureR2Bucket(client, bucket) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return "existing";
  } catch (headError) {
    if (headError?.$metadata?.httpStatusCode === 403) {
      throw new Error(
        `Cannot access R2 bucket "${bucket}". Set R2_BUCKET_NAME to an existing bucket or grant the S3 key bucket access.`,
      );
    }

    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
      return "created";
    } catch (createError) {
      throw new Error(
        `Could not create R2 bucket "${bucket}": ${createError.message}`,
      );
    }
  }
}

export async function putR2Object(
  client,
  { bucket, key, bytes, contentType, sourceUrl },
) {
  const result = await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      Metadata: sourceUrl ? { "source-url": sourceUrl.slice(0, 2000) } : undefined,
    }),
  );

  return { etag: result.ETag };
}

export function r2ContentUrl(key, config = getR2Config()) {
  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  return `/api/images/r2?bucket=${encodeURIComponent(config.bucket)}&key=${encodeURIComponent(key)}`;
}

export function r2ObjectKey({
  apartmentId,
  imageId,
  sourceUrl,
  bytes,
  contentType,
  order,
}) {
  const digest = createHash("sha256")
    .update(sourceUrl ?? "")
    .update(bytes)
    .digest("hex")
    .slice(0, 20);
  const idPart = sanitizeKeyPart(imageId ?? `image-${order ?? 0}`);
  const extension = extensionForContentType(contentType) ?? ".jpg";

  return [
    "apartments",
    sanitizeKeyPart(apartmentId),
    `${idPart}-${digest}${extension}`,
  ].join("/");
}

function extensionForContentType(contentType) {
  if (contentType === "image/jpeg") return ".jpg";
  if (contentType === "image/png") return ".png";
  if (contentType === "image/webp") return ".webp";
  if (contentType === "image/gif") return ".gif";
  return null;
}

function sanitizeKeyPart(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}
