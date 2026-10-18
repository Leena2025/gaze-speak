import { useState } from "react";

import { viewportChanged } from "../gaze/layout.js";
import { requestFullscreen, useViewport } from "../hooks/useViewport.js";

const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || navigator.userAgent);

/** Full-screen and camera guidance shown before calibration and the accuracy test. */
export default function ScreenCheck({ purpose, modelDoc, onContinue, onBack }) {
  const viewport = useViewport();
  const [error, setError] = useState("");
  const calibrated = modelDoc?.calibration?.viewport;
  const mismatch = purpose === "demo" && calibrated && viewportChanged(viewport, calibrated);

  const enter = async () => {
    setError("");
    try {
      await requestFullscreen();
    } catch (fullscreenError) {
      setError(fullscreenError?.message || "The browser blocked full screen. Use the keyboard shortcut instead.");
    }
  };

  return (
    <main className="page">
      <div className="page__inner page__inner--narrow">
        <h1 className="page__title">{purpose === "calibration" ? "Before calibrating" : "Before the accuracy test"}</h1>

        <section className="card">
          <h2 className="card__title">
            Full screen{" "}
            {viewport.fullscreen
              ? <span className="pill pill--success">On</span>
              : <span className="pill pill--warn">Off</span>}
          </h2>
          <p>
            For the best results, use full-screen mode. The app then uses the whole display, and the
            screen area stays the same between calibration and use, so the model's coordinates
            line up with the keys.
          </p>
          <ul className="list">
            <li>
              Press the button below, or press <kbd>F11</kbd>
              {isMac && <> (on a Mac: <kbd>Ctrl</kbd> + <kbd>⌘</kbd> + <kbd>F</kbd>)</>}. Some browsers and
              keyboards need <kbd>Fn</kbd> + <kbd>F11</kbd>.
            </li>
            <li>To leave full screen, press <kbd>Esc</kbd> or <kbd>F11</kbd> again.</li>
            <li>
              If full screen is not available, maximize the window and keep it the same size from
              calibration to use. The app warns you if the size changes.
            </li>
          </ul>
          {!viewport.fullscreen && (
            <button type="button" className="btn btn--accent" onClick={enter}>Enter full screen</button>
          )}
          {error && <p className="notice notice--warn" role="status">{error}</p>}
          <p className="muted small">Current screen area: {viewport.width} × {viewport.height} px</p>
        </section>

        <section className="card">
          <h2 className="card__title">Camera and posture</h2>
          <ul className="list">
            <li>Sit about an arm's length from the screen with your face centered in the camera.</li>
            <li>Light your face from the front; avoid a bright window behind you and reflections on glasses.</li>
            <li>Keep your head in a comfortable, steady position. Move your eyes, not your head.</li>
            <li>Recalibrate if you move the laptop, change seats or the lighting changes a lot.</li>
          </ul>
        </section>

        {mismatch && (
          <p className="notice notice--warn" role="status">
            This model was calibrated at {calibrated.width} × {calibrated.height} px, but the screen area is now{" "}
            {viewport.width} × {viewport.height} px. {calibrated.fullscreen && !viewport.fullscreen ? "Enter full screen again, " : "Restore the original window size, "}
            or recalibrate — otherwise the gaze point will be offset.
          </p>
        )}

        <div className="toolbar-row toolbar-row--end">
          <button type="button" className="btn" onClick={onBack}>Back</button>
          <button type="button" className="btn btn--primary" onClick={onContinue} autoFocus>
            {viewport.fullscreen ? "Continue" : "Continue without full screen"}
          </button>
        </div>
      </div>
    </main>
  );
}
