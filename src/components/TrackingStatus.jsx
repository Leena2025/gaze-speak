import { useGaze } from "../gaze/GazeProvider.jsx";
import GazeButton from "./GazeButton.jsx";

/** Status pill + pause/resume control shown in the top bar of every section. */
export default function TrackingStatus({ compact = false, showPill = true }) {
  const gaze = useGaze();
  const { status } = gaze;
  const tone = gaze.paused ? "warn" : status.tone;
  const label = gaze.paused ? "Eye control paused" : status.label;
  const dwellCapable = status.key === "tracking" || status.key === "pointer" || status.key === "no-face" || status.key === "no-eyes";

  return (
    <div className="tracking">
      {showPill && (
        <span className={`status-pill status-pill--${tone}${status.key === "loading" ? " status-pill--loading" : ""}`} role="status" title={gaze.paused ? "Look at Resume to continue." : status.detail}>
          <span className="status-pill__dot" aria-hidden="true" />
          {label}
        </span>
      )}
      {dwellCapable && (
        <GazeButton
          className="tracking__pause"
          variant={gaze.paused ? "primary" : "quiet"}
          icon={gaze.paused ? "eye" : "eyeOff"}
          label={gaze.paused ? "Resume" : compact ? "Pause" : "Pause eyes"}
          dwell={gaze.paused ? 1.5 : 1.3}
          always
          aria-pressed={gaze.paused}
          onClick={() => gaze.setPaused(!gaze.paused)}
        />
      )}
    </div>
  );
}
