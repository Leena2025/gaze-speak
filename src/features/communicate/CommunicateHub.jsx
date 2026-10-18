import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import GazeButton from "../../components/GazeButton.jsx";
import MessageBar from "../../components/MessageBar.jsx";
import { useAlert } from "../../app/AlertContext.jsx";
import { useMessage } from "../../app/MessageContext.jsx";
import { useNotice } from "../../app/NoticeContext.jsx";
import { useSettings } from "../../app/SettingsContext.jsx";
import { useUserContent } from "../../app/UserContentContext.jsx";
import { buttonText, displayMode, TALK_UI, textIn } from "../../content/i18n.js";
import { MY_PHRASES_ID } from "../../content/phrases.js";
import KeyboardPanel from "../keyboard/KeyboardScreen.jsx";
import PhrasePanel from "../needs/QuickNeeds.jsx";
import SymbolPanel from "../symbols/Symbols.jsx";

/**
 * The ways to talk, typing first. Each has its own address, so links,
 * Home's cards and the browser Back button go straight to it: Talk itself
 * (#/communicate) and the old #/keyboard open typing; #/phrases, #/needs
 * and #/symbols open the others.
 */
export const TALK_METHODS = Object.freeze([
  { id: "type", route: "communicate", aliases: ["keyboard"], icon: "keyboard" },
  { id: "phrases", route: "phrases", icon: "chat" },
  { id: "needs", route: "needs", icon: "heart" },
  { id: "symbols", route: "symbols", icon: "smile" },
]);

/** The method a Talk address opens. */
export function talkMethod(route) {
  return TALK_METHODS.find((item) => item.route === route || item.aliases?.includes(route)) ?? TALK_METHODS[0];
}

const QUICK_PHRASE_GROUPS = ["general", "family", MY_PHRASES_ID];
const NEEDS_GROUPS = ["personal", "health"];

// The three choices look the same in every mode: each language in its own
// script, so a person who reads only one of them can still find theirs.
const LANGUAGE_CHOICES = [
  { id: "en", label: "English" },
  { id: "ta", label: "தமிழ்" },
  { id: "both", label: "Both", sublabel: "English + தமிழ்" },
];

/**
 * The one place to build a message: the message bar stays at the top while
 * the area below switches between quick phrases, needs, symbols and the
 * keyboard. Everything edits the same shared message.
 */
export default function TalkPage({ route, navigate, modelDoc }) {
  const { settings, update } = useSettings();
  const mode = displayMode(settings.symbolLanguage, settings.language);
  const message = useMessage();
  const content = useUserContent();
  const notify = useNotice();
  const alert = useAlert();
  const method = talkMethod(route);
  const ui = (key) => textIn(TALK_UI[key], mode);
  const button = (key) => buttonText(TALK_UI[key], mode);

  // The language choice sits in the top bar, beside the page title, so the
  // cards and keys below keep their height on short laptop screens.
  const [toolsSlot, setToolsSlot] = useState(null);
  useEffect(() => setToolsSlot(document.getElementById("topbar-tools")), []);

  const typing = method.id === "type";
  const savePhrase = () => {
    if (content.addPhrase(message.text)) notify(ui("saved"), "success");
    else notify(message.text.trim() ? ui("alreadySaved") : ui("typeFirst"), "info");
  };

  const languageChoice = (
    <div className="talk-language" role="radiogroup" aria-label={ui("languageGroup")}>
      <span className="talk-language__label" aria-hidden="true">{ui("language")}</span>
      {LANGUAGE_CHOICES.map((choice) => (
        <GazeButton
          key={choice.id}
          role="radio"
          aria-checked={choice.id === mode}
          lang={choice.id === "ta" ? "ta" : "en"}
          className="talk-language__choice"
          label={choice.label}
          sublabel={choice.sublabel}
          onClick={() => update({ symbolLanguage: choice.id })}
        />
      ))}
    </div>
  );

  return (
    <div className={`talk talk--${method.id} talk--${mode}`} lang={mode === "ta" ? "ta" : "en"}>
      {toolsSlot ? createPortal(languageChoice, toolsSlot) : languageChoice}

      <MessageBar
        size="medium"
        placeholder={typing ? ui("placeholderType") : ui("placeholder")}
        speakLanguage="auto"
        onSpoken={typing ? content.learn : undefined}
        labels={{ speak: button("speak"), undo: button("undo"), clear: button("clear"), region: ui("currentMessage") }}
        extra={typing ? <GazeButton icon="save" {...button("savePhrase")} disabled={!message.text.trim()} onClick={savePhrase} /> : null}
      />

      <div className="talk-methods">
        <div className="talk-methods__list" role="tablist" aria-label={ui("methods")}>
          {TALK_METHODS.map((item) => (
            <GazeButton
              key={item.id}
              role="tab"
              aria-selected={item.id === method.id}
              className="talk-methods__item"
              icon={item.icon}
              {...button(item.id)}
              onClick={() => navigate(item.route)}
            />
          ))}
        </div>
        <GazeButton className="talk-methods__help" variant="danger" icon="alert" {...button("help")} dwell={1.6} onClick={alert.raise} />
      </div>

      <div className="talk__panel" role="tabpanel" aria-label={ui(method.id)}>
        {method.id === "phrases" && <PhrasePanel key="phrases" categoryIds={QUICK_PHRASE_GROUPS} mode={mode} />}
        {method.id === "needs" && <PhrasePanel key="needs" categoryIds={NEEDS_GROUPS} mode={mode} />}
        {method.id === "symbols" && <SymbolPanel mode={mode} />}
        {typing && <KeyboardPanel modelDoc={modelDoc} />}
      </div>
    </div>
  );
}
