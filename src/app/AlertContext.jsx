import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import GazeButton from "../components/GazeButton.jsx";
import { useSpeak } from "./useSpeak.js";

const AlertContext = createContext(null);

/**
 * Local "I need help" alarm (from V1): beeps, speaks, and fills the screen
 * so people nearby notice. Nobody outside the room is contacted. The user
 * can stop it with their eyes (V1 needed a helper's mouse or Esc).
 */
export function AlertProvider({ children }) {
  const [on, setOn] = useState(false);
  const speakText = useSpeak();
  const audioRef = useRef(null);

  const stopSound = useCallback(() => {
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio) {
      clearInterval(audio.timer);
      audio.context.close().catch(() => {});
    }
  }, []);

  const raise = useCallback(() => {
    setOn(true);
    speakText("I need help");
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContextClass();
      const beep = () => {
        [0, 0.35].forEach((offset) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.frequency.value = 880;
          gain.gain.value = 0.18;
          oscillator.connect(gain).connect(context.destination);
          oscillator.start(context.currentTime + offset);
          oscillator.stop(context.currentTime + offset + 0.2);
        });
      };
      beep();
      stopSound();
      audioRef.current = { context, timer: setInterval(beep, 2500) };
    } catch {
      // Sound is optional; the full-screen alert always shows.
    }
  }, [speakText, stopSound]);

  const dismiss = useCallback(() => {
    setOn(false);
    stopSound();
  }, [stopSound]);

  useEffect(() => {
    if (!on) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [on, dismiss]);
  useEffect(() => stopSound, [stopSound]);

  const value = useMemo(() => ({ raise }), [raise]);
  return (
    <AlertContext.Provider value={value}>
      {children}
      {on && (
        <div className="alert-v2" role="alert" data-gaze-modal>
          <p className="alert-v2__title">I need help</p>
          <p className="alert-v2__note">This alarm only plays on this device. No one outside the room has been contacted.</p>
          <GazeButton variant="primary" className="alert-v2__stop" icon="close" label="Stop alert" onClick={dismiss} />
        </div>
      )}
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const context = useContext(AlertContext);
  if (!context) throw new Error("useAlert must be used inside AlertProvider");
  return context;
}
