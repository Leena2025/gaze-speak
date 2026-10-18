// Client for the app's own /api/news endpoint (server/news.js).

export async function fetchNews({ lang, feed, refresh = false, signal }) {
  const params = new URLSearchParams({ lang });
  if (feed) params.set("feed", feed);
  if (refresh) params.set("refresh", "1");
  let response;
  try {
    response = await fetch(`/api/news?${params}`, { signal, headers: { accept: "application/json" } });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new Error("The news service could not be reached. Check the internet connection.");
  }
  const type = response.headers.get("content-type") || "";
  if (!type.includes("json")) {
    throw new Error("The news service is not running. Start the app with `npm run dev` or `npm start` (a plain static host has no news API).");
  }
  const body = await response.json();
  if (!response.ok && !body.items?.length) throw new Error(body.error || `News could not be loaded (HTTP ${response.status}).`);
  return body;
}

export function formatPublished(iso, lang) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return date.toLocaleString(lang === "ta" ? "ta-IN" : "en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  } catch {
    return date.toLocaleString();
  }
}
