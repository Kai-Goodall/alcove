/**
 * Craigslist adapter. Craigslist exposes search results as RSS
 * (`?format=rss`), which is stable and key-free. Price and bedroom count are
 * encoded in the item title (e.g. "$1,800 / 2br - Great unit (uptown)").
 *
 * Note: Craigslist aggressively rate-limits/blocks datacenter and some shared
 * IPs. When that happens the fetch returns a non-200 and this adapter yields
 * nothing (recorded as a blind spot) rather than failing the whole run.
 */

import { fetchText, decodeHtml, delay, DEFAULT_DELAY_MS } from "../http.mjs";

// city (lowercase) -> craigslist subdomain. Extend as needed.
const SUBDOMAINS = {
  "kitchener": "kitchener",
  "waterloo": "kitchener",
  "cambridge": "kitchener",
  "toronto": "toronto",
  "ottawa": "ottawa",
  "hamilton": "hamilton",
  "london": "londonon",
  "guelph": "kitchener",
  "vancouver": "vancouver",
  "calgary": "calgary",
  "edmonton": "edmonton",
  "montreal": "montreal",
  "new york": "newyork",
  "brooklyn": "newyork",
  "san francisco": "sfbay",
  "los angeles": "losangeles",
  "chicago": "chicago",
  "boston": "boston",
  "seattle": "seattle",
};

export const id = "craigslist";
export const label = "Craigslist";

function subdomainFor(criteria) {
  return SUBDOMAINS[(criteria.location?.city ?? "").toLowerCase()] ?? null;
}

export function supports(criteria) {
  return Boolean(subdomainFor(criteria));
}

export function unsupportedReason(criteria) {
  return `No Craigslist subdomain mapped for "${criteria.location?.city}". Add one to adapters/craigslist.mjs.`;
}

export async function search(criteria, ctx = {}) {
  const log = ctx.log ?? (() => {});
  const sub = subdomainFor(criteria);
  const limit = criteria.perSourceLimit || 60;

  const params = new URLSearchParams({ format: "rss" });
  if (criteria.minBedrooms) params.set("min_bedrooms", String(criteria.minBedrooms));
  if (criteria.maxBedrooms) params.set("max_bedrooms", String(criteria.maxBedrooms));
  if (criteria.maxPrice) params.set("max_price", String(Math.round(criteria.maxPrice)));
  if (criteria.minPrice) params.set("min_price", String(Math.round(criteria.minPrice)));

  const url = `https://${sub}.craigslist.org/search/apa?${params}`;
  const res = await fetchText(url, { retries: 1 });
  if (!res.ok) {
    log(`craigslist blocked or unavailable (${res.status || res.error}).`);
    return [];
  }

  await delay(DEFAULT_DELAY_MS);
  return parseRss(res.text, sub).slice(0, limit);
}

function parseRss(xml, sub) {
  const items = xml.match(/<item[\s\S]*?<\/item>/g) ?? [];
  const out = [];
  for (const item of items) {
    const link = tag(item, "link") || attr(item, "rdf:about");
    if (!link) continue;
    const title = decodeHtml(tag(item, "title") ?? "");
    const description = decodeHtml(stripCdata(tag(item, "description") ?? ""));
    out.push({
      source: "craigslist",
      sourceId: idFromUrl(link),
      url: link,
      provider: `Craigslist ${sub}`,
      title: cleanTitle(title),
      description: description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      price: priceFromTitle(title),
      currency: "USD",
      bedrooms: bedroomsFromTitle(title),
      address: locationFromTitle(title),
      city: sub,
      postedAt: tag(item, "dc:date"),
    });
  }
  return out;
}

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : null;
}

function attr(xml, name) {
  const m = xml.match(new RegExp(`${name}="([^"]+)"`));
  return m ? m[1] : null;
}

function stripCdata(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function priceFromTitle(title) {
  const m = title.match(/\$([\d,]+)/);
  return m ? Number(m[1].replace(/,/g, "")) : undefined;
}

function bedroomsFromTitle(title) {
  const m = title.match(/(\d+)\s*br/i);
  return m ? Number(m[1]) : undefined;
}

function locationFromTitle(title) {
  const m = title.match(/\(([^)]+)\)\s*$/);
  return m ? m[1].trim() : undefined;
}

function cleanTitle(title) {
  return title.replace(/\s*\([^)]+\)\s*$/, "").trim();
}

function idFromUrl(url) {
  const m = url.match(/(\d+)\.html/);
  return m ? m[1] : url;
}
