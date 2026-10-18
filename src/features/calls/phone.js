// Phone number helpers for the Calls section. Pure functions, unit-tested.
//
// Calls are placed by the device: a tel: link opens the phone's dialer (on
// Android and iPhone) or the computer's calling app (Phone Link, FaceTime,
// Skype...). The web page cannot see whether the call connects.

/** Keeps digits and one leading +. Returns null unless 3 to 15 digits remain. */
export function normalizePhone(input) {
  const raw = String(input ?? "").trim();
  if (!raw || /[^\d+\s().-]/.test(raw)) return null;
  const plus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 3 || digits.length > 15) return null;
  return (plus ? "+" : "") + digits;
}

export function telHref(phone) {
  return `tel:${phone}`;
}

export function smsHref(phone, body = "") {
  return body ? `sms:${phone}?body=${encodeURIComponent(body)}` : `sms:${phone}`;
}

/** WhatsApp needs the full international number (with country code). */
export function whatsappHref(phone, text = "") {
  if (!phone.startsWith("+")) return null;
  const base = `https://wa.me/${phone.slice(1)}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => Array.from(part)[0].toUpperCase()).join("") || "?";
}

/** Most-called first, then by name. */
export function sortContacts(contacts) {
  return [...contacts].sort((a, b) => (b.calls || 0) - (a.calls || 0) || a.name.localeCompare(b.name));
}

export function isLikelyPhoneDevice(nav = typeof navigator === "undefined" ? null : navigator) {
  if (!nav) return false;
  if (typeof nav.userAgentData?.mobile === "boolean") return nav.userAgentData.mobile;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || "");
}
