// News API used by the News section: GET /api/news?lang=en|ta&feed=<id>[&refresh=1]
//
// Browsers cannot read most publishers' RSS feeds directly (no CORS), so
// this small handler fetches the configured feeds on the server side,
// parses them, caches the result and returns JSON. It runs inside the Vite
// dev/preview server (vite.config.js) and the production server
// (server/index.js). No API keys are needed for RSS.
//
// - Only feed URLs from news-feeds.json are fetched (not an open proxy).
// - Each feed is fetched at most once per CACHE_MS, and a manual refresh is
//   honoured only when the copy is older than MIN_REFRESH_MS.
// - Only the publisher's own headline and short description are returned,
//   with a link to the original article. Articles are not copied.

import { readFileSync } from "node:fs";

const CACHE_MS = 10 * 60 * 1000;
const MIN_REFRESH_MS = 2 * 60 * 1000;
const TIMEOUT_MS = 10000;
const MAX_ITEMS = 40;
const SUMMARY_CHARS = 420;

export function loadFeedConfig(path = process.env.NEWS_FEEDS_FILE || new URL("./news-feeds.json", import.meta.url)) {
  return normalizeFeedConfig(JSON.parse(readFileSync(path, "utf8")));
}

/** Keeps only well-formed http(s) feeds. Used by the Node server and the Netlify function. */
export function normalizeFeedConfig(config) {
  const result = {};
  for (const lang of ["en", "ta"]) {
    result[lang] = (config[lang] || []).filter((feed) => feed?.id && feed?.url && /^https?:\/\//.test(feed.url)).map((feed) => ({
      id: String(feed.id), label: String(feed.label || feed.id), source: String(feed.source || ""), url: feed.url,
    }));
  }
  return result;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”" };

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === "#") {
      const value = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value > 0 && value < 0x110000 ? String.fromCodePoint(value) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function unwrap(value) {
  if (value == null) return "";
  const cdata = value.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return cdata ? cdata[1] : decodeEntities(value);
}

/** Removes markup from a description and shortens it at a word boundary. */
export function toPlainText(html, limit = SUMMARY_CHARS) {
  const text = decodeEntities(String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), limit - 40))}…`;
}

function tag(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return match ? unwrap(match[1]) : "";
}

function attr(block, name, attribute, filter = () => true) {
  const re = new RegExp(`<${name}\\b([^>]*)/?>`, "gi");
  let match;
  while ((match = re.exec(block))) {
    const attrs = match[1];
    const value = attrs.match(new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']+)["']`, "i"));
    if (value && filter(attrs)) return decodeEntities(value[1]);
  }
  return "";
}

function safeUrl(value) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function isoDate(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** Parses RSS 2.0 <item>s or Atom <entry>s into plain article objects. */
export function parseFeed(xml) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  const items = [];
  for (const block of blocks.slice(0, MAX_ITEMS)) {
    const title = toPlainText(tag(block, "title"), 300);
    const link = safeUrl(tag(block, "link") || attr(block, "link", "href", (attrs) => !/rel=["'](?!alternate)/i.test(attrs)));
    if (!title || !link) continue;
    const description = tag(block, "description") || tag(block, "summary") || tag(block, "content");
    const image = safeUrl(
      attr(block, "media:thumbnail", "url") ||
      attr(block, "media:content", "url", (attrs) => !/medium=["'](?!image)/i.test(attrs)) ||
      attr(block, "enclosure", "url", (attrs) => /type=["']image\//i.test(attrs)) ||
      "",
    );
    items.push({
      id: tag(block, "guid") || tag(block, "id") || link,
      title,
      link,
      summary: toPlainText(description),
      published: isoDate(tag(block, "pubDate") || tag(block, "published") || tag(block, "updated") || tag(block, "dc:date")),
      image: image || null,
    });
  }
  return items;
}

/**
 * Creates the request handler. `fetchImpl` and `now` are injectable for tests.
 */
export function createNewsHandler({ feeds = loadFeedConfig(), fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  const cache = new Map(); // url -> { at, items, error }
  const inflight = new Map();

  async function fetchFeed(feed) {
    if (inflight.has(feed.url)) return inflight.get(feed.url);
    const job = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetchImpl(feed.url, {
          signal: controller.signal,
          headers: { "user-agent": "I-Gaze assistive news reader (RSS)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
        });
        if (!response.ok) throw new Error(`the news service answered HTTP ${response.status}`);
        const items = parseFeed(await response.text());
        cache.set(feed.url, { at: now(), items, error: null });
      } catch (error) {
        const reason = error?.name === "AbortError" ? "the news service did not answer in time" : error?.message || String(error);
        const previous = cache.get(feed.url);
        cache.set(feed.url, { at: previous?.at ?? 0, items: previous?.items ?? null, error: reason, failedAt: now() });
      } finally {
        clearTimeout(timer);
        inflight.delete(feed.url);
      }
      return cache.get(feed.url);
    })();
    inflight.set(feed.url, job);
    return job;
  }

  async function getNews({ lang, feedId, refresh }) {
    const list = feeds[lang];
    if (!list) return { status: 400, body: { error: "Unknown language. Use lang=en or lang=ta." } };
    if (!list.length) return { status: 404, body: { error: `No news feeds are configured for ${lang}.` } };
    const feed = list.find((item) => item.id === feedId) || list[0];
    let entry = cache.get(feed.url);
    const age = entry ? now() - entry.at : Infinity;
    const recentlyFailed = entry?.failedAt && now() - entry.failedAt < 30000;
    if (!recentlyFailed && (age > CACHE_MS || (refresh && age > MIN_REFRESH_MS))) entry = await fetchFeed(feed);
    const body = {
      lang,
      feed: { id: feed.id, label: feed.label, source: feed.source },
      feeds: list.map(({ id, label }) => ({ id, label })),
      items: (entry?.items || []).map((item) => ({ ...item, source: feed.source })),
      fetchedAt: entry?.at ? new Date(entry.at).toISOString() : null,
      stale: Boolean(entry?.error && entry?.items),
      error: entry?.error && !entry?.items ? `News could not be loaded: ${entry.error}.` : null,
      nextRefreshAllowedAt: entry?.at ? new Date(entry.at + MIN_REFRESH_MS).toISOString() : null,
    };
    return { status: body.error ? 502 : 200, body };
  }

  async function handle(req, res) {
    try {
      const url = new URL(req.url, "http://localhost");
      const lang = url.searchParams.get("lang") || "en";
      const feedId = (url.searchParams.get("feed") || "").slice(0, 40);
      const refresh = url.searchParams.get("refresh") === "1";
      const { status, body } = await getNews({ lang, feedId, refresh });
      res.statusCode = status;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(JSON.stringify(body));
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: `News service error: ${error?.message || error}` }));
    }
  }
  // The Netlify function calls getNews directly (it has no Node req/res).
  handle.getNews = getNews;
  return handle;
}
