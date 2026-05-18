import { ImageResponse } from "next/og";
import sharp from "sharp";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { pickPhotos } from "@/_lib/apartment-meta";

export const runtime = "nodejs";

const WIDTH = 1200;
const HEIGHT = 630;
const GAP = 12;
const LEFT_W = 598;
const RIGHT_W = WIDTH - LEFT_W - GAP;
const COL_W = Math.floor((RIGHT_W - GAP) / 2);
const ROW_H = Math.floor((HEIGHT - GAP) / 2);

export async function GET(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get("apartment");
  if (!id) return new Response("missing apartment", { status: 400 });

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return new Response("convex url not set", { status: 500 });

  let apartment;
  try {
    apartment = await new ConvexHttpClient(convexUrl).query(
      api.apartments.get,
      { id: id as Id<"apartments"> },
    );
  } catch {
    return new Response("convex query failed", { status: 502 });
  }
  if (!apartment) return new Response("not found", { status: 404 });

  const urls = pickPhotos(apartment, 5)
    .map((p) => p.url)
    .filter((u): u is string => Boolean(u));
  if (urls.length === 0) return new Response("no images", { status: 404 });

  // Fetch + decode each photo to a JPEG data URI Satori can render.
  // Per-fetch timeout so one stuck Convex/Cloudflare cell can't hang the response.
  const datas = (
    await Promise.all(
      urls.map(async (url, i) => {
        const cellWidth = i === 0 ? LEFT_W : COL_W;
        const cellHeight = i === 0 ? HEIGHT : ROW_H;
        try {
          const res = await fetch(url, {
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return null;
          const buf = Buffer.from(await res.arrayBuffer());
          const jpeg = await sharp(buf)
            .resize(cellWidth, cellHeight, {
              fit: "cover",
              position: "centre",
            })
            .jpeg({ quality: 82 })
            .toBuffer();
          return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
        } catch {
          return null;
        }
      }),
    )
  ).filter((d): d is string => d !== null);

  if (datas.length === 0) return new Response("image decode failed", { status: 502 });

  // Pad to 5 cells by cycling whatever we have.
  const [a, b, c, d, e] = Array.from(
    { length: 5 },
    (_, i) => datas[i % datas.length],
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          gap: GAP,
          background: "#fff",
        }}
      >
        <img
          src={a}
          width={LEFT_W}
          height={HEIGHT}
          style={{ objectFit: "cover", display: "flex" }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: GAP,
            width: RIGHT_W,
            height: HEIGHT,
          }}
        >
          <div style={{ display: "flex", gap: GAP, height: ROW_H }}>
            <img
              src={b}
              width={COL_W}
              height={ROW_H}
              style={{ objectFit: "cover", display: "flex" }}
            />
            <img
              src={c}
              width={COL_W}
              height={ROW_H}
              style={{ objectFit: "cover", display: "flex" }}
            />
          </div>
          <div style={{ display: "flex", gap: GAP, height: ROW_H }}>
            <img
              src={d}
              width={COL_W}
              height={ROW_H}
              style={{ objectFit: "cover", display: "flex" }}
            />
            <img
              src={e}
              width={COL_W}
              height={ROW_H}
              style={{ objectFit: "cover", display: "flex" }}
            />
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        "cache-control":
          "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
