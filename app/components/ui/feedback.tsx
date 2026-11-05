/**
 * Shared loading, error, empty and message states. Styled to match the
 * existing portals (white rounded cards, slate text, navy/indigo accents).
 */
import { AlertCircle, CheckCircle2, Inbox, Info, Loader2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { errorMessage, isApiError } from "@/lib/api/errors";

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return <Loader2 className={`animate-spin text-[#2B2BB2] ${className}`} aria-hidden="true" />;
}

/** Centred spinner for a whole screen (session check, route guard). */
export function FullPageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center gap-3 bg-[#e2e8f0]" role="status">
      <Spinner className="h-8 w-8" />
      <span className="text-sm text-slate-600">{label}</span>
    </div>
  );
}

/** Spinner inside a content area. */
export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="w-full py-16 flex flex-col items-center justify-center gap-3" role="status">
      <Spinner className="h-7 w-7" />
      <span className="text-sm text-slate-500">{label}</span>
    </div>
  );
}

/** An error card with retry. Shows the backend `requestId` for support. */
export function ErrorState({
  error,
  title = "Couldn't load this",
  onRetry,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
}) {
  const requestId = isApiError(error) ? error.requestId : undefined;
  return (
    <div className="w-full bg-white border border-red-100 rounded-2xl p-6 flex flex-col items-center text-center gap-2" role="alert">
      <AlertCircle className="h-8 w-8 text-red-500" aria-hidden="true" />
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="text-sm text-slate-600 max-w-md">{errorMessage(error)}</p>
      {requestId && <p className="text-xs text-slate-400 font-mono">Reference: {requestId}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#2B2BB2] border border-[#2B2BB2]/30 rounded-lg hover:bg-[#2B2BB2]/5 transition-colors"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="w-full py-14 flex flex-col items-center text-center gap-2">
      <Inbox className="h-9 w-9 text-slate-400" aria-hidden="true" />
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {description && <p className="text-sm text-slate-500 max-w-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

type Tone = "error" | "success" | "info";

const TONE: Record<Tone, { box: string; icon: ReactNode }> = {
  error: {
    box: "bg-red-50 border-red-200 text-red-800",
    icon: <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />,
  },
  success: {
    box: "bg-green-50 border-green-200 text-green-800",
    icon: <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />,
  },
  info: {
    box: "bg-blue-50 border-blue-200 text-blue-800",
    icon: <Info className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />,
  },
};

/** Inline message for forms (submit errors, confirmations). */
export function Alert({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  const t = TONE[tone];
  return (
    <div className={`flex gap-2 border rounded-lg px-3 py-2.5 text-sm ${t.box}`} role={tone === "error" ? "alert" : "status"}>
      {t.icon}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
