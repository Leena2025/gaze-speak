// Builds public/music/library.json from the audio files in public/music.
//
//   npm run music:index            add new files, keep your edits to existing entries
//   npm run music:index -- --fresh rebuild every entry from the file tags
//
// Title, artist and album come from the MP3's ID3 tags (v2.2-2.4, or v1),
// otherwise from the file name ("Artist - Title.mp3"). Duration is read from
// the MP3 frame headers. No dependencies; Node 20+.

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MUSIC_DIR = fileURLToPath(new URL("../public/music/", import.meta.url));
const OUTPUT = join(MUSIC_DIR, "library.json");
const AUDIO = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$/i;
const fresh = process.argv.includes("--fresh");

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else if (AUDIO.test(name)) files.push(path);
  }
  return files;
}

function syncSafe(buffer, offset) {
  return (buffer[offset] << 21) | (buffer[offset + 1] << 14) | (buffer[offset + 2] << 7) | buffer[offset + 3];
}

function decodeText(bytes) {
  if (!bytes.length) return "";
  const encoding = bytes[0];
  const body = bytes.subarray(1);
  let text;
  if (encoding === 1 || encoding === 2) {
    let data = body;
    let little = encoding === 1;
    if (encoding === 1 && data.length >= 2) {
      if (data[0] === 0xff && data[1] === 0xfe) { little = true; data = data.subarray(2); }
      else if (data[0] === 0xfe && data[1] === 0xff) { little = false; data = data.subarray(2); }
    }
    const swapped = Buffer.from(data.subarray(0, data.length - (data.length % 2)));
    if (!little) swapped.swap16();
    text = swapped.toString("utf16le");
  } else if (encoding === 3) {
    text = body.toString("utf8");
  } else {
    text = body.toString("latin1");
  }
  return text.replace(/\0+$/g, "").split("\0")[0].trim();
}

/** Returns { tags, tagSize } from an ID3v2 header, or empty tags. */
function readId3v2(buffer) {
  const tags = {};
  if (buffer.length < 10 || buffer.toString("latin1", 0, 3) !== "ID3") return { tags, tagSize: 0 };
  const version = buffer[3];
  const flags = buffer[5];
  const tagSize = syncSafe(buffer, 6) + 10 + (flags & 0x10 ? 10 : 0);
  let offset = 10;
  if (flags & 0x40 && version >= 3) offset += version === 4 ? syncSafe(buffer, 10) : buffer.readUInt32BE(10) + 4;
  const idLength = version === 2 ? 3 : 4;
  const headerLength = version === 2 ? 6 : 10;
  const wanted = version === 2
    ? { TT2: "title", TP1: "artist", TAL: "album", TLE: "length" }
    : { TIT2: "title", TPE1: "artist", TALB: "album", TLEN: "length" };
  while (offset + headerLength < Math.min(tagSize, buffer.length)) {
    const id = buffer.toString("latin1", offset, offset + idLength);
    if (!/^[A-Z0-9]+$/.test(id)) break;
    let size;
    if (version === 2) size = (buffer[offset + 3] << 16) | (buffer[offset + 4] << 8) | buffer[offset + 5];
    else if (version === 4) size = syncSafe(buffer, offset + 4);
    else size = buffer.readUInt32BE(offset + 4);
    if (size <= 0) break;
    const key = wanted[id];
    if (key) tags[key] = decodeText(buffer.subarray(offset + headerLength, offset + headerLength + size));
    offset += headerLength + size;
  }
  return { tags, tagSize };
}

function readId3v1(buffer) {
  if (buffer.length < 128) return {};
  const tail = buffer.subarray(buffer.length - 128);
  if (tail.toString("latin1", 0, 3) !== "TAG") return {};
  const field = (start, length) => tail.toString("latin1", start, start + length).replace(/\0.*$/, "").trim();
  return { title: field(3, 30), artist: field(33, 30), album: field(63, 30) };
}

const BITRATES = {
  "1-3": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  "2-3": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const SAMPLE_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** MP3 duration in seconds from the Xing/Info header, else a constant-bitrate estimate. */
function mp3Duration(buffer, start) {
  for (let i = start; i < Math.min(buffer.length - 4, start + 64 * 1024); i++) {
    if (buffer[i] !== 0xff || (buffer[i + 1] & 0xe0) !== 0xe0) continue;
    const versionBits = (buffer[i + 1] >> 3) & 3;
    const layer = (buffer[i + 1] >> 1) & 3;
    const bitrateIndex = buffer[i + 2] >> 4;
    const rateIndex = (buffer[i + 2] >> 2) & 3;
    if (versionBits === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) continue;
    const mpeg1 = versionBits === 3;
    const sampleRate = SAMPLE_RATES[versionBits][rateIndex];
    const bitrate = BITRATES[mpeg1 ? "1-3" : "2-3"][bitrateIndex] * 1000;
    const samplesPerFrame = mpeg1 ? 1152 : 576;
    const mono = (buffer[i + 3] >> 6) === 3;
    const sideInfo = mpeg1 ? (mono ? 17 : 32) : (mono ? 9 : 17);
    const xing = i + 4 + sideInfo;
    const marker = buffer.toString("latin1", xing, xing + 4);
    if ((marker === "Xing" || marker === "Info") && buffer.readUInt32BE(xing + 4) & 1) {
      const frames = buffer.readUInt32BE(xing + 8);
      return Math.round((frames * samplesPerFrame) / sampleRate);
    }
    return Math.round(((buffer.length - i) * 8) / bitrate);
  }
  return null;
}

if (!existsSync(MUSIC_DIR)) {
  console.error(`Folder not found: ${MUSIC_DIR}`);
  process.exit(1);
}

let previous = {};
if (!fresh && existsSync(OUTPUT)) {
  try {
    for (const entry of JSON.parse(readFileSync(OUTPUT, "utf8")).tracks || []) previous[entry.file] = entry;
  } catch {
    console.warn("Existing library.json could not be read; rebuilding it.");
    previous = {};
  }
}

const tracks = [];
const problems = [];
for (const path of walk(MUSIC_DIR).sort((a, b) => a.localeCompare(b))) {
  const file = relative(MUSIC_DIR, path).split(sep).join("/");
  try {
    const buffer = readFileSync(path);
    const { tags, tagSize } = readId3v2(buffer);
    const v1 = readId3v1(buffer);
    const base = file.split("/").pop().replace(AUDIO, "").replace(/_/g, " ");
    const [nameArtist, ...nameTitle] = base.split(/\s+-\s+/);
    const fromName = nameTitle.length ? { artist: nameArtist.trim(), title: nameTitle.join(" - ").trim() } : { artist: "", title: base.trim() };
    const tagLength = Number(tags.length) > 0 ? Math.round(Number(tags.length) / 1000) : null;
    const duration = /\.mp3$/i.test(file) ? tagLength ?? mp3Duration(buffer, tagSize) : null;
    const old = previous[file] || {};
    tracks.push({
      file,
      title: old.title || tags.title || v1.title || fromName.title,
      artist: old.artist || tags.artist || v1.artist || fromName.artist,
      album: old.album || tags.album || v1.album || "",
      durationSec: old.durationSec ?? duration,
    });
  } catch (error) {
    problems.push(`${file}: ${error.message}`);
  }
}

writeFileSync(OUTPUT, `${JSON.stringify({ generatedAt: new Date().toISOString(), tracks }, null, 2)}\n`);
console.log(`Wrote ${tracks.length} songs to public/music/library.json`);
if (problems.length) console.warn(`Skipped ${problems.length} files:\n  ${problems.join("\n  ")}`);
if (!tracks.length) console.warn("No audio files found. Copy your MP3 files into public/music first.");
