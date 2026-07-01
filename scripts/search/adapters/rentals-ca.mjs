/**
 * Rentals.ca adapter (Canada) — BEST EFFORT.
 *
 * Rentals.ca embeds listings as JSON-LD / Next data, but its edge is protected
 * by a bot-management layer (Cloudflare/DataDome) that frequently returns 403
 * to non-browser clients and datacenter IPs. When that happens this adapter
 * yields nothing and the run records it as a blind spot. It works more often
 * from residential IPs; the AI version can route around blocks with richer
 * fetching. No key is used.
 */

import { fetchText, parseNextData, stripTags } from "../http.mjs";

const CITY_SLUGS = {
  "kitchener": "kitchener-on",
  "waterloo": "waterloo-on",
  "cambridge": "cambridge-on",
  "toronto": "toronto-on",
  "ottawa": "ottawa-on",
  "hamilton": "hamilton-on",
  "london": "london-on",
  "guelph": "guelph-on",
  "vancouver": "vancouver-bc",
  "calgary": "calgary-ab",
  "edmonton": "edmonton-ab",
  "montreal": "montreal-qc",
};

export const id = "rentals_ca";
export const label = "Rentals.ca";

function slugFor(criteria) {
  return CITY_SLUGS[(criteria.location?.city ?? "").toLowerCase()] ?? null;
}

export function supports(criteria) {
  const country = (criteria.location?.country ?? "").toUpperCase();
  return (country === "CA" || country === "CANADA") && Boolean(slugFor(criteria));
}

export function unsupportedReason(criteria) {
  return `Rentals.ca has no slug for "${criteria.location?.city}" (Canada only).`;
}

export async function search(criteria, ctx = {}) {
  const log = ctx.log ?? (() => {});
  const slug = slugFor(criteria);
  const res = await fetchText(`https://rentals.ca/${slug}`, { retries: 1 });
  if (!res.ok) {
    log(`rentals.ca blocked or unavailable (${res.status || res.error}).`);
    return [];
  }

  const listings = extractFromNextData(res.text) ?? extractFromJsonLd(res.text);
  return (listings ?? []).slice(0, criteria.perSourceLimit || 60);
}

function extractFromNextData(html) {
  const props = parseNextData(html)?.props?.pageProps;
  const arr =
    props?.listings ?? props?.searchResults?.listings ?? props?.data?.listings;
  if (!Array.isArray(arr)) return null;
  return arr
    .map((l) => ({
      source: "rentals_ca",
      sourceId: String(l.id ?? l.slug ?? l.url),
      url: l.url?.startsWith("http") ? l.url : `https://rentals.ca${l.url ?? ""}`,
      provider: "Rentals.ca",
      title: l.name ?? l.title,
      description: l.description ? stripTags(l.description) : undefined,
      price: numeric(l.price ?? l.rentMin ?? l.minRent),
      currency: "CAD",
      bedrooms: numeric(l.bedrooms ?? l.bedsMin),
      bathrooms: numeric(l.bathrooms ?? l.bathsMin),
      address: l.address ?? l.fullAddress,
      city: l.city,
      region: l.province ?? "ON",
      country: "CA",
      lat: numeric(l.lat ?? l.latitude),
      lon: numeric(l.lng ?? l.longitude),
      imageUrls: (l.photos ?? l.images ?? [])
        .map((p) => (typeof p === "string" ? p : p?.url))
        .filter(Boolean)
        .slice(0, 8),
    }))
    .filter((l) => l.url);
}

function extractFromJsonLd(html) {
  const out = [];
  const blocks = html.match(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
  );
  if (!blocks) return out;
  for (const block of blocks) {
    const json = block.replace(/<script[^>]*>|<\/script>/g, "");
    try {
      collect(JSON.parse(json), out);
    } catch {
      // Skip malformed JSON-LD blocks.
    }
  }
  return out;
}

function collect(node, out) {
  if (Array.isArray(node)) {
    node.forEach((n) => collect(n, out));
    return;
  }
  if (!node || typeof node !== "object") return;
  const type = node["@type"];
  if (type && /Apartment|Residence|Product|Offer/i.test(String(type)) && node.url) {
    out.push({
      source: "rentals_ca",
      sourceId: String(node.url),
      url: node.url,
      provider: "Rentals.ca",
      title: node.name,
      description: node.description,
      price: numeric(node.offers?.price ?? node.price),
      currency: "CAD",
      address: node.address?.streetAddress,
      city: node.address?.addressLocality,
      region: node.address?.addressRegion,
      country: "CA",
    });
  }
  Object.values(node).forEach((v) => {
    if (v && typeof v === "object") collect(v, out);
  });
}

function numeric(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
