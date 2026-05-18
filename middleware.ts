import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api";
import type { Id } from "./convex/_generated/dataModel";

export const config = {
  matcher: "/",
};

const SKIP_HEADER = "x-og-passthrough";

export default async function middleware(request: Request): Promise<Response | undefined> {
  if (request.method !== "GET") return;
  if (request.headers.get(SKIP_HEADER) === "1") return;

  const url = new URL(request.url);
  const apartmentId = url.searchParams.get("apartment");
  if (!apartmentId) return;

  const convexUrl = process.env.VITE_CONVEX_URL ?? process.env.CONVEX_URL;
  if (!convexUrl) return;

  const originUrl = new URL(url);
  originUrl.search = "";

  const [originResponse, apartment] = await Promise.all([
    fetch(originUrl, { headers: { [SKIP_HEADER]: "1" } }),
    fetchApartment(convexUrl, apartmentId as Id<"apartments">),
  ]);

  const contentType = originResponse.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") || !apartment) {
    return;
  }

  const meta = buildMetaTags(apartment, url);
  const html = (await originResponse.text()).replace(
    /<\/head>/i,
    `${meta}\n</head>`,
  );

  const headers = new Headers(originResponse.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.delete("content-length");
  headers.delete("content-encoding");
  // Cache shared previews briefly to spare Convex on crawler retries.
  headers.set("cache-control", "public, max-age=0, s-maxage=300, stale-while-revalidate=86400");

  return new Response(html, {
    status: originResponse.status,
    statusText: originResponse.statusText,
    headers,
  });
}

async function fetchApartment(
  convexUrl: string,
  id: Id<"apartments">,
) {
  try {
    const client = new ConvexHttpClient(convexUrl);
    return await client.query(api.apartments.get, { id });
  } catch {
    return null;
  }
}

function buildMetaTags(
  apartment: NonNullable<Awaited<ReturnType<typeof fetchApartment>>>,
  url: URL,
): string {
  const title = pickTitle(apartment);
  const description = pickDescription(apartment);
  const image = pickImage(apartment);
  const canonical = url.toString();

  const tags: string[] = [];
  const push = (tag: string) => tags.push(`    ${tag}`);

  push(`<meta name="description" content="${escape(description)}" />`);
  push(`<link rel="canonical" href="${escape(canonical)}" />`);

  push(`<meta property="og:type" content="website" />`);
  push(`<meta property="og:site_name" content="Alcove" />`);
  push(`<meta property="og:title" content="${escape(title)}" />`);
  push(`<meta property="og:description" content="${escape(description)}" />`);
  push(`<meta property="og:url" content="${escape(canonical)}" />`);
  if (image) {
    push(`<meta property="og:image" content="${escape(image)}" />`);
    push(`<meta name="twitter:image" content="${escape(image)}" />`);
    push(`<meta name="twitter:card" content="summary_large_image" />`);
  } else {
    push(`<meta name="twitter:card" content="summary" />`);
  }
  push(`<meta name="twitter:title" content="${escape(title)}" />`);
  push(`<meta name="twitter:description" content="${escape(description)}" />`);

  // Override the static <title> so chat clients that read <title> match OG.
  push(`<meta name="apartment-id" content="${escape(apartment._id)}" />`);
  tags.push(`    <title>${escape(title)} · Alcove</title>`);

  return tags.join("\n");
}

function pickTitle(
  apartment: NonNullable<Awaited<ReturnType<typeof fetchApartment>>>,
): string {
  const street = apartment.apartment.address?.streetAddress?.trim();
  const name = apartment.apartment.name?.trim() || apartment.listing.name?.trim();
  const locality = apartment.apartment.address?.addressLocality?.trim();
  const primary = street || name || "Apartment";
  return locality && !primary.includes(locality)
    ? `${primary}, ${locality}`
    : primary;
}

function pickDescription(
  apartment: NonNullable<Awaited<ReturnType<typeof fetchApartment>>>,
): string {
  const beds = apartment.apartment.numberOfBedrooms;
  const baths = apartment.apartment.numberOfBathroomsTotal;
  const sqft = apartment.apartment.floorSize?.value;
  const price = apartment.offer.price;

  const parts: string[] = [];
  if (typeof price === "number") {
    parts.push(`$${Math.round(price).toLocaleString("en-US")}/mo`);
  }
  if (typeof beds === "number") parts.push(`${beds} bd`);
  if (typeof baths === "number") parts.push(`${baths} ba`);
  if (typeof sqft === "number") parts.push(`${Math.round(sqft).toLocaleString("en-US")} sqft`);

  const summary =
    apartment.apartment.description?.trim() ||
    apartment.listing.description?.trim() ||
    apartment.assessment.rawNotes?.trim() ||
    "";
  const headline = parts.join(" · ");
  if (headline && summary) return `${headline} — ${truncate(summary, 160 - headline.length - 3)}`;
  if (headline) return headline;
  if (summary) return truncate(summary, 160);
  return "Apartment listing on Alcove.";
}

function pickImage(
  apartment: NonNullable<Awaited<ReturnType<typeof fetchApartment>>>,
): string | undefined {
  const photo = apartment.images.find((i) => i.kind === "photo" && i.url);
  return photo?.url ?? apartment.images.find((i) => i.url)?.url ?? undefined;
}

function truncate(value: string, max: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
