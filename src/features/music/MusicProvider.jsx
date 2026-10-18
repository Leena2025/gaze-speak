import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { useNotice } from "../../app/NoticeContext.jsx";
import { readJson, STORAGE_KEYS, writeJson } from "../../app/storage.js";
import { LIBRARY_URL, nextIndex, normalizeLibrary, previousIndex, REPEAT_MODES, shuffledQueue } from "./library.js";

const MusicContext = createContext(null);

/**
 * One <audio> element for the whole app, created once, so music keeps
 * playing while the user moves between sections and two songs can never
 * play at the same time.
 */
export function MusicProvider({ children }) {
  const notify = useNotice();
  const saved = readJson(STORAGE_KEYS.music, {});
  const [library, setLibrary] = useState({ status: "loading", tracks: [], message: "" });
  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState({ current: 0, duration: NaN });
  const [volume, setVolumeState] = useState(() => (Number.isFinite(saved.volume) ? saved.volume : 0.8));
  const [repeat, setRepeat] = useState(() => (REPEAT_MODES.includes(saved.repeat) ? saved.repeat : "all"));
  const [shuffle, setShuffle] = useState(() => saved.shuffle === true);
  const [needsTap, setNeedsTap] = useState(false);
  const [failed, setFailed] = useState(() => new Set());

  const audioRef = useRef(null);
  if (!audioRef.current && typeof Audio !== "undefined") {
    audioRef.current = new Audio();
    audioRef.current.preload = "metadata";
  }
  const live = useRef({});
  live.current = { queue, index, repeat, tracks: library.tracks };
  const failuresInRowRef = useRef(0);

  const loadLibrary = useCallback(async () => {
    setLibrary((previous) => ({ ...previous, status: "loading", message: "" }));
    try {
      const response = await fetch(LIBRARY_URL, { cache: "no-store" });
      if (response.status === 404) {
        setLibrary({ status: "empty", tracks: [], message: "No music library yet. Copy MP3 files into public/music and run npm run music:index (see README)." });
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const type = response.headers.get("content-type") || "";
      if (!type.includes("json")) {
        setLibrary({ status: "empty", tracks: [], message: "No music library yet. Copy MP3 files into public/music and run npm run music:index (see README)." });
        return;
      }
      const { tracks, skipped } = normalizeLibrary(await response.json());
      setLibrary({
        status: tracks.length ? "ready" : "empty",
        tracks,
        message: tracks.length ? (skipped ? `${skipped} entries in library.json were skipped because they are not audio files.` : "") : "library.json lists no songs. Add MP3 files to public/music and run npm run music:index.",
      });
    } catch (error) {
      setLibrary({ status: "error", tracks: [], message: `The music library could not be loaded (${error.message}).` });
    }
  }, []);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    writeJson(STORAGE_KEYS.music, { volume, repeat, shuffle });
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume, repeat, shuffle]);

  const trackById = useCallback((id) => live.current.tracks.find((track) => track.id === id) ?? null, []);

  const startAt = useCallback((nextQueue, nextIdx) => {
    const audio = audioRef.current;
    const track = trackById(nextQueue[nextIdx]);
    if (!audio || !track) return;
    setQueue(nextQueue);
    setIndex(nextIdx);
    setTime({ current: 0, duration: track.durationSec ?? NaN });
    audio.src = track.url;
    audio.currentTime = 0;
    audio.play().then(() => setNeedsTap(false)).catch((error) => {
      if (error?.name === "NotAllowedError") {
        setNeedsTap(true);
        setPlaying(false);
        notify("The browser needs one tap or click on the page before music can play. Tap Play once.", "warn", 7000);
      }
      // Other failures arrive as the audio "error" event below.
    });
  }, [notify, trackById]);

  // Audio element events, attached once.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    let lastTimeUpdate = 0;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => {
      const now = performance.now();
      if (now - lastTimeUpdate < 400) return;
      lastTimeUpdate = now;
      setTime({ current: audio.currentTime, duration: audio.duration });
    };
    const onMeta = () => {
      failuresInRowRef.current = 0;
      setTime({ current: audio.currentTime, duration: audio.duration });
    };
    const onEnded = () => {
      const { queue: q, index: i, repeat: r } = live.current;
      if (r === "one") {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return;
      }
      const n = nextIndex(q.length, i, r);
      if (n === null) {
        setPlaying(false);
        setTime({ current: 0, duration: audio.duration });
        audio.currentTime = 0;
        audio.pause();
        notify("End of the playlist.", "info");
        return;
      }
      startAt(q, n);
    };
    const onError = () => {
      if (!audio.src) return;
      const { queue: q, index: i, repeat: r } = live.current;
      const id = q[i];
      setFailed((previous) => new Set(previous).add(id));
      setPlaying(false);
      failuresInRowRef.current += 1;
      const track = trackById(id);
      if (failuresInRowRef.current >= q.length) {
        notify("None of the songs in this list could be played. Check the files in public/music.", "danger", 8000);
        return;
      }
      notify(`"${track?.title ?? id}" could not be played (missing or damaged file). Skipping to the next song.`, "danger", 6000);
      const n = nextIndex(q.length, i, r === "one" ? "all" : r);
      if (n !== null) setTimeout(() => startAt(q, n), 1200);
    };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [notify, startAt, trackById]);

  useEffect(() => () => audioRef.current?.pause(), []);

  /** Plays `id`, queueing the given list (search results or the whole library). */
  const playTrack = useCallback((id, listIds) => {
    const ids = listIds?.length ? listIds : live.current.tracks.map((track) => track.id);
    failuresInRowRef.current = 0;
    if (shuffle) startAt(shuffledQueue(ids, id), 0);
    else startAt(ids, Math.max(0, ids.indexOf(id)));
  }, [shuffle, startAt]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (live.current.index < 0 || !audio.src) {
      const first = live.current.tracks[0];
      if (first) playTrack(first.id);
      return;
    }
    if (audio.paused) {
      audio.play().then(() => setNeedsTap(false)).catch((error) => {
        if (error?.name === "NotAllowedError") setNeedsTap(true);
      });
    } else {
      audio.pause();
    }
  }, [playTrack]);

  const next = useCallback(() => {
    const { queue: q, index: i, repeat: r } = live.current;
    const n = nextIndex(q.length, i, r === "one" ? "all" : r);
    if (n === null) notify("This is the last song in the list.", "info");
    else startAt(q, n);
  }, [notify, startAt]);

  const previous = useCallback(() => {
    const audio = audioRef.current;
    const { queue: q, index: i, repeat: r } = live.current;
    if (audio && audio.currentTime > 4) {
      audio.currentTime = 0;
      return;
    }
    const p = previousIndex(q.length, i, r);
    if (p !== null) startAt(q, p);
  }, [startAt]);

  const seekBy = useCallback((seconds) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.min(audio.duration - 0.5, Math.max(0, audio.currentTime + seconds));
    setTime({ current: audio.currentTime, duration: audio.duration });
  }, []);

  const changeVolume = useCallback((delta) => {
    setVolumeState((value) => Math.round(Math.min(1, Math.max(0, value + delta)) * 10) / 10);
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((value) => REPEAT_MODES[(REPEAT_MODES.indexOf(value) + 1) % REPEAT_MODES.length]);
  }, []);

  const toggleShuffle = useCallback(() => {
    const nextValue = !shuffle;
    setShuffle(nextValue);
    const { queue: q, index: i, tracks } = live.current;
    if (i >= 0 && q.length) {
      const currentId = q[i];
      const ids = nextValue ? shuffledQueue(q, currentId) : tracks.map((track) => track.id).filter((id) => q.includes(id));
      setQueue(ids);
      setIndex(ids.indexOf(currentId));
    }
  }, [shuffle]);

  const current = index >= 0 ? library.tracks.find((track) => track.id === queue[index]) ?? null : null;

  const value = useMemo(() => ({
    library,
    reload: loadLibrary,
    queue,
    index,
    current,
    playing,
    time,
    volume,
    repeat,
    shuffle,
    needsTap,
    failed,
    playTrack,
    toggle,
    next,
    previous,
    seekBy,
    changeVolume,
    cycleRepeat,
    toggleShuffle,
  }), [library, loadLibrary, queue, index, current, playing, time, volume, repeat, shuffle, needsTap, failed, playTrack, toggle, next, previous, seekBy, changeVolume, cycleRepeat, toggleShuffle]);

  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
}

export function useMusic() {
  const context = useContext(MusicContext);
  if (!context) throw new Error("useMusic must be used inside MusicProvider");
  return context;
}
