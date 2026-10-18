// The news API on Netlify. Locally, `npm run dev` and `npm start` serve the
// same /api/news from server/news.js; on Netlify this function does it,
// because Netlify does not run server/index.js.
//
// It only fetches the public RSS feeds listed in server/news-feeds.json, and
// keeps each for 10 minutes while the function instance stays warm.

import { createNewsHandler, normalizeFeedConfig } from "../../server/news.js";
import feedConfig from "../../server/news-feeds.json" with { type: "json" };

let handler = null;

export default async function news(request) {
  handler ??= createNewsHandler({ feeds: normalizeFeedConfig(feedConfig) });
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") || "en";
  const feedId = (url.searchParams.get("feed") || "").slice(0, 40);
  const refresh = url.searchParams.get("refresh") === "1";
  try {
    const { status, body } = await handler.getNews({ lang, feedId, refresh });
    return Response.json(body, { status, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: `News service error: ${error?.message || error}` }, { status: 500 });
  }
}

export const config = { path: "/api/news" };
