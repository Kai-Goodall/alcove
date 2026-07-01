/**
 * Shared HTTP helpers for the search engine.
 *
 * Everything here is plain `fetch` — no headless browser, no API keys. The
 * working adapters (Kijiji, Bamboo) render their data into embedded JSON
 * (`__NEXT_DATA__` / Apollo state), so a normal request + JSON parse is enough.
 */

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

export const DEFAULT_DELAY_MS = 500;

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function browserHeaders(referer) {
  return {
    "User-Agent": DEFAULT_USER_AGENT,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-CA,en;q=0.9",
    ...(referer ? { Referer: referer } : {}),
  };
}

/**
 * Fetch a URL with browser-like headers, a timeout, and light retry.
 * Returns `{ ok, status, text, url, error }` — never throws.
 */
export async function fetchText(url, options = {}) {
  const {
    referer,
    headers = {},
    timeoutMs = 20000,
    retries = 1,
    delayMs = DEFAULT_DELAY_MS,
  } = options;

  let lastError = "";
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { ...browserHeaders(referer), ...headers },
        redirect: "follow",
        signal: controller.signal,
      });
      const text = await response.text();
      clearTimeout(timer);
      if (!response.ok) {
        lastError = `${response.status} ${response.statusText}`;
        // 4xx (block/not-found) won't improve on retry; give up early.
        if (response.status < 500) {
          return { ok: false, status: response.status, text, url: response.url, error: lastError };
        }
      } else {
        return { ok: true, status: response.status, text, url: response.url };
      }
    } catch (error) {
      clearTimeout(timer);
      lastError = error.name === "AbortError" ? "timeout" : error.message;
    }
    if (attempt < retries) await delay(delayMs);
  }
  return { ok: false, status: 0, text: "", url, error: lastError };
}

/** Fetch and JSON.parse; returns `{ ok, data, error }`. */
export async function fetchJson(url, options = {}) {
  const result = await fetchText(url, {
    ...options,
    headers: { Accept: "application/json,text/plain,*/*", ...(options.headers ?? {}) },
  });
  if (!result.ok) return { ok: false, error: result.error, status: result.status };
  try {
    return { ok: true, data: JSON.parse(result.text) };
  } catch (error) {
    return { ok: false, error: `invalid JSON: ${error.message}`, status: result.status };
  }
}

/** Extract and parse the Next.js `__NEXT_DATA__` payload from an HTML string. */
export function parseNextData(html) {
  const match = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/** Very small HTML entity decoder for scraped text fields. */
export function decodeHtml(value = "") {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** Strip tags and collapse whitespace from an HTML fragment. */
export function stripTags(html = "") {
  return decodeHtml(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
