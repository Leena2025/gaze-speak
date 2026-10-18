export function formatPx(value) {
  return Number.isFinite(value) ? `${Math.round(value)} px` : "—";
}

export function formatMs(value) {
  if (!Number.isFinite(value)) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`;
}

export function formatPercent(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : "—";
}

export function formatDate(iso) {
  if (!iso) return "unknown date";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "unknown date" : date.toLocaleString();
}
