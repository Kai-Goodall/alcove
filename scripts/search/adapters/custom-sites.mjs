/**
 * Custom sites adapter — scrape specific apartment complex / property-manager
 * websites you care about.
 *
 * List the availability/floor-plan pages in `search.customSites` in
 * alcove.config.mjs (strings or `{ url, label }`). For each page the adapter
 * tries, in order:
 *   1. schema.org JSON-LD (`Apartment` / `Offer` / `Product` … many
 *      RentCafe/Entrata/Yardi complex sites emit this),
 *   2. a generic heuristic pass over the page text (unit names + prices),
 *   3. a single "lead" row for the page itself, so the complex still shows up
 *      in Alcove as something to track even when parsing fails.
 *
 * Complex sites behind Cloudflare-style bot walls surface as blind-spot rows
 * instead of listings; the AI deep search can usually read those.
 */

import { fetchText, decodeHtml, stripTags, delay, DEFAULT_DELAY_MS } from "../http.mjs";

export const id = "custom";
export const label = "Custom sites";

function sitesFor(criteria) {
  return (criteria.customSites ?? [])
    .map((site) => (typeof site === "string" ? { url: site } : site))
    .filter((site) => site?.url);
}

export function supports(criteria) {
  return sitesFor(criteria).length > 0;
}

export function unsupportedReason() {
  return "No custom sites configured. Add your apartment-complex URLs to search.customSites in alcove.config.mjs.";
}

export async function search(criteria, ctx = {}) {
  const log = ctx.log ?? (() => {});
  const sites = sitesFor(criteria).slice(0, 12);
  const collected = [];

  for (const site of sites) {
    const res = await fetchText(site.url, { timeoutMs: 25000 });
    if (!res.ok) {
      log(`custom site ${hostOf(site.url)} unavailable (${res.status || res.error}).`);
      continue;
    }
    const provider = site.label ?? site.provider ?? hostOf(site.url);
    const fromJsonLd = extractJsonLd(res.text, site, provider, criteria);
    if (fromJsonLd.length) {
      log(`${provider}: ${fromJsonLd.length} listing(s) via JSON-LD.`);
      collected.push(...fromJsonLd);
    } else {
      const heuristic = extractHeuristic(res.text, site, provider, criteria);
      if (heuristic.length) {
        log(`${provider}: ${heuristic.length} unit(s) via heuristic parse.`);
        collected.push(...heuristic);
      } else {
        collected.push(leadRow(res.text, site, provider, criteria));
        log(`${provider}: no structured data; added a lead row.`);
      }
    }
    await delay(DEFAULT_DELAY_MS);
  }

  return collected;
}

function extractJsonLd(html, site, provider, criteria) {
  const out = [];
  const blocks =
    html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g) ?? [];
  for (const block of blocks) {
    const json = block.replace(/<script[^>]*>|<\/script>/g, "");
    try {
      collectLd(JSON.parse(json), out, site, provider, criteria);
    } catch {
      // Skip malformed JSON-LD.
    }
  }
  // Dedupe by name+price (JSON-LD often repeats nodes).
  const seen = new Set();
  return out.filter((l) => {
    const key = `${l.title}|${l.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectLd(node, out, site, provider, criteria) {
  if (Array.isArray(node)) {
    node.forEach((n) => collectLd(n, out, site, provider, criteria));
    return;
  }
  if (!node || typeof node !== "object") return;
  const type = String(node["@type"] ?? "");
  if (/Apartment|Accommodation|Residence|Product|FloorPlan/i.test(type) && node.name) {
    const price = numeric(
      node.offers?.price ?? node.offers?.lowPrice ?? node.price ?? node.potentialAction?.price,
    );
    out.push({
      source: "custom",
      sourceId: `${hostOf(site.url)}:${node.name}`,
      url: node.url ?? site.url,
      provider,
      title: `${provider}: ${node.name}`,
      description: node.description ? stripTags(String(node.description)).slice(0, 400) : undefined,
      price,
      currency: node.offers?.priceCurrency ?? criteria.currency,
      bedrooms: numeric(node.numberOfBedrooms ?? node.numberOfRooms),
      bathrooms: numeric(node.numberOfBathroomsTotal),
      address: node.address?.streetAddress,
      city: node.address?.addressLocality ?? criteria.location?.city,
      region: node.address?.addressRegion,
      country: node.address?.addressCountry ?? criteria.location?.country,
      imageUrls: imageList(node.image ?? node.photo),
    });
  }
  Object.values(node).forEach((v) => {
    if (v && typeof v === "object") collectLd(v, out, site, provider, criteria);
  });
}

/**
 * Heuristic pass: find "N bed(s) ... $X,XXX" pairs in the visible text. Works
 * for many hand-rolled availability tables. Conservative: price must be a
 * plausible monthly rent and sit near a bedroom mention.
 */
function extractHeuristic(html, site, provider, criteria) {
  const text = stripTags(
    html
      .replace(/<script[\s\S]*?<\/script>/g, " ")
      .replace(/<style[\s\S]*?<\/style>/g, " "),
  );
  const out = [];
  const seen = new Set();
  const pattern =
    /(\d)\s*(?:bed(?:room)?s?|br|bdrm)[^$]{0,120}?\$\s?([\d,]{3,6})|\$\s?([\d,]{3,6})[^$]{0,120}?(\d)\s*(?:bed(?:room)?s?|br|bdrm)/gi;
  let match;
  while ((match = pattern.exec(text)) && out.length < 12) {
    const bedrooms = Number(match[1] ?? match[4]);
    const price = Number((match[2] ?? match[3]).replace(/,/g, ""));
    if (!Number.isFinite(bedrooms) || bedrooms > 6) continue;
    if (!(price >= 400 && price <= 25000)) continue;
    const key = `${bedrooms}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      source: "custom",
      sourceId: `${hostOf(site.url)}:${bedrooms}br-${price}`,
      url: site.url,
      provider,
      title: `${provider}: ${bedrooms === 0 ? "Studio" : `${bedrooms} bedroom`} from $${price.toLocaleString("en-US")}`,
      description:
        "Parsed heuristically from the complex website — open the site to confirm unit details.",
      price,
      currency: criteria.currency,
      bedrooms,
      city: criteria.location?.city,
      region: criteria.location?.region,
      country: criteria.location?.country,
    });
  }
  return out;
}

/** Fallback: one row pointing at the page so the complex is still tracked. */
function leadRow(html, site, provider, criteria) {
  const title = decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").slice(0, 120);
  return {
    source: "custom",
    sourceId: hostOf(site.url),
    url: site.url,
    provider,
    title: title || `${provider} availability page`,
    description:
      "Could not parse structured listings from this site; open it to check availability. AI deep search can usually read it.",
    city: criteria.location?.city,
    region: criteria.location?.region,
    country: criteria.location?.country,
  };
}

function imageList(image) {
  if (!image) return undefined;
  const arr = Array.isArray(image) ? image : [image];
  const urls = arr
    .map((i) => (typeof i === "string" ? i : i?.url ?? i?.contentUrl))
    .filter((u) => typeof u === "string" && u.startsWith("http"));
  return urls.length ? urls.slice(0, 8) : undefined;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function numeric(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
