import { clsx } from "clsx";
import { formatDistanceToNow, format, parseISO } from "date-fns";

export function cn(...inputs) {
  return clsx(inputs);
}

export function fmtDate(d) {
  if (!d) return "—";
  try {
    const date = typeof d === "string" ? parseISO(d) : new Date(d);
    return format(date, "d MMM yyyy");
  } catch { return "—"; }
}

export function fmtDateTime(d) {
  if (!d) return "—";
  try {
    const date = typeof d === "string" ? parseISO(d) : new Date(d);
    return format(date, "d MMM yyyy, h:mm a");
  } catch { return "—"; }
}

export function fmtRelative(d) {
  if (!d) return "—";
  try {
    const date = typeof d === "string" ? parseISO(d) : new Date(d);
    return formatDistanceToNow(date, { addSuffix: true });
  } catch { return "—"; }
}

export function fmtCurrency(amount, currency = "USD") {
  if (!amount || amount === 0) return "On Request";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function fmtPhone(phone) {
  if (!phone) return "—";
  const s = String(phone);
  // A business-scoped user ID (BSUID, e.g. "GH.4287898731522060") identifies
  // someone who's hidden their phone number behind a WhatsApp username --
  // it's not a phone number at all, so prefixing it with "+" mislabels it.
  // See isBsuid() in the backend's src/services/whatsapp.js for the same check.
  if (!/^\d+$/.test(s)) return `🆔 ${s}`;
  if (s.startsWith("233")) return `+233 ${s.slice(3, 5)} ${s.slice(5, 8)} ${s.slice(8)}`;
  return `+${s}`;
}

export function tierColor(tier) {
  switch (tier?.toLowerCase()) {
    case "hot":  return "red";
    case "warm": return "amber";
    case "cold": return "blue";
    default:     return "slate";
  }
}

export function scoreColor(score) {
  if (score >= 80) return "text-red-600";
  if (score >= 50) return "text-amber-600";
  return "text-blue-500";
}

export function stateBadgeColor(state) {
  const map = {
    ACTIVE:               "green",
    ESCALATED:            "red",
    GREETING:             "slate",
    AWAITING_NAME:        "slate",
    AWAITING_COUNTRY:     "slate",
    AWAITING_EMAIL:       "slate",
    AWAITING_PRODUCT_INTENT: "blue",
    VIEWING_BOOKING:      "purple",
  };
  return map[state] || "slate";
}

export function truncate(str, n = 60) {
  if (!str) return "";
  return str.length > n ? str.slice(0, n) + "…" : str;
}

export function initials(name) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export function avatarColor(str) {
  const colors = [
    "bg-brand-600", "bg-purple-600", "bg-blue-600",
    "bg-pink-600",  "bg-indigo-600", "bg-teal-600",
    "bg-orange-600","bg-emerald-600",
  ];
  let h = 0;
  for (let i = 0; i < (str || "").length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff;
  return colors[h % colors.length];
}
