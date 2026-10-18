import { railSection, SECTIONS } from "../app/router.js";
import { useGaze } from "../gaze/GazeProvider.jsx";
import { useMusic } from "../features/music/MusicProvider.jsx";
import GazeButton from "./GazeButton.jsx";
import Icon from "./Icon.jsx";
import TrackingStatus from "./TrackingStatus.jsx";

/**
 * Persistent frame around every section: a navigation rail with large
 * labelled targets, a top bar with the section title, music and tracking
 * status, and banners that say plainly when eye control is not working.
 * `immersive` hides the rail (full-screen keyboard) but keeps Home reachable.
 */
export default function AppShell({ route, navigate, immersive = false, onCalibrate, children }) {
  // Talk's methods (Type, Needs, Symbols) show as Talk in the rail and title.
  const current = railSection(route);
  const section = SECTIONS.find((item) => item.id === current) ?? SECTIONS[0];

  return (
    <div className={`shell${immersive ? " shell--immersive" : ""}`}>
      {!immersive && (
        <nav className="rail" aria-label="Sections">
          <div className="rail__brand" aria-hidden="true">
            <Icon name="eye" className="rail__brand-icon" />
            <span>GAZE</span>
          </div>
          {SECTIONS.filter((item) => !item.part).map((item) => (
            <GazeButton
              key={item.id}
              className="rail__item"
              icon={item.icon}
              label={item.short}
              dwell={1.2}
              aria-current={item.id === current ? "page" : undefined}
              aria-label={item.label}
              onClick={() => navigate(item.id)}
            />
          ))}
        </nav>
      )}
      <div className="shell__main">
        <header className="topbar">
          {immersive && (
            <div className="topbar__nav">
              <GazeButton icon="home" label="Home" dwell={1.2} onClick={() => navigate("home")} />
              <GazeButton icon="chat" label="Communicate" dwell={1.2} onClick={() => navigate("communicate")} />
            </div>
          )}
          <div className="topbar__heading">
            <h1 className="topbar__title">{section.label}</h1>
            {section.purpose && <p className="topbar__purpose">{section.purpose}</p>}
          </div>
          {/* A page can put its own controls here (Symbols: its language). */}
          <div className="topbar__tools" id="topbar-tools" />
          <MiniPlayer navigate={navigate} />
          {/* Home shows the full status itself, so the pill is not repeated there. */}
          <TrackingStatus compact={immersive} showPill={route !== "home"} />
        </header>
        <StatusBanner onCalibrate={onCalibrate} onHome={route === "home"} />
        <main className="content" data-gaze-clip id="main">
          {children}
        </main>
      </div>
    </div>
  );
}

function MiniPlayer({ navigate }) {
  const music = useMusic();
  const track = music.current;
  if (!track) return null;
  return (
    <div className="mini-player" aria-label="Music">
      <GazeButton
        className="mini-player__toggle"
        variant="quiet"
        icon={music.playing ? "pause" : "play"}
        label={music.playing ? "Pause music" : "Play music"}
        onClick={music.toggle}
      />
      <button type="button" className="mini-player__title" onClick={() => navigate("music")} title="Open music">
        {track.title}
      </button>
    </div>
  );
}

/** Explains, without guessing, why eye control is not selecting right now. */
function StatusBanner({ onCalibrate, onHome }) {
  const gaze = useGaze();
  const { status } = gaze;
  // Home has its own status card with the same message and buttons.
  if (onHome && !(gaze.sizeMismatch && gaze.mode === "gaze" && status.key === "tracking")) return null;
  if (gaze.paused) {
    return <div className="banner banner--warn" role="status"><BannerIcon name="pause" /><span className="banner__text">Eye control is paused. Look at <strong>Resume</strong> at the top right to continue.</span></div>;
  }
  switch (status.key) {
    case "needs-model":
      return (
        <div className="banner banner--warn" role="status">
          <BannerIcon name="target" />
          <span className="banner__text">{status.detail}</span>
          <button type="button" className="btn btn--primary" onClick={onCalibrate}>Calibrate now</button>
        </div>
      );
    case "idle":
      return (
        <div className="banner banner--info" role="status">
          <BannerIcon name="info" />
          <span className="banner__text">{status.detail}</span>
          <button type="button" className="btn btn--primary" onClick={gaze.start}>Start eye control</button>
        </div>
      );
    case "error":
      return (
        <div className="banner banner--danger" role="alert">
          <BannerIcon name="alert" />
          <span className="banner__text"><strong>Eye tracking is not working.</strong> {status.detail}</span>
          {gaze.retry && <button type="button" className="btn btn--primary" onClick={gaze.retry}>Retry camera</button>}
        </div>
      );
    case "no-face":
    case "no-eyes":
      return <div className="banner banner--warn" role="status"><BannerIcon name="alert" /><span className="banner__text">{status.detail}</span></div>;
    default:
      return gaze.sizeMismatch && gaze.mode === "gaze" ? (
        <div className="banner banner--warn" role="status">
          <BannerIcon name="monitor" />
          <span className="banner__text">The window size changed since calibration ({gaze.calibratedViewport.width}×{gaze.calibratedViewport.height}). Return to that size or full screen, or recalibrate, otherwise selections may land off target.</span>
        </div>
      ) : null;
  }
}

function BannerIcon({ name }) {
  return <span className="banner__icon" aria-hidden="true"><Icon name={name} size={20} /></span>;
}
