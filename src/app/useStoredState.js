import { useEffect, useState } from "react";

import { readJson, writeJson } from "./storage.js";

/**
 * useState that is saved in this browser under `key`. `normalize` checks the
 * stored value (it may be from an older version or damaged).
 * Each key should be owned by one component tree at a time.
 */
export function useStoredState(key, initial, normalize = (value) => value) {
  const [value, setValue] = useState(() => {
    try {
      return normalize(readJson(key, initial));
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    writeJson(key, value);
  }, [key, value]);
  return [value, setValue];
}

export const asArray = (value) => (Array.isArray(value) ? value : []);
