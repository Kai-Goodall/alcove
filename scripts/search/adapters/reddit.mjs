/**
 * Reddit adapter — BEST EFFORT lead generation.
 *
 * City subreddits carry rental posts (sublets, lease takeovers, "renting my
 * unit" posts) and mentions of specific apartment complexes that portals
 * miss. Reddit's public JSON endpoints are unauthenticated but throttled
 * hard (403/429 for many client fingerprints); this adapter tries the JSON
 * search first and falls back to the Atom feed, running several targeted
 * queries per subreddit. Whatever survives becomes an unverified lead row
 * linking to the Reddit post — expect to open the post for details.
 *
 * Subreddits come from `search.redditSubreddits` in alcove.config.mjs, with
 * fallbacks for well-known city subs. The AI deep search is the more
 * reliable path to Reddit content (Claude's web search reads it directly).
 */

import { delay, decodeHtml } from "../http.mjs";

const CITY_SUBREDDITS = {
  "waterloo": ["KitchenerWaterloo", "uwaterloo"],
  "kitchener": ["KitchenerWaterloo"],
  "cambridge": ["KitchenerWaterloo"],
  "toronto": ["TorontoRenting", "toronto"],
  "ottawa": ["ottawa"],
  "guelph": ["Guelph"],
  "hamilton": ["Hamilton"],
  "london": ["londonontario"],
  "montreal": ["montrealhousing"],
  "vancouver": ["vancouverhousing"],
  "calgary": ["Calgary"],
  "edmonton": ["Edmonton"],
  "new york": ["NYCapartments"],
  "brooklyn": ["NYCapartments"],
  "san francisco": ["SFBayHousing"],
  "boston": ["bostonhousing"],
  "seattle": ["SeattleHousing"],
  "chicago": ["chicagoapartments"],
};

const UA = "web:alcove-apartment-search:v1 (self-hosted apartment dashboard)";

export const id = "reddit";
export const label = "Reddit";

function subredditsFor(criteria) {
  if (criteria.redditSubreddits?.length) return criteria.redditSubreddits;
  return CITY_SUBREDDITS[(criteria.location?.city ?? "").toLowerCase()] ?? [];
}

export function supports(criteria) {
  return subredditsFor(criteria).length > 0;
}

export function unsupportedReason(criteria) {
  return `No subreddits known for "${criteria.location?.city}". Set search.redditSubreddits in alcove.config.mjs.`;
}

export async function search(criteria, ctx = {}) {
  const log = ctx.log ?? (() => {});
  const limit = criteria.perSourceLimit || 60;
  const subreddits = subredditsFor(criteria).slice(0, 3);

  const queries = buildQueries(criteria);
  const seen = new Set();
  const collected = [];
  let blocked = 0;

  for (const subreddit of subreddits) {
    for (const query of queries) {
      const posts = await searchSubreddit(subreddit, query, log);
      if (posts === null) blocked += 1;
      for (const post of posts ?? []) {
        if (seen.has(post.sourceId)) continue;
        seen.add(post.sourceId);
        collected.push(post);
      }
      if (collected.length >= limit) return collected.slice(0, limit);
      // Reddit throttles unauthenticated clients aggressively; go slow.
      await delay(1500);
    }
  }

  if (!collected.length && blocked > 0) {
    throw new Error(
      "Reddit throttled all requests (403/429). Try again later or use AI deep search, which reads Reddit via web search.",
    );
  }
  // Prices in posts are in the local currency of the search area.
  for (const post of collected) post.currency = criteria.currency;
  return collected;
}

function buildQueries(criteria) {
  const queries = ["rent OR sublet OR lease", "apartment"];
  const beds = [];
  for (
    let n = criteria.minBedrooms ?? 1;
    n <= Math.min(criteria.maxBedrooms ?? criteria.minBedrooms ?? 2, 3);
    n += 1
  ) {
    beds.push(`"${n} bedroom" OR "${n}br" OR "${n}bhk"`);
  }
  return [...queries, ...beds].slice(0, 3);
}

/** Returns posts, [] for no results, or null when blocked. */
async function searchSubreddit(subreddit, query, log) {
  const params = new URLSearchParams({
    q: query,
    restrict_sr: "1",
    sort: "new",
    t: "month",
    limit: "25",
  });

  // JSON first (richest), Atom feed as fallback.
  const jsonUrl = `https://www.reddit.com/r/${subreddit}/search.json?${params}`;
  const json = await tryFetch(jsonUrl, "application/json");
  if (json) {
    try {
      const children = JSON.parse(json)?.data?.children ?? [];
      return children.map((c) => fromJsonPost(c?.data, subreddit)).filter(Boolean);
    } catch {
      // fall through to RSS
    }
  }

  const rssUrl = `https://www.reddit.com/r/${subreddit}/search.rss?${params}`;
  const rss = await tryFetch(rssUrl, "application/atom+xml,application/xml");
  if (rss) return parseAtom(rss, subreddit);

  log(`reddit r/${subreddit} blocked for "${query}".`);
  return null;
}

async function tryFetch(url, accept) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: accept },
      signal: controller.signal,
    });
    const text = await res.text();
    clearTimeout(timer);
    return res.ok ? text : null;
  } catch {
    return null;
  }
}

function fromJsonPost(post, subreddit) {
  if (!post?.id || post.stickied) return null;
  const title = post.title ?? "";
  if (!looksLikeRental(title + " " + (post.link_flair_text ?? ""))) return null;
  const text = `${title} ${post.selftext ?? ""}`;
  const thumb =
    post.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, "&") ??
    (post.thumbnail?.startsWith("http") ? post.thumbnail : undefined);
  return {
    source: "reddit",
    sourceId: post.id,
    url: `https://www.reddit.com${post.permalink}`,
    provider: `Reddit r/${subreddit}`,
    title,
    description: (post.selftext ?? "").slice(0, 500) || undefined,
    price: priceFrom(text),
    bedrooms: bedroomsFrom(text),
    imageUrls: thumb ? [thumb] : undefined,
    postedAt: post.created_utc
      ? new Date(post.created_utc * 1000).toISOString()
      : undefined,
  };
}

function parseAtom(xml, subreddit) {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  const out = [];
  for (const entry of entries) {
    const title = decodeHtml(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
    const link = entry.match(/<link href="([^"]+)"/)?.[1];
    const entryId = entry.match(/<id>([\s\S]*?)<\/id>/)?.[1];
    if (!link || !looksLikeRental(title)) continue;
    out.push({
      source: "reddit",
      sourceId: entryId ?? link,
      url: link,
      provider: `Reddit r/${subreddit}`,
      title,
      price: priceFrom(title),
      bedrooms: bedroomsFrom(title),
      postedAt: entry.match(/<updated>([\s\S]*?)<\/updated>/)?.[1],
    });
  }
  return out;
}

/** Filter obvious non-listing chatter ("looking for", questions, wanted ads). */
function looksLikeRental(text) {
  const t = text.toLowerCase();
  if (/looking for|wanted|seeking|anyone know|question|advice|recommend/i.test(t)) {
    return false;
  }
  return /rent|sublet|subletting|lease|apartment|condo|room|unit|housing|1b|2b|3b|bedroom|studio/i.test(t);
}

function priceFrom(text) {
  const m = text.match(/\$\s?([\d,]{3,6})(?:\s?\/\s?(?:month|mo|m)\b)?/i);
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, ""));
  return n >= 300 && n <= 25000 ? n : undefined;
}

function bedroomsFrom(text) {
  const m = text.match(/(\d)\s*(?:br|bed(?:room)?s?|b\/)/i);
  if (m) return Number(m[1]);
  if (/studio|bachelor/i.test(text)) return 0;
  return undefined;
}
