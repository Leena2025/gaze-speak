import { useEffect, useRef } from "react";

import { useMessage } from "../app/MessageContext.jsx";
import { useSpeak } from "../app/useSpeak.js";
import GazeButton from "./GazeButton.jsx";

/**
 * The current message, large enough to read from a distance, with the
 * actions every communication screen shares. `extra` adds screen-specific
 * actions (Save phrase on the keyboard).
 *
 * labels: optional button text for pages in another language, as
 *   { speak, undo, clear, region }; each a string or { label, sublabel }.
 * speakLanguage: passed to useSpeak; "auto" reads English and Tamil parts
 *   with their own voices. Default: the app's language.
 */
const DEFAULT_LABELS = { speak: "Speak", undo: "Undo", clear: "Clear", region: "Current message" };

function asButtonText(value) {
  return typeof value === "string" ? { label: value } : value;
}

export default function MessageBar({ placeholder = "Your message appears here", extra = null, size = "large", onSpoken, labels, speakLanguage }) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const message = useMessage();
  const speakText = useSpeak();
  const textRef = useRef(null);

  useEffect(() => {
    const element = textRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [message.text]);

  const speakMessage = async () => {
    const result = await speakText(message.text, speakLanguage);
    if (result.ok) onSpoken?.(message.text);
  };

  return (
    <section className={`message-bar message-bar--${size}`} aria-label={text.region}>
      <div className="message-bar__text" ref={textRef} aria-live="polite">
        {message.text
          ? <span>{message.text}</span>
          : <span className="message-bar__placeholder">{placeholder}</span>}
        <span className="message-bar__caret" aria-hidden="true" />
      </div>
      <div className="message-bar__actions">
        <GazeButton variant="primary" icon="speaker" {...asButtonText(text.speak)} dwell={1.1} disabled={!message.text.trim()} onClick={speakMessage} />
        {extra}
        <GazeButton icon="undo" {...asButtonText(text.undo)} disabled={!message.canUndo} onClick={message.undo} />
        <GazeButton variant="danger-quiet" icon="trash" {...asButtonText(text.clear)} dwell={1.6} disabled={!message.text} onClick={message.clear} />
      </div>
    </section>
  );
}
