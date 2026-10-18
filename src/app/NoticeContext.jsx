import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

const NoticeContext = createContext(null);

/** One short status message at a time ("Speaking…", "No Tamil voice installed"). */
export function NoticeProvider({ children }) {
  const [notice, setNotice] = useState(null);
  const timerRef = useRef(null);

  const notify = useCallback((text, tone = "info", ms = 4500) => {
    clearTimeout(timerRef.current);
    setNotice({ text, tone, id: Date.now() });
    timerRef.current = setTimeout(() => setNotice(null), ms);
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);
  return (
    <NoticeContext.Provider value={value}>
      {children}
      {notice && (
        <div key={notice.id} className={`toast-v2 toast-v2--${notice.tone}`} role={notice.tone === "danger" ? "alert" : "status"}>
          {notice.text}
        </div>
      )}
    </NoticeContext.Provider>
  );
}

export function useNotice() {
  const context = useContext(NoticeContext);
  if (!context) throw new Error("useNotice must be used inside NoticeProvider");
  return context.notify;
}
