// Production server: serves the built app (dist/) and the news API.
//
//   npm run build
//   npm start            -> http://localhost:4173   (PORT=8080 npm start to change)
//
// Plain Node (20+), no dependencies. Supports HTTP Range requests so the
// music player can seek. For the camera to work, open the app on
// http://localhost or put it behind HTTPS.

import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { createNewsHandler } from "./news.js";

const ROOT = fileURLToPath(new URL("../dist/", import.meta.url));
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || "127.0.0.1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/ogg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".bin": "application/octet-stream",
};

if (!existsSync(join(ROOT, "index.html"))) {
  console.error("dist/ not found. Run `npm run build` first.");
  process.exit(1);
}

const news = createNewsHandler();

function resolvePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const path = normalize(join(ROOT, decoded));
  return path.startsWith(ROOT) || path === ROOT.slice(0, -1) ? path : null;
}

function sendFile(req, res, path) {
  const { size } = statSync(path);
  const type = TYPES[extname(path).toLowerCase()] || "application/octet-stream";
  res.setHeader("content-type", type);
  res.setHeader("accept-ranges", "bytes");
  res.setHeader("cache-control", path.includes(`${sep}assets${sep}`) ? "public, max-age=31536000, immutable" : "no-cache");
  const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) {
      res.statusCode = 416;
      res.setHeader("content-range", `bytes */${size}`);
      return res.end();
    }
    res.statusCode = 206;
    res.setHeader("content-range", `bytes ${start}-${end}/${size}`);
    res.setHeader("content-length", end - start + 1);
    if (req.method === "HEAD") return res.end();
    return createReadStream(path, { start, end }).pipe(res);
  }
  res.setHeader("content-length", size);
  if (req.method === "HEAD") return res.end();
  return createReadStream(path).pipe(res);
}

createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/news") return news(req, res);
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    return res.end();
  }
  const path = resolvePath(url.pathname);
  if (!path) {
    res.statusCode = 400;
    return res.end("Bad path");
  }
  if (existsSync(path) && statSync(path).isFile()) return sendFile(req, res, path);
  // Missing media or data files are real 404s; everything else is the app.
  if (/\.[a-z0-9]+$/i.test(url.pathname)) {
    res.statusCode = 404;
    return res.end("Not found");
  }
  return sendFile(req, res, join(ROOT, "index.html"));
}).listen(PORT, HOST, () => {
  console.log(`I-Gaze is running at http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
});
