import { useState } from "react";

import GazeButton from "../../components/GazeButton.jsx";
import Pager, { usePaged } from "../../components/Pager.jsx";
import { useMessage } from "../../app/MessageContext.jsx";
import { useSettings } from "../../app/SettingsContext.jsx";
import { useUserContent } from "../../app/UserContentContext.jsx";
import { useSpeak } from "../../app/useSpeak.js";
import { buttonText, pagerLabels, PHRASES_UI, textIn } from "../../content/i18n.js";
import { MY_PHRASES_ID, PHRASE_CATEGORIES } from "../../content/phrases.js";

const PAGE_SIZE = 6;

/**
 * Ready-made phrases, used twice on the Talk page: Quick phrases (general,
 * family and My phrases) and Needs (personal and health). Choosing one adds
 * it to the shared message and, when "speak at once" is on, speaks it.
 *
 * categoryIds: which groups to show, in order; MY_PHRASES_ID adds the
 *   phrases saved from the keyboard. mode: "en" | "ta" | "both".
 */
export default function PhrasePanel({ categoryIds, mode }) {
  const { settings } = useSettings();
  const message = useMessage();
  const speakText = useSpeak();
  const { phrases: myPhrases } = useUserContent();
  const [categoryId, setCategoryId] = useState(categoryIds[0]);
  const [lastChosen, setLastChosen] = useState(null);

  const categories = categoryIds.map((id) => (id === MY_PHRASES_ID
    ? { id, text: PHRASES_UI.myPhrases, icon: "⭐" }
    : { id, text: PHRASE_CATEGORIES.find((category) => category.id === id).label, icon: PHRASE_CATEGORIES.find((category) => category.id === id).icon }));
  // Phrases saved from the keyboard are shown as they were typed.
  const items = categoryId === MY_PHRASES_ID
    ? myPhrases.map((phrase) => ({ id: phrase.id, icon: "⭐", text: phrase.text }))
    : PHRASE_CATEGORIES.find((category) => category.id === categoryId).phrases.map((phrase) => ({ id: phrase.id, icon: phrase.icon, text: textIn(phrase.text, mode) }));
  const paged = usePaged(items, PAGE_SIZE, categoryId);

  const choose = (item) => {
    message.addPhrase(item.text);
    setLastChosen(item.id);
    if (settings.autoSpeak) speakText(item.text, "auto");
  };

  return (
    <div className="phrase-panel">
      {categories.length > 1 && (
        <div className="tabs" role="tablist" aria-label={textIn(PHRASES_UI.groups, mode)}>
          {categories.map((category) => (
            <GazeButton
              key={category.id}
              role="tab"
              aria-selected={category.id === categoryId}
              className="tabs__tab"
              {...buttonText(category.text, mode)}
              onClick={() => setCategoryId(category.id)}
            >
              <span className="tabs__emoji" aria-hidden="true">{category.icon}</span>
            </GazeButton>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <p className="empty-state">{textIn(PHRASES_UI.empty, mode)}</p>
      ) : (
        <div className={`card-grid card-grid--phrases${mode === "both" ? " card-grid--both" : ""}`}>
          {paged.items.map((item) => (
            <GazeButton key={item.id} className="phrase-card" aria-pressed={item.id === lastChosen} onClick={() => choose(item)}>
              <span className="phrase-card__emoji" aria-hidden="true">{item.icon}</span>
              <span className="phrase-card__text">{item.text}</span>
            </GazeButton>
          ))}
        </div>
      )}
      <Pager paged={paged} label="phrases" labels={pagerLabels(mode, PHRASES_UI.more)} />
    </div>
  );
}
