import { useCallback, useEffect, useRef, useState } from "react";

import GazeButton from "../../components/GazeButton.jsx";
import Pager, { usePaged } from "../../components/Pager.jsx";
import { useNotice } from "../../app/NoticeContext.jsx";
import { useSettings } from "../../app/SettingsContext.jsx";
import { useSpeak } from "../../app/useSpeak.js";
import { stopSpeaking } from "../../app/speech.js";
import { fetchNews, formatPublished } from "./newsClient.js";

const PAGE_SIZE = 4;

export default function News() {
  const { settings, update } = useSettings();
  const lang = settings.newsLanguage;
  const notify = useNotice();
  const speakText = useSpeak();
  const [feedId, setFeedId] = useState("");
  const [state, setState] = useState({ status: "loading", data: null, error: "" });
  const [article, setArticle] = useState(null);
  const controllerRef = useRef(null);

  const load = useCallback(async ({ refresh = false } = {}) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState((previous) => ({ status: "loading", data: refresh ? previous.data : null, error: "" }));
    try {
      const data = await fetchNews({ lang, feed: feedId, refresh, signal: controller.signal });
      setState({ status: "ready", data, error: "" });
      if (data.stale) notify("Showing the last news that loaded. The news service is not answering right now.", "warn", 6000);
    } catch (error) {
      if (error?.name === "AbortError") return;
      setState({ status: "error", data: null, error: error.message });
    }
  }, [lang, feedId, notify]);

  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
  }, [load]);
  useEffect(() => () => stopSpeaking(), []);

  const items = state.data?.items ?? [];
  const paged = usePaged(items, PAGE_SIZE, `${lang}/${feedId}/${state.data?.fetchedAt}`);
  const feeds = state.data?.feeds ?? [];
  const nextRefresh = state.data?.nextRefreshAllowedAt ? Date.parse(state.data.nextRefreshAllowedAt) : 0;

  const refresh = () => {
    if (Date.now() < nextRefresh) {
      notify("The news was updated a moment ago. New stories are checked every few minutes.", "info");
      return;
    }
    load({ refresh: true });
  };

  const openOriginal = (event, url) => {
    event.preventDefault();
    const opened = window.open(url, "_blank");
    if (opened) opened.opener = null;
    else notify("The browser blocked the new tab. Allow pop-ups for this app, or ask a helper to open the article.", "warn", 7000);
  };

  return (
    <div className="news">
      <div className="news__controls">
        <div className="segmented-v2" role="group" aria-label="News language">
          <GazeButton label="English" aria-pressed={lang === "en"} onClick={() => { setFeedId(""); update({ newsLanguage: "en" }); }} />
          <GazeButton label="தமிழ்" sublabel="Tamil" aria-pressed={lang === "ta"} onClick={() => { setFeedId(""); update({ newsLanguage: "ta" }); }} />
        </div>
        <GazeButton icon="refresh" label="Refresh" disabled={state.status === "loading"} onClick={refresh} />
      </div>

      {feeds.length > 1 && (
        <div className="tabs" role="tablist" aria-label="News topics">
          {feeds.map((feed) => (
            <GazeButton key={feed.id} role="tab" className="tabs__tab" aria-selected={feed.id === state.data.feed.id} label={feed.label} onClick={() => setFeedId(feed.id)} />
          ))}
        </div>
      )}

      {state.status === "loading" && !items.length && <p className="empty-state empty-state--loading" role="status"><span className="spinner spinner--inline" aria-hidden="true" /> Loading news…</p>}
      {state.status === "error" && (
        <div className="empty-state" role="alert">
          <p>{state.error}</p>
          <GazeButton icon="refresh" label="Try again" onClick={() => load()} />
        </div>
      )}
      {state.status === "ready" && !items.length && <p className="empty-state">No stories right now. Try again later.</p>}

      {items.length > 0 && (
        <ul className="article-list">
          {paged.items.map((item) => (
            <li key={item.id}>
              <GazeButton className="article-card" onClick={() => setArticle(item)}>
                {item.image ? <img className="article-card__image" src={item.image} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} /> : <span className="article-card__image article-card__image--none" aria-hidden="true" />}
                <span className="article-card__text">
                  <span className="article-card__title" lang={lang}>{item.title}</span>
                  <span className="article-card__meta">{item.source}{item.published ? ` · ${formatPublished(item.published, lang)}` : ""}</span>
                </span>
              </GazeButton>
            </li>
          ))}
        </ul>
      )}
      <Pager paged={paged} label="stories" />

      {state.data && (
        <p className="attribution">
          Headlines and summaries come from {state.data.feed.source}&apos;s public RSS feed and belong to the publisher. Open the original article for the full story.
          {state.data.fetchedAt ? ` Updated ${formatPublished(state.data.fetchedAt, "en")}.` : ""}
        </p>
      )}

      {article && (
        <div className="modal" data-gaze-modal role="dialog" aria-modal="true" aria-label="News story">
          <div className="modal__panel modal__panel--wide article">
            {article.image && <img className="article__image" src={article.image} alt="" onError={(event) => { event.currentTarget.hidden = true; }} />}
            <div className="article__body">
              <p className="eyebrow">{article.source}{article.published ? ` · ${formatPublished(article.published, lang)}` : ""}</p>
              <h2 className="article__title" lang={lang}>{article.title}</h2>
              <p className="article__label">Summary from {article.source} (the publisher&apos;s own description)</p>
              <p className="article__summary" lang={lang}>{article.summary || "The publisher gave no summary for this story."}</p>
              <div className="modal__actions">
                <GazeButton variant="primary" icon="speaker" label="Read aloud" onClick={() => speakText(`${article.title}. ${article.summary}`, lang)} />
                <GazeButton href={article.link} icon="external" label="Open original article" sublabel="Opens the publisher's site in a new tab" onClick={(event) => openOriginal(event, article.link)} />
                <GazeButton icon="back" label="Back to stories" onClick={() => { stopSpeaking(); setArticle(null); }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
