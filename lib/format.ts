/**
 * Display formatting. The API sends ISO 8601 UTC timestamps; they are shown
 * in the user's locale and time zone.
 */

const dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const numberFmt = new Intl.NumberFormat();

export function formatDate(iso: string | null | undefined): string {
  return iso ? dateFmt.format(new Date(iso)) : "—";
}

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTimeFmt.format(new Date(iso)) : "—";
}

export function formatTime(iso: string | null | undefined): string {
  return iso ? timeFmt.format(new Date(iso)) : "—";
}

export function formatNumber(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : numberFmt.format(n);
}

/** "3 minutes ago", "yesterday", "in 2 days". */
export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "—";
  const diffSec = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), "day");
  return formatDate(iso);
}

/** Whole days until a deadline (negative when past). */
export function daysUntil(iso: string, now: number = Date.now()): number {
  return Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * True when the file name's extension is in an `accept` list such as
 * ".pdf,.docx". Dropped files skip the browser's `accept` filter, so pickers
 * check it themselves; the backend still checks the real type from the content.
 */
export function hasAcceptedExtension(name: string, accept: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  const ext = name.slice(dot).toLowerCase();
  return accept
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .includes(ext);
}

/** "Eric S." style name; tolerates a missing author (deleted content). */
export function personName(p: { firstName: string; lastName: string } | null | undefined, fallback = "Unknown"): string {
  if (!p) return fallback;
  return `${p.firstName} ${p.lastName}`.trim() || fallback;
}
