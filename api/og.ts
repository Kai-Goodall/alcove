import sharp from "sharp";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

export const config = {
  runtime: "nodejs",
};

const WIDTH = 1200;
const HEIGHT = 630;
const GAP = 12;
const LEFT_W = 598;
const RIGHT_W = WIDTH - LEFT_W - GAP;
const COL_W = Math.floor((RIGHT_W - GAP) / 2);
const ROW_H = Math.floor((HEIGHT - GAP) / 2);
const BG = { r: 255, g: 255, b: 255, alpha: 1 };

type Apartment = NonNullable<
  Awaited<ReturnType<ConvexHttpClient["query"]>>
> & {
  images: Array<{
    url: string | null;
    kind: "photo" | "floor_plan" | "building" | "other";
    image: { representativeOfPage?: boolean };
  }>;
};

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("apartment");
  if (!id) return text("Missing apartment", 400);

  const convexUrl = process.env.VITE_CONVEX_URL ?? process.env.CONVEX_URL;
  if (!convexUrl) return text("Convex URL not configured", 500);

  let apartment: Apartment | null;
  try {
    const client = new ConvexHttpClient(convexUrl);
    apartment = (await client.query(api.apartments.get, {
      id: id as Id<"apartments">,
    })) as Apartment | null;
  } catch {
    return text("Failed to load apartment", 502);
  }
  if (!apartment) return text("Apartment not found", 404);

  const photos = pickPhotos(apartment, 5);
  if (photos.length === 0) return text("No images", 404);

  const buffers = (
    await Promise.all(
      photos.map(async (p) => {
        try {
          const res = await fetch(p.url!);
          if (!res.ok) return null;
          return Buffer.from(await res.arrayBuffer());
        } catch {
          return null;
        }
      }),
    )
  ).filter((b): b is Buffer => b !== null);

  if (buffers.length === 0) return text("Image download failed", 502);

  const png =
    buffers.length >= 5
      ? await renderGrid(buffers)
      : await renderSingle(buffers[0]);

  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control":
        "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}

function pickPhotos(apartment: Apartment, max: number) {
  const usable = apartment.images.filter((i) => i.url);
  const rank = (i: Apartment["images"][number]) =>
    i.kind === "photo" && i.image.representativeOfPage
      ? 0
      : i.kind === "photo"
        ? 1
        : i.kind === "building"
          ? 2
          : 3;
  return [...usable].sort((a, b) => rank(a) - rank(b)).slice(0, max);
}

async function renderGrid(buffers: Buffer[]): Promise<Buffer> {
  const cells = [
    { left: 0, top: 0, width: LEFT_W, height: HEIGHT },
    { left: LEFT_W + GAP, top: 0, width: COL_W, height: ROW_H },
    {
      left: LEFT_W + GAP + COL_W + GAP,
      top: 0,
      width: COL_W,
      height: ROW_H,
    },
    {
      left: LEFT_W + GAP,
      top: ROW_H + GAP,
      width: COL_W,
      height: ROW_H,
    },
    {
      left: LEFT_W + GAP + COL_W + GAP,
      top: ROW_H + GAP,
      width: COL_W,
      height: ROW_H,
    },
  ];

  const composites = await Promise.all(
    cells.map(async (cell, i) => ({
      input: await sharp(buffers[i])
        .resize(cell.width, cell.height, { fit: "cover", position: "centre" })
        .toBuffer(),
      left: cell.left,
      top: cell.top,
    })),
  );

  return sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: BG,
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

async function renderSingle(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(WIDTH, HEIGHT, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
}

function text(body: string, status: number) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
