import { useState } from "react";

import GazeButton from "../../components/GazeButton.jsx";
import Pager, { usePaged } from "../../components/Pager.jsx";
import { useMessage } from "../../app/MessageContext.jsx";
import { useSettings } from "../../app/SettingsContext.jsx";
import { useUserContent } from "../../app/UserContentContext.jsx";
import { useSpeak } from "../../app/useSpeak.js";
import { buttonText, pagerLabels, SYMBOLS_UI, textIn } from "../../content/i18n.js";
import { localized } from "../../content/phrases.js";
import { MY_SYMBOLS_ID, SYMBOL_CATEGORIES } from "../../content/symbols.js";

const PAGE_SIZE = 8;

/**
 * Picture communication on the Talk page: each symbol adds its sentence to
 * the shared message, so several symbols build a longer message ("I want
 * water. I am tired."). mode: "en" | "ta" | "both".
 */
export default function SymbolPanel({ mode }) {
  const { settings } = useSettings();
  const message = useMessage();
  const speakText = useSpeak();
  const { symbols: mySymbols } = useUserContent();
  const [categoryId, setCategoryId] = useState(SYMBOL_CATEGORIES[0].id);

  const categories = [
    ...SYMBOL_CATEGORIES.map((category) => ({ id: category.id, text: category.label })),
    { id: MY_SYMBOLS_ID, text: SYMBOLS_UI.mySymbols },
  ];
  // Symbols a helper added are shown as they were typed, in any language.
  const items = categoryId === MY_SYMBOLS_ID
    ? mySymbols.map((symbol) => ({ id: symbol.id, emoji: symbol.emoji, label: symbol.label, phrase: symbol.phrase }))
    : SYMBOL_CATEGORIES.find((category) => category.id === categoryId).symbols.map((symbol) => ({
      id: symbol.id,
      emoji: symbol.emoji,
      label: mode === "both" ? localized(symbol.label, "en") : localized(symbol.label, mode),
      labelTa: mode === "both" && symbol.label.ta !== symbol.label.en ? symbol.label.ta : "",
      phrase: textIn(symbol.phrase, mode),
    }));
  const paged = usePaged(items, PAGE_SIZE, categoryId);

  const choose = (item) => {
    message.addPhrase(item.phrase);
    if (settings.autoSpeak) speakText(item.phrase, "auto");
  };

  return (
    <div className={`symbols symbols--${mode}`}>
      <div className="tabs" role="tablist" aria-label={textIn(SYMBOLS_UI.groups, mode)}>
        {categories.map((category) => (
          <GazeButton key={category.id} role="tab" aria-selected={category.id === categoryId} className="tabs__tab" {...buttonText(category.text, mode)} onClick={() => setCategoryId(category.id)} />
        ))}
      </div>
      {items.length === 0 ? (
        <p className="empty-state">{textIn(SYMBOLS_UI.empty, mode)}</p>
      ) : (
        <div className="card-grid card-grid--symbols">
          {paged.items.map((item) => (
            <GazeButton key={item.id} className="symbol-card" aria-label={`${item.label}${item.labelTa ? ` / ${item.labelTa}` : ""}: ${item.phrase}`} onClick={() => choose(item)}>
              <span className="symbol-card__emoji" aria-hidden="true">{item.emoji}</span>
              <span className="symbol-card__label">{item.label}</span>
              {item.labelTa && <span className="symbol-card__label-ta" lang="ta">{item.labelTa}</span>}
              <span className="symbol-card__phrase">{item.phrase}</span>
            </GazeButton>
          ))}
        </div>
      )}
      <Pager paged={paged} label="symbols" labels={pagerLabels(mode, SYMBOLS_UI.more)} />
    </div>
  );
}
