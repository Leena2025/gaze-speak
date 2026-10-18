// Music library and queue rules. Pure functions, unit-tested.
//
// The library is the file public/music/library.json, generated from the MP3
// files in public/music by `npm run music:index` (see README).

export const MUSIC_BASE_URL = "/music/";
export const LIBRARY_URL = `${MUSIC_BASE_URL}library.json`;
export const REPEAT_MODES = Object.freeze(["off", "all", "one"]);

const AUDIO_FILE = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$/i;

export function trackUrl(file) {
  return MUSIC_BASE_URL + file.split("/").map(encodeURIComponent).join("/");
}

/** Title/artist from a file name like "Artist - Title.mp3" when tags are missing. */
export function guessFromFileName(file) {
  const base = file.split("/").pop().replace(AUDIO_FILE, "").replace(/_/g, " ").trim();
  const parts = base.split(/\s+-\s+/);
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() };
  return { artist: "", title: base };
}

/** Validates library.json. Returns { tracks, skipped } and never throws on bad entries. */
export function normalizeLibrary(json) {
  const list = Array.isArray(json) ? json : Array.isArray(json?.tracks) ? json.tracks : null;
  if (!list) throw new Error("library.json must contain a \"tracks\" list.");
  const tracks = [];
  const seen = new Set();
  let skipped = 0;
  for (const entry of list) {
    const file = typeof entry === "string" ? entry : entry?.file;
    if (typeof file !== "string" || !AUDIO_FILE.test(file) || file.includes("..") || seen.has(file)) {
      skipped += 1;
      continue;
    }
    seen.add(file);
    const guess = guessFromFileName(file);
    const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : "");
    tracks.push({
      id: file,
      file,
      url: trackUrl(file),
      title: text(entry?.title) || guess.title,
      artist: text(entry?.artist) || guess.artist,
      album: text(entry?.album),
      durationSec: Number.isFinite(entry?.durationSec) ? entry.durationSec : null,
    });
  }
  return { tracks, skipped };
}

function fold(text) {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Every word of the query must appear in the title, artist or album. */
export function searchTracks(tracks, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return tracks;
  return tracks.filter((track) => {
    const haystack = fold(`${track.title} ${track.artist} ${track.album}`);
    return words.every((word) => haystack.includes(word));
  });
}

/**
 * Where to go when a song ends or Next is chosen.
 * Returns the next index, or null to stop at the end of the queue.
 */
export function nextIndex(length, index, repeat) {
  if (!length) return null;
  if (index + 1 < length) return index + 1;
  return repeat === "all" ? 0 : null;
}

export function previousIndex(length, index, repeat) {
  if (!length) return null;
  if (index > 0) return index - 1;
  return repeat === "all" ? length - 1 : 0;
}

/** Fisher-Yates shuffle that keeps `firstId` at the front (the song the user chose). */
export function shuffledQueue(ids, firstId, random = Math.random) {
  const rest = ids.filter((id) => id !== firstId);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return firstId !== undefined && ids.includes(firstId) ? [firstId, ...rest] : rest;
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "–:––";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
