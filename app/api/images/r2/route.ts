import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

export const runtime = "nodejs";

const DEFAULT_BUCKET = "alcove";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const bucket = searchParams.get("bucket");

  if (!key) {
    return new Response("Missing image key", { status: 400 });
  }

  const config = getR2Config();
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  try {
    const object = await client.send(
      new GetObjectCommand({
        Bucket: bucket ?? config.bucket,
        Key: key,
      }),
    );

    const bytes = await object.Body?.transformToByteArray();
    if (!bytes) {
      return new Response("Image not found", { status: 404 });
    }

    const headers = new Headers({
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": object.ContentType ?? "application/octet-stream",
    });

    if (object.ETag) {
      headers.set("ETag", object.ETag);
    }
    if (object.ContentLength !== undefined) {
      headers.set("Content-Length", String(object.ContentLength));
    }

    const body = new Uint8Array(bytes);
    return new Response(body.buffer, { headers });
  } catch {
    return new Response("Image not found", { status: 404 });
  }
}

function getR2Config() {
  const endpointInput = process.env.R2_S3_API_URL;
  const accessKeyId = process.env.R2_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_S3_SECRET_ACCESS_KEY;

  if (!endpointInput || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing R2_S3_API_URL, R2_S3_ACCESS_KEY_ID, or R2_S3_SECRET_ACCESS_KEY",
    );
  }

  const endpointUrl = new URL(endpointInput);
  const inferredBucket = endpointUrl.pathname.split("/").filter(Boolean)[0];
  endpointUrl.pathname = "";
  endpointUrl.search = "";
  endpointUrl.hash = "";

  return {
    endpoint: endpointUrl.toString().replace(/\/$/, ""),
    accessKeyId,
    secretAccessKey,
    bucket:
      process.env.R2_BUCKET_NAME ??
      process.env.R2_BUCKET ??
      inferredBucket ??
      DEFAULT_BUCKET,
  };
}
