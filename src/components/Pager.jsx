import { useEffect, useState } from "react";

import GazeButton from "./GazeButton.jsx";

/**
 * Lists are split into pages instead of scrolling, because eyes cannot
 * scroll. The page resets when `resetKey` (a filter or search) changes.
 */
export function usePaged(items, pageSize, resetKey) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => {
    setPage(0);
  }, [resetKey]);
  const current = Math.min(page, pages - 1);
  return {
    page: current,
    pages,
    total: items.length,
    items: items.slice(current * pageSize, current * pageSize + pageSize),
    next: () => setPage(Math.min(pages - 1, current + 1)),
    previous: () => setPage(Math.max(0, current - 1)),
  };
}

/**
 * labels: optional text for pages in another language, as { previous, next,
 * region, page(page, pages) }; previous and next are a string or
 * { label, sublabel }.
 */
export default function Pager({ paged, label = "items", labels = {} }) {
  if (paged.pages <= 1) return null;
  const asButton = (value, fallback) => (typeof value === "string" ? { label: value } : value || { label: fallback });
  const info = labels.page ? labels.page(paged.page + 1, paged.pages) : `Page ${paged.page + 1} of ${paged.pages}`;
  return (
    <nav className="pager" aria-label={labels.region || `More ${label}`}>
      <GazeButton icon="up" {...asButton(labels.previous, "Previous page")} disabled={paged.page === 0} onClick={paged.previous} />
      <span className="pager__info" aria-live="polite">{info}</span>
      <GazeButton icon="down" {...asButton(labels.next, "Next page")} disabled={paged.page >= paged.pages - 1} onClick={paged.next} />
    </nav>
  );
}
