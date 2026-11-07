"use client";

import { useEffect, useSyncExternalStore } from "react";
import { UploadCloud } from "lucide-react";
import { getServerUploads, getUploads, subscribeUploads, summarise } from "@/lib/api/upload-progress";
import { formatFileSize } from "@/lib/format";

/**
 * One indicator for every file upload in flight (the API client reports
 * progress; see lib/api/upload-progress.ts). Also asks for confirmation before
 * the tab is closed mid-upload.
 */
export default function UploadProgress() {
  const uploads = useSyncExternalStore(subscribeUploads, getUploads, getServerUploads);
  const sum = summarise(uploads);
  const active = sum !== null;

  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);

  if (!sum) return null;
  const percent = sum.total > 0 ? Math.min(100, Math.round((sum.loaded / sum.total) * 100)) : null;
  const label = sum.processing
    ? "Upload complete — saving the files…"
    : `Uploading${percent !== null ? ` ${percent}%` : "…"}`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 left-4 sm:left-auto z-50 sm:w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg"
    >
      <div className="flex items-center gap-3">
        <UploadCloud className="h-5 w-5 shrink-0 text-[#2B2BB2]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">{label}</p>
          {sum.total > 0 && !sum.processing && (
            <p className="text-xs text-slate-500">
              {formatFileSize(sum.loaded)} of {formatFileSize(sum.total)} · keep this page open
            </p>
          )}
        </div>
      </div>
      <progress
        className="mt-3 h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-slate-100 [&::-webkit-progress-value]:bg-[#2B2BB2] [&::-moz-progress-bar]:bg-[#2B2BB2]"
        max={100}
        value={sum.processing ? undefined : (percent ?? undefined)}
        aria-label="Upload progress"
      />
    </div>
  );
}
