// Minimal hash router: #/keyboard, #/music, ... The browser Back button and
// a page reload keep the current section. No dependency needed for 10 routes.

import { useCallback, useEffect, useState } from "react";

// keyboard, phrases, needs and symbols are ways of talking: they open the
// Talk page with that method chosen (part: "communicate"), so they have no
// rail item of their own but their addresses keep working. Talk itself
// (#/communicate) opens on typing. `purpose` is the one line shown under a
// page title; Home has none, so its top bar is unchanged.
export const SECTIONS = Object.freeze([
  { id: "home", label: "Home", icon: "home", short: "Home" },
  { id: "communicate", label: "Talk", icon: "chat", short: "Talk", purpose: "Type or choose words, then speak them." },
  { id: "keyboard", label: "Typing keyboard", icon: "keyboard", short: "Type", part: "communicate" },
  { id: "phrases", label: "Quick phrases", icon: "chat", short: "Phrases", part: "communicate" },
  { id: "needs", label: "Quick needs", icon: "heart", short: "Needs", part: "communicate" },
  { id: "symbols", label: "Symbols", icon: "smile", short: "Symbols", part: "communicate" },
  { id: "calls", label: "Calls", icon: "phone", short: "Calls", purpose: "Call family and carers." },
  { id: "music", label: "Music", icon: "music", short: "Music", purpose: "Play your own songs." },
  { id: "news", label: "News", icon: "news", short: "News", purpose: "Today's headlines in English and Tamil." },
  { id: "settings", label: "Settings", icon: "settings", short: "Settings", purpose: "How the app looks, speaks and follows your eyes." },
]);

const IDS = new Set(SECTIONS.map((section) => section.id));

/** The section a route belongs to in the rail: "needs" belongs to Talk. */
export function railSection(id) {
  return SECTIONS.find((section) => section.id === id)?.part || id;
}

export function parseHash(hash) {
  const id = String(hash || "").replace(/^#\/?/, "").split(/[/?]/)[0];
  return IDS.has(id) ? id : "home";
}

export function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const navigate = useCallback((id) => {
    const next = `#/${id}`;
    if (window.location.hash !== next) window.location.hash = next;
    setRoute(parseHash(next));
  }, []);
  return [route, navigate];
}
