"use client";

/**
 * Resources of one course × division (Books, Past Papers, Notes & Materials).
 * Consolidates the former BooksTab and PastPapersTab (same table design,
 * the year/type filters of Past Papers, search and sort of Books) and wires
 * the row menu to the real resource actions.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, BookOpen, Download, Edit, Eye, EyeOff, FileText, MoreHorizontal, NotebookPen, Plus, RotateCcw, Archive, Trash2 } from "lucide-react";
import type { CourseResource, ResourceType } from "@/lib/api/types";
import { mentorResourcesApi } from "@/lib/api/mentor";
import { saveFile } from "@/lib/api/client";
import { useMentorResources, useResourceAction } from "@/lib/queries/mentor";
import { errorMessage } from "@/lib/api/errors";
import { formatDate, formatFileSize, personName } from "@/lib/format";
import { Alert, EmptyState, ErrorState, LoadingBlock, Spinner } from "@/app/components/ui/feedback";

export type ResourceKind = "books" | "papers" | "notes";

export const KIND: Record<ResourceKind, { title: string; subtitle: string; types: ResourceType[]; add: string; defaultType: ResourceType; icon: typeof BookOpen }> = {
  books: { title: "Books", subtitle: "Books and e-books for this course", types: ["BOOK", "EBOOK"], add: "Upload a Book", defaultType: "BOOK", icon: BookOpen },
  papers: { title: "Past Papers", subtitle: "Previous Olympiad papers for practice", types: ["PAST_PAPER"], add: "Upload Past Paper", defaultType: "PAST_PAPER", icon: FileText },
  notes: { title: "Notes & Materials", subtitle: "Notes, worksheets and other files", types: ["NOTE", "ATTACHMENT"], add: "Upload Material", defaultType: "NOTE", icon: NotebookPen },
};

export const TYPE_LABEL: Record<ResourceType, string> = { BOOK: "Book", EBOOK: "E-book", NOTE: "Note", PAST_PAPER: "Past paper", ATTACHMENT: "Attachment" };

type StatusFilter = "all" | "published" | "draft" | "archived";

function stateOf(r: CourseResource): "published" | "draft" | "archived" {
  if (r.archivedAt) return "archived";
  return r.isPublished ? "published" : "draft";
}

const STATE_BADGE = {
  published: "bg-green-100 text-green-700",
  draft: "bg-slate-100 text-slate-600",
  archived: "bg-gray-200 text-gray-600",
};

export default function ResourcesTab({ kind, courseId, divisionId, scopeKeyValue }: { kind: ResourceKind; courseId: string; divisionId: string; scopeKeyValue: string }) {
  const router = useRouter();
  const cfg = KIND[kind];
  const resources = useMentorResources(courseId, divisionId);
  const action = useResourceAction(courseId);
  const [searchQuery, setSearchQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [year, setYear] = useState("all");
  const [sortOrder, setSortOrder] = useState<"Newest" | "Oldest">("Newest");
  const [notice, setNotice] = useState<string | null>(null);

  const all = useMemo(() => (resources.data ?? []).filter((r) => cfg.types.includes(r.type)), [resources.data, cfg.types]);
  const years = useMemo(() => [...new Set(all.map((r) => r.year).filter((y): y is number => !!y))].sort((a, b) => b - a), [all]);
  const rows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return all
      .filter((r) => !q || [r.title, r.description, r.author, r.source, ...r.tags].some((v) => v?.toLowerCase().includes(q)))
      .filter((r) => status === "all" || stateOf(r) === status)
      .filter((r) => year === "all" || String(r.year) === year)
      .sort((a, b) => (sortOrder === "Newest" ? -1 : 1) * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
  }, [all, searchQuery, status, year, sortOrder]);

  const addHref = `/mentor/courses/upload-book?scope=${encodeURIComponent(scopeKeyValue)}&type=${cfg.defaultType}&tab=${kind}`;

  function run(r: CourseResource, act: "publish" | "unpublish" | "archive" | "restore" | "delete") {
    if (act === "delete" && !window.confirm(`Delete “${r.title}”? This cannot be undone.`)) return;
    setNotice(null);
    action.mutate(
      { resourceId: r.id, action: act },
      {
        onSuccess: () =>
          setNotice(
            { publish: "Published — students of the division can now see it.", unpublish: "Unpublished — hidden from students.", archive: "Archived.", restore: "Restored.", delete: "Deleted." }[act],
          ),
      },
    );
  }

  const selectCls = "px-3 py-2 bg-white border border-gray-200/80 rounded-xl text-xs font-semibold text-gray-700 shadow-sm";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">{cfg.title}</h2>
          <p className="text-gray-500 text-sm mt-1">{cfg.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => router.push(addHref)}
          className="flex items-center gap-2.5 bg-[#2522A5] hover:bg-[#1d1a88] text-white px-6 py-3 rounded-2xl font-medium shadow-sm transition-all text-sm"
        >
          <Plus className="w-4 h-4" />
          <span>{cfg.add}</span>
        </button>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {action.isError && <Alert tone="error">{errorMessage(action.error)}</Alert>}

      {/* Search & filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 md:gap-4 pt-2">
        <input
          type="search"
          placeholder={`Search ${cfg.title.toLowerCase()}...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search resources"
          className="flex-1 max-w-full sm:max-w-md px-4 py-2 bg-white border border-gray-200/80 rounded-xl text-xs placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
        />
        <div className="flex flex-wrap items-center gap-3">
          <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Status">
            <option value="all">All statuses</option>
            <option value="published">Published</option>
            <option value="draft">Not published</option>
            <option value="archived">Archived</option>
          </select>
          {years.length > 0 && (
            <select className={selectCls} value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
              <option value="all">All years</option>
              {years.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={() => setSortOrder((s) => (s === "Newest" ? "Oldest" : "Newest"))} className={`${selectCls} flex items-center gap-2 hover:bg-gray-50`}>
            <ArrowUpDown className="w-3.5 h-3.5 text-gray-600" />
            {sortOrder}
          </button>
        </div>
      </div>

      {resources.isPending ? (
        <LoadingBlock label="Loading resources…" />
      ) : resources.isError ? (
        <ErrorState error={resources.error} title="Couldn't load resources" onRetry={() => resources.refetch()} />
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200/70">
          <EmptyState
            title={all.length === 0 ? `No ${cfg.title.toLowerCase()} yet` : "Nothing matches"}
            description={all.length === 0 ? "Upload the first one — it stays hidden from students until you publish it." : "Try another search or filter."}
          />
        </div>
      ) : (
        <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-gray-200/70 overflow-hidden">
          <div className="overflow-x-auto relative">
            <table className="w-full text-left border-collapse min-w-[720px]">
              <thead>
                <tr className="bg-[#DCE5F7] text-gray-600 text-xs font-semibold">
                  <th className="py-3 md:py-4 px-4 md:px-6">Title</th>
                  <th className="py-3 md:py-4 px-4 md:px-6">Type</th>
                  <th className="py-3 md:py-4 px-4 md:px-6">Status</th>
                  <th className="py-3 md:py-4 px-4 md:px-6">Uploaded</th>
                  <th className="py-3 md:py-4 px-4 md:px-6">Files</th>
                  <th className="py-3 md:py-4 px-4 md:px-6 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {rows.map((r) => {
                  const st = stateOf(r);
                  const size = r.attachments.reduce((s, a) => s + a.file.size, 0);
                  const busy = action.isPending && action.variables?.resourceId === r.id;
                  const Icon = cfg.icon;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3 md:py-4 px-4 md:px-6">
                        <div className="flex items-center gap-3 md:gap-4">
                          <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl bg-[#E8F0FE] flex items-center justify-center shrink-0">
                            <Icon className="w-4 h-4 md:w-5 md:h-5 text-[#2563EB]" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-gray-900 text-xs md:text-sm truncate max-w-[260px]" title={r.title}>
                              {r.title}
                            </p>
                            <p className="text-[10px] md:text-xs text-gray-400 mt-0.5 truncate max-w-[260px]">
                              {[r.author, r.year, r.source, r.tags.join(", ")].filter(Boolean).join(" · ") || "—"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 md:py-4 px-4 md:px-6 font-medium text-gray-800 text-xs">{TYPE_LABEL[r.type]}</td>
                      <td className="py-3 md:py-4 px-4 md:px-6">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATE_BADGE[st]}`}>{st === "draft" ? "Not published" : st === "published" ? "Published" : "Archived"}</span>
                      </td>
                      <td className="py-3 md:py-4 px-4 md:px-6">
                        <p className="font-bold text-gray-800 text-xs">{formatDate(r.createdAt)}</p>
                        <p className="text-[10px] md:text-xs text-gray-400 mt-0.5">By {personName(r.uploadedBy, "—")}</p>
                      </td>
                      <td className="py-3 md:py-4 px-4 md:px-6 font-medium text-gray-600 text-xs">
                        {r.attachments.length} · {formatFileSize(size)}
                      </td>
                      <td className="py-3 md:py-4 px-4 md:px-6 text-right">
                        {busy ? (
                          <Spinner className="h-4 w-4 inline" />
                        ) : (
                          <RowMenu
                            resource={r}
                            state={st}
                            onEdit={() => router.push(`/mentor/courses/upload-book?scope=${encodeURIComponent(scopeKeyValue)}&resourceId=${r.id}&tab=${kind}`)}
                            onDownload={async () => {
                              for (const a of r.attachments) saveFile(await mentorResourcesApi.file(courseId, r.id, a.id, a.file.originalName));
                            }}
                            onAction={(act) => run(r, act)}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function RowMenu({
  resource,
  state,
  onEdit,
  onDownload,
  onAction,
}: {
  resource: CourseResource;
  state: "published" | "draft" | "archived";
  onEdit: () => void;
  onDownload: () => Promise<void>;
  onAction: (a: "publish" | "unpublish" | "archive" | "restore" | "delete") => void;
}) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const item = "w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-left hover:bg-gray-50 text-gray-700";
  const choose = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Actions for ${resource.title}`}
        aria-expanded={open}
        className="px-2 md:px-3 py-1 md:py-1.5 rounded-full bg-[#F2F5F9] hover:bg-gray-200 text-gray-600 transition-colors inline-flex items-center justify-center"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {err && <p className="absolute right-0 mt-1 text-[10px] text-red-600 w-40">{err}</p>}
      {open && (
        <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-20">
          {resource.attachments.length > 0 && (
            <button
              type="button"
              className={item}
              onClick={choose(() => {
                setErr(null);
                onDownload().catch((e) => setErr(errorMessage(e)));
              })}
            >
              <Download className="w-3.5 h-3.5" /> Download file{resource.attachments.length > 1 ? "s" : ""}
            </button>
          )}
          <button type="button" className={item} onClick={choose(onEdit)}>
            <Edit className="w-3.5 h-3.5" /> Edit
          </button>
          {state === "draft" && (
            <button type="button" className={item} onClick={choose(() => onAction("publish"))}>
              <Eye className="w-3.5 h-3.5" /> Publish
            </button>
          )}
          {state === "published" && (
            <button type="button" className={item} onClick={choose(() => onAction("unpublish"))}>
              <EyeOff className="w-3.5 h-3.5" /> Unpublish
            </button>
          )}
          {state !== "archived" ? (
            <button type="button" className={item} onClick={choose(() => onAction("archive"))}>
              <Archive className="w-3.5 h-3.5" /> Archive
            </button>
          ) : (
            <button type="button" className={item} onClick={choose(() => onAction("restore"))}>
              <RotateCcw className="w-3.5 h-3.5" /> Restore
            </button>
          )}
          <button type="button" className={`${item} !text-red-600`} onClick={choose(() => onAction("delete"))}>
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
