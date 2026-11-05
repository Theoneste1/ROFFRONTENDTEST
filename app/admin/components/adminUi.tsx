"use client";

/**
 * Building blocks shared by the admin pages, in the style of the original
 * admin mock-ups (rounded white cards, pill filters, uppercase table heads).
 */
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Download, Search, X } from "lucide-react";
import { errorMessage } from "@/lib/api/errors";
import { Alert, Spinner } from "@/app/components/ui/feedback";
import type { AssignmentStatus, SubmissionStatus } from "@/lib/api/types";

// ─── Page layout ────────────────────────────────────────────────────────────

export function AdminPage({ title, description, actions, children }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#E6EBF2] p-4 sm:p-6 md:p-10 text-gray-800 font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">{title}</h1>
          {description && <p className="text-sm text-gray-500 mt-1 font-medium">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bg-white rounded-2xl border border-gray-100 shadow-xs ${className}`}>{children}</div>;
}

// ─── Filters ────────────────────────────────────────────────────────────────

export function FilterPills<T extends string>({ options, value, onChange, label = "Filter" }: { options: { label: string; value: T; count?: number }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${active ? "bg-indigo-600 text-white shadow-xs" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}
          >
            {o.label}
            {o.count !== undefined && <span className={`ml-1.5 ${active ? "text-indigo-100" : "text-gray-400"}`}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Search box that reports its value after the user pauses typing. */
export function SearchInput({ value, onChange, placeholder = "Search…", label = "Search", delay = 350 }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string; delay?: number }) {
  const [text, setText] = useState(value);
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });
  useEffect(() => {
    if (text.trim() === value) return;
    const t = setTimeout(() => latest.current(text.trim()), delay);
    return () => clearTimeout(t);
  }, [text, value, delay]);
  return (
    <div className="relative flex-1 min-w-[200px] max-w-xs">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={text}
        maxLength={100}
        onChange={(e) => setText(e.target.value)}
        className="w-full bg-white text-xs pl-10 pr-4 py-2 rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-gray-400 shadow-2xs"
      />
    </div>
  );
}

export function SelectFilter({ label, value, onChange, options, id }: { label: string; value: string; onChange: (v: string) => void; options: { label: string; value: string }[]; id?: string }) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <label htmlFor={selectId} className="flex items-center gap-2 text-xs text-gray-500">
      <span className="font-semibold">{label}</span>
      <select
        id={selectId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-white border border-gray-200 rounded-full px-3 py-1.5 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ─── Tables ─────────────────────────────────────────────────────────────────

export const th = "px-4 sm:px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap";
export const td = "px-4 sm:px-6 py-3.5";

/** Table card with horizontal scroll inside the card (never the page). */
export function TableCard({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="relative overflow-x-auto">
        <table className="w-full text-left border-collapse">{children}</table>
      </div>
      {footer}
    </Card>
  );
}

export function TableMessage({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-10 text-center text-xs text-gray-400 font-medium">
        {children}
      </td>
    </tr>
  );
}

// ─── Badges ─────────────────────────────────────────────────────────────────

export function Badge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`inline-flex items-center px-3 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${className}`}>{children}</span>;
}

/** Assignment states as the administrator sees them. */
export const ADMIN_ASSIGNMENT_STATUS: Record<AssignmentStatus, { label: string; badge: string }> = {
  DRAFT: { label: "Draft (mentor)", badge: "bg-slate-100 text-slate-600" },
  PENDING_APPROVAL: { label: "Awaiting approval", badge: "bg-amber-50 text-amber-700" },
  REJECTED: { label: "Returned to mentor", badge: "bg-red-50 text-red-600" },
  PUBLISHED: { label: "Published", badge: "bg-emerald-50 text-emerald-700" },
  CLOSED: { label: "Closed", badge: "bg-blue-50 text-blue-700" },
  ARCHIVED: { label: "Archived", badge: "bg-gray-100 text-gray-600" },
};

/** Submission states as the administrator sees them. */
export const ADMIN_SUBMISSION_STATUS: Record<SubmissionStatus, { label: string; badge: string }> = {
  SUBMITTED: { label: "Awaiting distribution", badge: "bg-slate-100 text-slate-600" },
  ASSIGNED: { label: "With mentor", badge: "bg-purple-50 text-purple-700" },
  IN_REVIEW: { label: "In review", badge: "bg-blue-50 text-blue-700" },
  MARKED: { label: "Marked (not sent)", badge: "bg-indigo-50 text-indigo-700" },
  SUBMITTED_TO_ADMIN: { label: "Awaiting approval", badge: "bg-amber-50 text-amber-700" },
  APPROVED: { label: "Approved", badge: "bg-emerald-50 text-emerald-700" },
  PUBLISHED: { label: "Published", badge: "bg-green-50 text-green-700" },
  REJECTED: { label: "Sent back to mentor", badge: "bg-red-50 text-red-600" },
  RESUBMISSION_REQUESTED: { label: "Resubmission requested", badge: "bg-rose-50 text-rose-600" },
};

export function AssignmentBadge({ status }: { status: AssignmentStatus }) {
  const s = ADMIN_ASSIGNMENT_STATUS[status] ?? { label: status, badge: "bg-gray-100 text-gray-600" };
  return <Badge className={s.badge}>{s.label}</Badge>;
}

export function SubmissionBadge({ status }: { status: SubmissionStatus }) {
  const s = ADMIN_SUBMISSION_STATUS[status] ?? { label: status, badge: "bg-gray-100 text-gray-600" };
  return <Badge className={s.badge}>{s.label}</Badge>;
}

// ─── Buttons ────────────────────────────────────────────────────────────────

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-full shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
export const btnSecondary =
  "inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
export const btnDanger =
  "inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-full shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
export const linkBtn = "text-indigo-600 hover:text-indigo-800 font-medium transition-colors text-xs";

/** Download an authenticated CSV export. */
export function CsvButton({ onDownload, label = "Export CSV" }: { onDownload: () => Promise<void>; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setError(null);
    try {
      await onDownload();
    } catch (e) {
      setError(errorMessage(e, "Couldn't download the export."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={run} disabled={busy} className={btnSecondary}>
        {busy ? <Spinner className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" aria-hidden="true" />}
        {label}
      </button>
      {error && (
        <span className="text-[11px] text-red-600" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

// ─── Dialogs ────────────────────────────────────────────────────────────────

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const titleId = useId();
  const latestClose = useRef(onClose);
  useEffect(() => {
    latestClose.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && latestClose.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <h2 id={titleId} className="text-lg font-bold text-gray-900">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 pb-6 pt-3">{children}</div>
      </div>
    </div>
  );
}

export interface NoteRule {
  label: string;
  required: boolean;
  min: number;
  max: number;
  placeholder?: string;
}

/**
 * Confirm an action, optionally with a note (rejection reason, close note …).
 * `onConfirm` returns a promise; the dialog shows its error and stays open.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  tone = "primary",
  note,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  note?: NoteRule;
  onConfirm: (note: string) => Promise<unknown>;
  onClose: () => void;
  children?: ReactNode;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteId = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (note && (note.required || value) && (value.length < note.min || value.length > note.max)) {
      setError(`${note.label} must be ${note.min}–${note.max.toLocaleString()} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(value);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={busy ? () => undefined : onClose}>
      <form onSubmit={submit} className="space-y-4">
        {body && <div className="text-sm text-gray-600">{body}</div>}
        {children}
        {note && (
          <div>
            <label htmlFor={noteId} className="block text-xs font-semibold text-gray-600 mb-1">
              {note.label} {note.required ? <span className="text-red-500">*</span> : <span className="font-normal text-gray-400">(optional)</span>}
            </label>
            <textarea
              id={noteId}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              maxLength={note.max}
              placeholder={note.placeholder}
              className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="px-5 py-2 text-sm text-gray-600 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={busy} className={tone === "danger" ? btnDanger : btnPrimary}>
            {busy && <Spinner className="h-3.5 w-3.5 !text-white" />}
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Small success/info banner that the user can dismiss. */
export function Notice({ tone = "success", children, onClose }: { tone?: "success" | "error" | "info"; children: ReactNode; onClose?: () => void }) {
  return (
    <div className="mb-4 flex items-start gap-2">
      <div className="flex-1">
        <Alert tone={tone}>{children}</Alert>
      </div>
      {onClose && (
        <button type="button" onClick={onClose} className="mt-2 text-gray-400 hover:text-gray-600" aria-label="Dismiss">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ─── Metrics ────────────────────────────────────────────────────────────────

export function MetricCard({ label, value, subtext }: { label: string; value: ReactNode; subtext?: ReactNode }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between">
      <div>
        <p className="text-xs font-semibold text-gray-400 tracking-wider uppercase mb-1">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
      {subtext && <p className="text-xs text-gray-400 mt-2 font-medium">{subtext}</p>}
    </div>
  );
}
