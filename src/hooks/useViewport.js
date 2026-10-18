import { useEffect, useState } from "react";

import { readViewport } from "../gaze/layout.js";

export function useViewport() {
  const [viewport, setViewport] = useState(() => readViewport());
  useEffect(() => {
    const update = () => setViewport(readViewport());
    window.addEventListener("resize", update);
    document.addEventListener("fullscreenchange", update);
    return () => {
      window.removeEventListener("resize", update);
      document.removeEventListener("fullscreenchange", update);
    };
  }, []);
  return viewport;
}

export async function requestFullscreen() {
  if (!document.documentElement.requestFullscreen) {
    throw new Error("This browser does not allow pages to switch to full screen. Use the keyboard shortcut instead.");
  }
  await document.documentElement.requestFullscreen({ navigationUI: "hide" });
}
