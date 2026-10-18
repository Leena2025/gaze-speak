import { useCallback } from "react";

import { useNotice } from "./NoticeContext.jsx";
import { useSettings } from "./SettingsContext.jsx";
import { speak, speakMixed } from "./speech.js";

/**
 * Speaks with the user's voice, language and rate; failures become a visible
 * notice. Language "auto" reads each English or Tamil part with its own voice
 * (for messages that mix both, as on the Symbols page).
 */
export function useSpeak() {
  const { settings } = useSettings();
  const notify = useNotice();
  return useCallback((text, language = settings.language) => {
    const spoken = language === "auto"
      ? speakMixed(text, { voices: { en: settings.voiceEn, ta: settings.voiceTa }, rate: settings.speechRate, fallbackLanguage: settings.language })
      : speak(text, { language, voiceURI: language === "ta" ? settings.voiceTa : settings.voiceEn, rate: settings.speechRate });
    return spoken.then((result) => {
      if (!result.ok) notify(result.message, "danger", 6000);
      else if (result.warning) notify(result.warning, "warn", 6000);
      return result;
    });
  }, [settings.language, settings.voiceTa, settings.voiceEn, settings.speechRate, notify]);
}
