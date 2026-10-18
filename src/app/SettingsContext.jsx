import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { normalizeSettings } from "./settingsModel.js";
import { readJson, STORAGE_KEYS, writeJson } from "./storage.js";

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => normalizeSettings(readJson(STORAGE_KEYS.settings, {})));

  useEffect(() => {
    writeJson(STORAGE_KEYS.settings, settings);
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.textSize = settings.textSize;
    root.lang = settings.language === "ta" ? "ta" : "en";
  }, [settings]);

  const update = useCallback((patch) => {
    setSettings((previous) => normalizeSettings({ ...previous, ...patch }));
  }, []);

  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used inside SettingsProvider");
  return context;
}
