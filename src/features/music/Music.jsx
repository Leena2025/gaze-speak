import { useMemo, useState } from "react";

import GazeButton from "../../components/GazeButton.jsx";
import Pager, { usePaged } from "../../components/Pager.jsx";
import SearchKeyboard from "../../components/SearchKeyboard.jsx";
import { formatTime, searchTracks } from "./library.js";
import { useMusic } from "./MusicProvider.jsx";

const PAGE_SIZE = 6;
const REPEAT_LABELS = { off: "Repeat off", all: "Repeat list", one: "Repeat song" };

export default function Music() {
  const music = useMusic();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const results = useMemo(() => searchTracks(music.library.tracks, query), [music.library.tracks, query]);
  const paged = usePaged(results, PAGE_SIZE, query);
  const track = music.current;
  const progress = Number.isFinite(music.time.duration) && music.time.duration > 0 ? music.time.current / music.time.duration : 0;

  return (
    <div className="music">
      <section className="now-playing" aria-label="Now playing">
        <div className="now-playing__info">
          <p className="eyebrow">{track ? (music.playing ? "Now playing" : "Paused") : "Nothing playing"}</p>
          <h2 className="now-playing__title">{track ? track.title : "Choose a song"}</h2>
          <p className="now-playing__artist">{track ? track.artist || "Unknown artist" : `${music.library.tracks.length} songs in your library`}</p>
        </div>
        <div className="progress" role="progressbar" aria-label="Song progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div className="progress__bar" style={{ transform: `scaleX(${progress})` }} />
        </div>
        <p className="now-playing__time">
          <span>{formatTime(music.time.current)}</span>
          <span>{formatTime(music.time.duration)}</span>
        </p>
        {music.needsTap && (
          <p className="notice notice--warn" role="status">
            The browser blocks sound until someone taps or clicks the page once.
            <button type="button" className="btn btn--primary" onClick={music.toggle}>Tap here to play</button>
          </p>
        )}
        <div className="transport">
          <GazeButton icon="prev" label="Previous" disabled={!track} onClick={music.previous} />
          <GazeButton icon="back" label="−15 s" aria-label="Back 15 seconds" disabled={!track} onClick={() => music.seekBy(-15)} />
          <GazeButton className="transport__play" variant="primary" icon={music.playing ? "pause" : "play"} label={music.playing ? "Pause" : "Play"} disabled={!music.library.tracks.length} onClick={music.toggle} />
          <GazeButton icon="forward" label="+15 s" aria-label="Ahead 15 seconds" disabled={!track} onClick={() => music.seekBy(15)} />
          <GazeButton icon="next" label="Next" disabled={!track} onClick={music.next} />
        </div>
        <div className="transport transport--secondary">
          <GazeButton icon="repeat" label={REPEAT_LABELS[music.repeat]} aria-pressed={music.repeat !== "off"} onClick={music.cycleRepeat} />
          <GazeButton icon="shuffle" label={music.shuffle ? "Shuffle on" : "Shuffle off"} aria-pressed={music.shuffle} onClick={music.toggleShuffle} />
          <GazeButton icon="minus" label="Quieter" disabled={music.volume <= 0} onClick={() => music.changeVolume(-0.1)} />
          <span className="volume-readout" aria-live="polite">Volume {Math.round(music.volume * 100)}%</span>
          <GazeButton icon="plus" label="Louder" disabled={music.volume >= 1} onClick={() => music.changeVolume(0.1)} />
        </div>
      </section>

      <section className="library" aria-label="Song library">
        <div className="library__search">
          <GazeButton icon="search" label={query ? `Search: “${query}”` : "Search songs"} onClick={() => setSearching(true)} />
          {query && <GazeButton icon="close" label="Show all" onClick={() => setQuery("")} />}
          <input className="library__input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type to search (helper)" aria-label="Search songs by title, artist or album" />
        </div>

        {music.library.status === "loading" && <p className="empty-state empty-state--loading" role="status"><span className="spinner spinner--inline" aria-hidden="true" /> Loading your music library…</p>}
        {music.library.status !== "loading" && music.library.status !== "ready" && (
          <div className="empty-state">
            <p>{music.library.message}</p>
            <button type="button" className="btn" onClick={music.reload}>Check again</button>
          </div>
        )}
        {music.library.status === "ready" && music.library.message && <p className="muted small">{music.library.message}</p>}
        {music.library.status === "ready" && results.length === 0 && <p className="empty-state">No songs match “{query}”.</p>}

        <ul className="track-list">
          {paged.items.map((item) => {
            const isCurrent = track?.id === item.id;
            return (
              <li key={item.id}>
                <GazeButton
                  className={`track${isCurrent ? " track--current" : ""}`}
                  aria-current={isCurrent ? "true" : undefined}
                  onClick={() => (isCurrent ? music.toggle() : music.playTrack(item.id, results.map((result) => result.id)))}
                >
                  <span className="track__state" aria-hidden="true">{isCurrent && music.playing ? "▶" : ""}</span>
                  <span className="track__text">
                    <span className="track__title">{item.title}</span>
                    <span className="track__artist">{item.artist || "Unknown artist"}{item.album ? ` · ${item.album}` : ""}</span>
                  </span>
                  {music.failed.has(item.id) && <span className="track__badge">Cannot play</span>}
                  <span className="track__time">{formatTime(item.durationSec)}</span>
                </GazeButton>
              </li>
            );
          })}
        </ul>
        <Pager paged={paged} label="songs" />
      </section>

      {searching && (
        <SearchKeyboard title="Search songs" value={query} onChange={setQuery} onClose={() => setSearching(false)} resultCount={results.length} />
      )}
    </div>
  );
}
