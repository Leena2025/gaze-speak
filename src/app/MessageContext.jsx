import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { appendPhrase, pushHistory } from "./messageEdit.js";
import { readJson, STORAGE_KEYS, writeJson } from "./storage.js";

const MessageContext = createContext(null);

/**
 * The one message the user is composing. Shared by the keyboard, quick
 * needs and symbols, so switching between them never loses text. It is
 * saved in this browser, and every change can be undone.
 */
export function MessageProvider({ children }) {
  const [state, setState] = useState(() => ({
    text: String(readJson(STORAGE_KEYS.message, "") || ""),
    history: [],
  }));

  useEffect(() => {
    writeJson(STORAGE_KEYS.message, state.text);
  }, [state.text]);

  /** edit: (text) => newText */
  const edit = useCallback((change) => {
    setState((previous) => {
      const next = typeof change === "function" ? change(previous.text) : change;
      if (next === previous.text) return previous;
      return { text: next, history: pushHistory(previous.history, previous.text) };
    });
  }, []);

  const undo = useCallback(() => {
    setState((previous) => {
      if (!previous.history.length) return previous;
      return { text: previous.history[previous.history.length - 1], history: previous.history.slice(0, -1) };
    });
  }, []);

  const value = useMemo(() => ({
    text: state.text,
    canUndo: state.history.length > 0,
    edit,
    undo,
    clear: () => edit(""),
    addPhrase: (phrase) => edit((text) => appendPhrase(text, phrase)),
  }), [state, edit, undo]);

  return <MessageContext.Provider value={value}>{children}</MessageContext.Provider>;
}

export function useMessage() {
  const context = useContext(MessageContext);
  if (!context) throw new Error("useMessage must be used inside MessageProvider");
  return context;
}
