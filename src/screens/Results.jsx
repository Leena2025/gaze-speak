import { useEffect, useMemo, useRef, useState } from "react";

import { downloadModel, downloadText } from "../gaze/modelStore.js";
import { diagnoseCalibration, DIRECT_MODE_MIN_HIT_RATE } from "../gaze/calibrationData.js";
import { calibrationPassed, VERIFY_MIN_HIT_RATE } from "../gaze/calibrationStatus.js";
import { formatMs, formatPercent, formatPx } from "../ui/format.js";

const CSV_PREVIEW_ROWS = 200;

export default function Results({ result, hasActiveModel, onInstall, onStartDemo, onRecalibrate, onHome }) {
  const { doc, metrics, recommendedMode, timings } = result;
  const validation = metrics.validation;
  const viewport = doc.calibration.viewport;
  const [installState, setInstallState] = useState({ installed: false, error: "" });
  const [showCsv, setShowCsv] = useState(false);
  // Whether a working model existed before this calibration (fixed at mount).
  const [hadModel] = useState(hasActiveModel);
  const autoInstalled = useRef(false);

  const install = async () => {
    try {
      await onInstall(doc);
      setInstallState({ installed: true, error: "" });
    } catch (error) {
      setInstallState({ installed: false, error: error?.message || String(error) });
    }
  };

  // The check: measured on held-out points the model never trained on.
  const passed = calibrationPassed(validation);

  // Install a calibration that passed its check right away. Waiting for a
  // button press left an older model in use whenever the person left this
  // page without pressing it. The older model is kept as a backup in
  // Settings, Gaze model. A calibration that failed its check is never
  // installed, so it cannot replace a working model.
  useEffect(() => {
    if (autoInstalled.current || !passed) return;
    autoInstalled.current = true;
    onInstall(doc)
      .then(() => setInstallState({ installed: true, error: "" }))
      .catch((error) => setInstallState({ installed: false, error: error?.message || String(error) }));
  }, [onInstall, doc, passed]);

  const diagnosis = diagnoseCalibration(metrics, viewport, passed);
  const quality = validation.directKeyHitRate >= 0.85 ? "good" : validation.directKeyHitRate >= DIRECT_MODE_MIN_HIT_RATE ? "fair" : "limited";
  const csvRows = useMemo(() => result.csv.split("\n").map((line) => line.split(",")), [result.csv]);

  return (
    <main className="page">
      <div className="page__inner">
        <h1 className="page__title">Calibration results</h1>

        <p className={`notice notice--${passed ? "success" : "danger"}`} role="status">
          {passed
            ? `Check passed: ${formatPercent(validation.groupedKeyHitRate)} of check-point frames landed on the right large tile (${formatPercent(VERIFY_MIN_HIT_RATE)} needed). Eye control is ready.`
            : `Check not passed: only ${formatPercent(validation.groupedKeyHitRate)} of check-point frames landed on the right large tile (${formatPercent(VERIFY_MIN_HIT_RATE)} needed). This calibration was not installed${hadModel ? "; your previous model is still in use" : ""}.`}
        </p>
        {diagnosis.text && (
          <p className="notice notice--warn results__diagnosis" role="status">
            <strong>Most likely cause: </strong>{diagnosis.text}
          </p>
        )}

        <section className="card">
          <h2 className="card__title">
            Accuracy at new screen positions{" "}
            <span className={`pill pill--${quality === "good" ? "success" : quality === "fair" ? "warn" : "danger"}`}>{quality}</span>
          </h2>
          <p>
            Measured on the {doc.calibration.validationTargets} check points, which the evaluation model never saw
            during training ({validation.count} camera frames). Errors are per frame, before smoothing, at your
            screen size of {viewport.width}×{viewport.height} px.
          </p>
          <div className="metric-grid">
            <Metric label="Mean error" value={formatPx(validation.meanErrorPx)} hint={`${validation.meanErrorPercentOfDiagonal.toFixed(1)}% of the screen diagonal`} />
            <Metric label="Median error" value={formatPx(validation.medianErrorPx)} hint={`90% of frames within ${formatPx(validation.p90ErrorPx)}`} />
            <Metric label="Horizontal / vertical MAE" value={`${formatPx(validation.maeXPx)} / ${formatPx(validation.maeYPx)}`} hint={`RMSE ${formatPx(validation.rmsePx)}`} />
            <Metric label="Frames on the right key" value={`${formatPercent(validation.directKeyHitRate)} / ${formatPercent(validation.groupedKeyHitRate)}`} hint="all-keys layout / large-tile layout" />
          </div>
          <CheckPointMap perTarget={validation.perTarget} viewport={viewport} />
          <p className="notice notice--info">
            {recommendedMode === "direct"
              ? "Accuracy is good enough for the full keyboard. The typing keyboard starts with all keys visible."
              : "At this accuracy, small keys would often be missed, so the typing keyboard starts with large tiles (two steps per letter). You can change this in Settings."}
          </p>
        </section>

        <section className="card">
          <h2 className="card__title">Details</h2>
          <dl className="facts facts--columns">
            <div><dt>Error on training points (in-sample)</dt><dd>{formatPx(metrics.trainErrorPx)}</dd></div>
            <div><dt>Leave-one-point-out cross-validation</dt><dd>{formatPx(metrics.crossValidationErrorPx)}</dd></div>
            <div><dt>Held-out check points</dt><dd>{formatPx(validation.meanErrorPx)}</dd></div>
            <div><dt>Model</dt><dd>Ridge regression, {doc.selection.basis} features, λ = {doc.selection.lambda}</dd></div>
            <div><dt>Samples</dt><dd>{doc.calibration.trainSamples} training · {doc.calibration.validationSamples} check</dd></div>
            <div><dt>Calibration time</dt><dd>{formatMs(timings.calibrationMs - timings.pausedMs)} active{timings.pausedMs > 0 ? ` (+${formatMs(timings.pausedMs)} paused)` : ""}</dd></div>
            <div><dt>Training + validation time</dt><dd>{formatMs(timings.trainingMs)}</dd></div>
          </dl>
          {metrics.quality && (
            <dl className="facts facts--columns">
              <div><dt>Camera frames thrown out</dt><dd>{formatPercent(metrics.quality.rejectedShare)} (blinks, glances away)</dd></div>
              <div><dt>Frames without a face</dt><dd>{formatPercent(metrics.quality.lostShare)}</dd></div>
              <div><dt>Points repeated</dt><dd>{metrics.quality.retries}</dd></div>
              <div><dt>Points still unsteady</dt><dd>{metrics.quality.lowQualityPoints ? metrics.quality.lowQualityPointIds.join(", ") : "none"}</dd></div>
            </dl>
          )}
          <p className="muted small">
            The model that is installed is exactly the one measured above: it was fitted on the{" "}
            {doc.calibration.trainTargets} learning points only, and the {doc.calibration.validationTargets} check
            points were kept apart to test it. Real use also depends on keeping the same posture, lighting and screen size.
          </p>
          <details>
            <summary>Error per check point</summary>
            <table className="table">
              <thead><tr><th>Point</th><th>Position</th><th>Frames</th><th>Mean error</th><th>Systematic offset</th></tr></thead>
              <tbody>
                {validation.perTarget.map((row) => (
                  <tr key={row.group}>
                    <td>{row.group}</td>
                    <td>{Math.round(row.target.x * 100)}%, {Math.round(row.target.y * 100)}%</td>
                    <td>{row.count}</td>
                    <td>{formatPx(row.meanErrorPx)}</td>
                    <td>{formatPx(row.biasPx)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>

        {installState.error && <p className="notice notice--danger" role="alert">Could not install the model: {installState.error}</p>}
        {installState.installed && <p className="notice notice--success" role="status">The new model is installed in this browser and will be used for eye control.{hadModel ? " The previous model is kept as a backup in Settings, Gaze model." : ""}</p>}

        <div className="toolbar-row">
          {passed && !installState.installed && <button type="button" className="btn btn--primary" onClick={install}>Use this model</button>}
          {installState.installed && passed && <button type="button" className="btn btn--primary" onClick={onStartDemo}>Start using eye control</button>}
          {!passed && <button type="button" className="btn btn--primary" onClick={onRecalibrate}>Calibrate again</button>}
          <button type="button" className="btn" onClick={() => setShowCsv(true)}>View validation CSV</button>
          <button type="button" className="btn" onClick={() => downloadText(result.csv, "igaze-validation.csv", "text/csv;charset=utf-8")}>Download CSV</button>
          <button type="button" className="btn" onClick={() => downloadModel(doc)}>Download model</button>
          {passed && <button type="button" className="btn" onClick={onRecalibrate}>Recalibrate</button>}
          <button type="button" className="btn" onClick={onHome}>{installState.installed ? "Back to the app" : passed ? "Discard and go back" : "Go back"}</button>
        </div>
      </div>

      {showCsv && (
        <div className="overlay overlay--dim" role="dialog" aria-modal="true" aria-label="Validation CSV">
          <div className="dialog dialog--wide">
            <h2 className="dialog__title">Validation CSV</h2>
            <p className="muted small">
              split = validation: held-out check-point frames; split = train: in-sample frames. Coordinates are normalized
              (0–1) and in pixels; error_* = prediction − target. Showing {Math.min(CSV_PREVIEW_ROWS, csvRows.length - 1)} of {csvRows.length - 1} rows.
            </p>
            <div className="table-scroll">
              <table className="table table--compact">
                <thead><tr>{csvRows[0].map((cell) => <th key={cell}>{cell}</th>)}</tr></thead>
                <tbody>
                  {csvRows.slice(1, CSV_PREVIEW_ROWS + 1).map((row, rowIndex) => (
                    <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="toolbar-row toolbar-row--end">
              <button type="button" className="btn" onClick={() => downloadText(result.csv, "igaze-validation.csv", "text/csv;charset=utf-8")}>Download CSV</button>
              <button type="button" className="btn btn--primary" onClick={() => setShowCsv(false)} autoFocus>Close</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Metric({ label, value, hint }) {
  return (
    <div className="metric">
      <div className="metric__label">{label}</div>
      <div className="metric__value">{value}</div>
      {hint && <div className="metric__hint">{hint}</div>}
    </div>
  );
}

/**
 * Where each check point was (circle) and where the model's gaze landed on
 * average (cross), drawn to the screen's shape. A whole set of arrows pointing
 * the same way means a shift (usually head movement); arrows in all
 * directions mean unsteady tracking.
 */
function CheckPointMap({ perTarget, viewport }) {
  const width = 320;
  const height = Math.round((width * viewport.height) / viewport.width);
  const clamp = (value) => Math.min(1.05, Math.max(-0.05, value));
  return (
    <figure className="checkmap">
      <svg viewBox={`-12 -12 ${width + 24} ${height + 24}`} role="img" aria-label="Check points: where you looked and where the gaze landed">
        <rect className="checkmap__screen" x="0" y="0" width={width} height={height} rx="6" />
        {perTarget.map((row) => {
          const tx = row.target.x * width;
          const ty = row.target.y * height;
          const px = clamp(row.meanPrediction.x) * width;
          const py = clamp(row.meanPrediction.y) * height;
          return (
            <g key={row.group}>
              <line className="checkmap__line" x1={tx} y1={ty} x2={px} y2={py} />
              <circle className="checkmap__target" cx={tx} cy={ty} r="6" />
              <path className="checkmap__guess" d={`M${px - 5} ${py - 5}L${px + 5} ${py + 5}M${px + 5} ${py - 5}L${px - 5} ${py + 5}`} />
            </g>
          );
        })}
      </svg>
      <figcaption className="muted small">Circles: where each check dot was. Crosses: where the gaze landed on average.</figcaption>
    </figure>
  );
}
