"use client";

/**
 * The complete answer paper (owner 2026-11-26): every page of the student's upload, never limited to one question.
 * Page thumbnails (numbers), previous / next (and the ← → keys), zoom (75 / 100 / 125 / 150 %, fit width), rotate,
 * full screen. Images are drawn from a private object URL; a PDF page opens in the browser's own PDF viewer inside the
 * page (its own zoom and pages); a format the browser cannot show (HEIC) is offered as a download, with the reason.
 * Used by the coach's workspace and the Head Coach's review (each passes its own page fetcher).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileText, Maximize, Minimize, RotateCw } from "lucide-react";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import FileButton from "@/app/components/ui/FileButton";
import type { DownloadedFile } from "@/lib/api/client";

export interface PaperPage { page: number; name: string; mimeType: string; size: number }

const ZOOMS = [0.75, 1, 1.25, 1.5] as const;
type Zoom = (typeof ZOOMS)[number] | "fit";

const isImage = (m: string) => m.startsWith("image/") && m !== "image/heic" && m !== "image/heif";
const isPdf = (m: string) => m === "application/pdf";

export function PaperViewer({
  pages, fetchPage, queryKey, typedAnswer, title = "Answer pages", toolbarEnd, testId = "page-viewer",
}: {
  pages: readonly PaperPage[];
  fetchPage: (page: number) => Promise<DownloadedFile>;
  /** The query key prefix for the pages (the page number is appended). */
  queryKey: readonly unknown[];
  /** A typed answer (shown when there are no pages, or above them). */
  typedAnswer?: string | null;
  title?: string;
  /** Extra controls at the end of the toolbar (e.g. collapse the marks panel). */
  toolbarEnd?: ReactNode;
  testId?: string;
}) {
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [rotation, setRotation] = useState(0);
  const [full, setFull] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const count = pages.length;
  const p = count ? pages[Math.min(i, count - 1)] : null;

  const go = useCallback((to: number) => setI(Math.max(0, Math.min(count - 1, to))), [count]);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("input, textarea, select")) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
    if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); }
  };

  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === box.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void box.current?.requestFullscreen?.();
  };

  const blob = useQuery({
    queryKey: [...queryKey, "page", p?.page],
    queryFn: () => fetchPage(p!.page),
    enabled: !!p && (isImage(p.mimeType) || isPdf(p.mimeType)),
    staleTime: 300_000,
  });
  // A private object URL per fetched page, released when the page changes or the viewer closes.
  const url = useMemo(() => (blob.data ? URL.createObjectURL(blob.data.blob) : null), [blob.data]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const tool = "inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00428C] disabled:opacity-40";
  const off = "bg-slate-100 text-slate-700 hover:bg-slate-200";
  const on = "bg-[#00428C] text-white";

  return (
    <section
      ref={box}
      className={`flex min-w-0 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm ${full ? "h-screen" : ""}`}
      aria-label={title}
      data-testid={testId}
      onKeyDown={onKey}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#00428C]"><FileText className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{title}{count ? ` · ${count} page${count === 1 ? "" : "s"}` : ""}</p>
            <p className="text-xs text-slate-500">Every question, every page</p>
          </div>
        </div>
        {count > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              <button type="button" className={`${tool} ${off} bg-transparent`} onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous page"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
              <span className="whitespace-nowrap px-1 text-sm font-semibold text-slate-800" aria-live="polite" data-testid="page-position">Page {p!.page} of {count}</span>
              <button type="button" className={`${tool} ${off} bg-transparent`} onClick={() => go(i + 1)} disabled={i >= count - 1} aria-label="Next page"><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
            </div>
            {p && isImage(p.mimeType) && (
              <div className="flex items-center gap-1" role="group" aria-label="Zoom">
                {ZOOMS.map((z) => (
                  <button key={z} type="button" className={`${tool} ${zoom === z ? on : off}`} aria-pressed={zoom === z} onClick={() => setZoom(z)}>{Math.round(z * 100)}%</button>
                ))}
                <button type="button" className={`${tool} ${zoom === "fit" ? on : off}`} aria-pressed={zoom === "fit"} onClick={() => setZoom("fit")}>Fit</button>
                <button type="button" className={`${tool} ${off}`} onClick={() => setRotation((r) => (r + 90) % 360)} aria-label="Rotate the page" title="Rotate"><RotateCw className="h-4 w-4" aria-hidden="true" /></button>
              </div>
            )}
            <button type="button" className={`${tool} ${off}`} onClick={toggleFull} aria-label={full ? "Leave full screen" : "Full screen"} title={full ? "Leave full screen" : "Full screen"}>
              {full ? <Minimize className="h-4 w-4" aria-hidden="true" /> : <Maximize className="h-4 w-4" aria-hidden="true" />}
            </button>
            {toolbarEnd}
          </div>
        )}
        {count === 0 && toolbarEnd}
      </div>

      {typedAnswer && (
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Typed answer</p>
          <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-800" data-testid="typed-answer-view">{typedAnswer}</p>
        </div>
      )}

      {count === 0 ? (
        !typedAnswer && <p className="px-5 py-8 text-center text-sm text-slate-600">No pages were uploaded for this answer.</p>
      ) : (
        <div className={`flex min-h-0 ${full ? "flex-1" : "h-[60vh] min-h-[360px] sm:h-[78vh] sm:min-h-[420px]"}`}>
          {count > 1 && (
            <nav className="hidden w-20 shrink-0 space-y-2 overflow-y-auto border-r border-slate-100 bg-slate-50 p-2 sm:block" aria-label="Pages">
              {pages.map((pg, idx) => (
                <button
                  key={pg.page}
                  type="button"
                  onClick={() => setI(idx)}
                  aria-current={idx === i ? "page" : undefined}
                  className={`block w-full rounded-lg p-1.5 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00428C] ${idx === i ? "bg-blue-50 ring-2 ring-[#00428C]" : "hover:bg-slate-100"}`}
                >
                  <span className="mx-auto block aspect-[3/4] w-full rounded bg-white shadow-sm" aria-hidden="true" />
                  <span className={`mt-1 block text-xs ${idx === i ? "font-bold text-[#00428C]" : "text-slate-500"}`}>Page {pg.page}</span>
                </button>
              ))}
            </nav>
          )}
          <div className="relative min-w-0 flex-1 overflow-auto bg-slate-100 p-4 sm:p-6" data-testid="page-canvas">
            {p && (isImage(p.mimeType) || isPdf(p.mimeType)) ? (
              blob.isPending ? <LoadingBlock label="Loading the page…" />
                : blob.isError ? <ErrorState error={blob.error} title="Couldn't load this page" onRetry={() => blob.refetch()} />
                : url && (isPdf(p.mimeType) ? (
                  <iframe src={url} title={`Answer page ${p.page} of ${count} (PDF)`} className="h-full w-full rounded-lg border border-slate-200 bg-white" data-testid="page-pdf" />
                ) : (
                  <div className="flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a private blob: URL, not an optimisable asset */}
                    <img
                      src={url}
                      alt={`Answer page ${p.page} of ${count}`}
                      className="h-auto max-w-none rounded-md bg-white shadow-md transition-transform duration-200 motion-reduce:transition-none"
                      style={{ width: zoom === "fit" ? "100%" : `${zoom * 100}%`, maxWidth: zoom === "fit" ? 900 : undefined, transform: `rotate(${rotation}deg)` }}
                      data-testid="page-image"
                    />
                  </div>
                ))
            ) : p && (
              <div className="mx-auto max-w-md rounded-xl bg-white p-6 text-center shadow-sm">
                <p className="text-sm font-semibold text-slate-900">This page can&apos;t be shown in the browser</p>
                <p className="mt-1 text-sm text-slate-600">It is a {p.mimeType === "image/heic" || p.mimeType === "image/heif" ? "HEIC photo" : "file"} — save it and open it on your device.</p>
                <div className="mt-3 flex justify-center"><FileButton file={{ id: `${String(queryKey.join("-"))}-${p.page}`, originalName: p.name, mimeType: p.mimeType, size: p.size }} fetchFile={() => fetchPage(p.page)} /></div>
              </div>
            )}
          </div>
        </div>
      )}
      {p && (isImage(p.mimeType) || isPdf(p.mimeType)) && (
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          <span>Use ← → to change page.</span>
          <FileButton file={{ id: `${String(queryKey.join("-"))}-${p.page}`, originalName: p.name, mimeType: p.mimeType, size: p.size }} fetchFile={() => fetchPage(p.page)} />
        </div>
      )}
    </section>
  );
}
