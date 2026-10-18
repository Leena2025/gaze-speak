import GazeButton from "./GazeButton.jsx";

const ROWS = ["abcdefg", "hijklmn", "opqrstu", "vwxyz"];

/**
 * A small gaze keyboard for search boxes (music, news). It opens as a
 * dialog so only its keys are selectable while it is shown.
 */
export default function SearchKeyboard({ title, value, onChange, onClose, resultCount }) {
  return (
    <div className="modal" data-gaze-modal role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal__panel modal__panel--wide search-kb">
        <div className="search-kb__head">
          <h2 className="modal__title">{title}</h2>
          <p className="search-kb__value" aria-live="polite">{value || <span className="muted">Look at letters to search</span>}</p>
          <p className="muted">{resultCount} {resultCount === 1 ? "match" : "matches"}</p>
        </div>
        <div className="search-kb__keys">
          {ROWS.map((row) => (
            <div className="search-kb__row" key={row}>
              {[...row].map((char) => (
                <GazeButton key={char} className="key-v2 key-v2--small" label={char.toUpperCase()} onClick={() => onChange(value + char)} />
              ))}
            </div>
          ))}
          <div className="search-kb__row">
            <GazeButton className="key-v2 key-v2--small key-v2--action" icon="space" label="Space" onClick={() => onChange(value.endsWith(" ") || !value ? value : `${value} `)} />
            <GazeButton className="key-v2 key-v2--small key-v2--action" icon="backspace" label="Delete" disabled={!value} onClick={() => onChange(value.slice(0, -1))} />
            <GazeButton className="key-v2 key-v2--small key-v2--action" icon="trash" label="Clear" disabled={!value} onClick={() => onChange("")} />
            <GazeButton className="key-v2 key-v2--small key-v2--action" variant="primary" icon="check" label="Show results" onClick={onClose} />
          </div>
        </div>
      </div>
    </div>
  );
}
