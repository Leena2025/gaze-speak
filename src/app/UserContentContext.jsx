import { createContext, useCallback, useContext, useMemo } from "react";

import { makeId, STORAGE_KEYS } from "./storage.js";
import { asArray, useStoredState } from "./useStoredState.js";
import { learnFromText } from "../features/keyboard/predictor.js";

const UserContentContext = createContext(null);

const validPhrase = (item) => item && typeof item.text === "string" && item.text.trim() && typeof item.id === "string";
const validSymbol = (item) => validPhrase({ id: item?.id, text: item?.phrase }) && typeof item.label === "string" && typeof item.emoji === "string";
const validContact = (item) => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.phone === "string";

/**
 * Everything the user or a helper adds: saved phrases, own symbols,
 * contacts, and the words learned for suggestions. Kept in this browser.
 */
export function UserContentProvider({ children }) {
  const [phrases, setPhrases] = useStoredState(STORAGE_KEYS.savedPhrases, [], (value) => asArray(value).filter(validPhrase));
  const [symbols, setSymbols] = useStoredState(STORAGE_KEYS.customSymbols, [], (value) => asArray(value).filter(validSymbol));
  const [contacts, setContacts] = useStoredState(STORAGE_KEYS.contacts, [], (value) => asArray(value).filter(validContact));
  const [userWords, setUserWords] = useStoredState(STORAGE_KEYS.userWords, { words: {}, pairs: {}, display: {} }, (value) => (value && typeof value === "object" ? value : { words: {}, pairs: {}, display: {} }));

  const addPhrase = useCallback((text) => {
    const clean = text.trim();
    if (!clean || phrases.some((item) => item.text.toLowerCase() === clean.toLowerCase())) return false;
    setPhrases((list) => [{ id: makeId("p"), text: clean, createdAt: new Date().toISOString() }, ...list].slice(0, 100));
    return true;
  }, [phrases, setPhrases]);

  const learn = useCallback((text) => setUserWords((data) => learnFromText(data, text)), [setUserWords]);

  const value = useMemo(() => ({
    phrases,
    addPhrase,
    removePhrase: (id) => setPhrases((list) => list.filter((item) => item.id !== id)),
    symbols,
    addSymbol: ({ emoji, label, phrase }) => setSymbols((list) => [...list, { id: makeId("s"), emoji: emoji.trim() || "⭐", label: label.trim(), phrase: phrase.trim() }]),
    removeSymbol: (id) => setSymbols((list) => list.filter((item) => item.id !== id)),
    contacts,
    saveContact: (contact) => setContacts((list) => {
      const exists = list.some((item) => item.id === contact.id);
      const clean = { ...contact, id: contact.id || makeId("c") };
      return exists ? list.map((item) => (item.id === clean.id ? { ...item, ...clean } : item)) : [...list, { calls: 0, ...clean }];
    }),
    removeContact: (id) => setContacts((list) => list.filter((item) => item.id !== id)),
    countCall: (id) => setContacts((list) => list.map((item) => (item.id === id ? { ...item, calls: (item.calls || 0) + 1, lastCalledAt: new Date().toISOString() } : item))),
    userWords,
    learn,
    forgetWords: () => setUserWords({ words: {}, pairs: {}, display: {} }),
  }), [phrases, addPhrase, setPhrases, symbols, setSymbols, contacts, setContacts, userWords, learn, setUserWords]);

  return <UserContentContext.Provider value={value}>{children}</UserContentContext.Provider>;
}

export function useUserContent() {
  const context = useContext(UserContentContext);
  if (!context) throw new Error("useUserContent must be used inside UserContentProvider");
  return context;
}
