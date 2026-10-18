import { useEffect, useMemo, useState } from "react";

import GazeButton from "../../components/GazeButton.jsx";
import { useMessage } from "../../app/MessageContext.jsx";
import { useNotice } from "../../app/NoticeContext.jsx";
import { useSettings } from "../../app/SettingsContext.jsx";
import { useUserContent } from "../../app/UserContentContext.jsx";
import { addPunctuation, atSentenceStart, casedLetter, deleteLastChar, deleteLastWord } from "../../app/messageEdit.js";
import { KEY_ROWS, nextShift, PUNCTUATION, TILE_GROUPS } from "./layouts.js";
import { applySuggestion, createPredictor } from "./predictor.js";

const SUGGESTION_SLOTS = 5;
let predictorPromise = null;
function loadPredictor() {
  // The word list (about 110 kB) loads only when the keyboard is first opened.
  predictorPromise ??= import("./wordlist.js").then((module) => createPredictor(module.default));
  return predictorPromise;
}

/**
 * The typing keyboard on the Talk page (Type message): word suggestions and
 * keys that edit the shared message. The message bar above it belongs to
 * the Talk page, which also adds Save phrase while this is open.
 */
export default function KeyboardPanel({ modelDoc }) {
  const { settings } = useSettings();
  const message = useMessage();
  const notify = useNotice();
  const content = useUserContent();
  const [predictor, setPredictor] = useState(null);
  const [page, setPage] = useState("letters"); // letters | symbols
  const [shift, setShift] = useState("off");
  const [groupIndex, setGroupIndex] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadPredictor().then((loaded) => {
      if (!cancelled) setPredictor(loaded);
    }).catch(() => {
      if (!cancelled) notify("Word suggestions could not be loaded. Typing still works.", "warn");
    });
    return () => {
      cancelled = true;
    };
  }, [notify]);

  const tiles = settings.keyMode === "tiles" ||
    (settings.keyMode === "auto" && settings.inputMode === "gaze" && modelDoc?.recommendedMode === "grouped");
  const text = message.text;
  const upper = shift !== "off" || (settings.autoCapitalize && atSentenceStart(text));

  const suggestions = useMemo(
    () => (predictor ? predictor.suggest(text, content.userWords, SUGGESTION_SLOTS) : []),
    [predictor, text, content.userWords],
  );

  const typeChar = (char) => {
    if (PUNCTUATION.has(char)) {
      message.edit((value) => addPunctuation(value, char));
    } else if (/[a-z]/i.test(char)) {
      message.edit((value) => value + casedLetter(char, { shift: shift === "once", capsLock: shift === "lock", autoCapitalize: settings.autoCapitalize, text: value }));
      if (shift === "once") setShift("off");
    } else {
      message.edit((value) => value + char);
    }
    setGroupIndex(null);
  };

  const space = () => message.edit((value) => (value === "" || value.endsWith(" ") ? value : `${value} `));

  const shiftLabel = shift === "lock" ? "CAPS" : shift === "once" ? "Shift on" : "Shift";
  const showChar = (char) => (upper && /[a-z]/.test(char) ? char.toUpperCase() : char);

  // Large two-step tiles replace the letter rows; numbers and symbols always use rows.
  const keyRows = tiles && page === "letters"
    ? null
    : KEY_ROWS[page === "symbols" ? "symbols" : settings.keyboardLayout].map((row) => [...row]);

  return (
    <div className="keyboard">
      <div className="suggestions" role="group" aria-label="Word suggestions">
        {Array.from({ length: SUGGESTION_SLOTS }, (_, index) => {
          const word = suggestions[index];
          return word ? (
            <GazeButton key={index} className="suggestions__item" label={word} onClick={() => message.edit((value) => applySuggestion(value, word))} />
          ) : (
            <span key={index} className="suggestions__empty" aria-hidden="true">{index === 0 && !predictor ? "Loading suggestions…" : ""}</span>
          );
        })}
      </div>

      <div className={`keys${tiles && page === "letters" ? " keys--tiles" : ""}`} role="group" aria-label="Keyboard">
        {keyRows && keyRows.map((row, rowIndex) => (
          <div className="keys__row" key={rowIndex}>
            {row.map((char) => (
              <GazeButton key={char} className="key-v2" label={showChar(char)} aria-label={char === " " ? "space" : showChar(char)} onClick={() => typeChar(char)} />
            ))}
          </div>
        ))}

        {!keyRows && groupIndex === null && (
          <div className="keys__tiles">
            {TILE_GROUPS.map((group, index) => (
              <GazeButton key={group} className="key-v2 key-v2--tile" label={[...group].map(showChar).join(" ")} aria-label={`Letters ${group}`} onClick={() => setGroupIndex(index)} />
            ))}
          </div>
        )}
        {!keyRows && groupIndex !== null && (
          <div className="keys__tiles">
            {[...TILE_GROUPS[groupIndex]].map((char) => (
              <GazeButton key={char} className="key-v2 key-v2--tile" label={showChar(char)} onClick={() => typeChar(char)} />
            ))}
            <GazeButton className="key-v2 key-v2--tile key-v2--action" icon="back" label="Back" onClick={() => setGroupIndex(null)} />
          </div>
        )}

        <div className="keys__row keys__row--actions">
          <GazeButton
            className={`key-v2 key-v2--action${shift !== "off" ? " key-v2--on" : ""}`}
            icon="up"
            label={shiftLabel}
            aria-pressed={shift !== "off"}
            disabled={page === "symbols"}
            onClick={() => setShift(nextShift(shift))}
          />
          <GazeButton
            className="key-v2 key-v2--action"
            label={page === "symbols" ? "ABC" : "123 ?!"}
            onClick={() => {
              setPage(page === "symbols" ? "letters" : "symbols");
              setGroupIndex(null);
            }}
          />
          <GazeButton className="key-v2 key-v2--action key-v2--space" icon="space" label="Space" onClick={space} />
          <GazeButton className="key-v2 key-v2--action" icon="backspace" label="Letter" aria-label="Delete letter" disabled={!text} onClick={() => message.edit(deleteLastChar)} />
          <GazeButton className="key-v2 key-v2--action" icon="backspace" label="Word" aria-label="Delete word" disabled={!text} onClick={() => message.edit(deleteLastWord)} />
        </div>
      </div>
    </div>
  );
}
