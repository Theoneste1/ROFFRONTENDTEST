"use client";

/**
 * Review & approval (Test Management Phase 3; tests.review — Administrators, the subject's Head Coaches; design 3,
 * owner-approved 2026-11-26). Status tabs with counts; on wide screens a master–detail: the papers on the left (student
 * — reviewers see identity —, code, school, total, status, marker), the selected paper on the right with its header
 * (total ring, "Approve marks"), the answer pages (the full paper viewer, inline), the marks by question of every
 * marking side by side (first, second, adjusted: marks, comments), the decisions the backend allows now:
 *   approve (locks) · return for correction (mandatory comment) · request an independent second marking (another
 *   authorised coach) · choose the first, the second or an ADJUSTED mark (mandatory reason; tests.adjustMarks — the
 *   subject's Head Coach only, G4: Administrators never edit or adjust marks) · unlock (mandatory reason) · reassign,
 * and the paper's history (decisions, assignments, status and mark changes) newest first. Below lg the paper opens
 * under the list.
 * Two reviewers deciding at once: the second gets a conflict (409) and sees the current state. The backend checks every
 * permission and transition; the screen only hides what the user cannot do (and says why when it matters).
 */
import { useCallback, useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, FileText, Info, Undo2, Users, X } from "lucide-react";
import { testMarkingApi, type MarkingKind, type ReviewDetail, type ReviewRow, type StaffMarking } from "@/lib/api/test-marking";
import { testTrackingApi, type SubmissionStatus } from "@/lib/api/test-submissions";
import { testsApi } from "@/lib/api/tests";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { useSession } from "@/lib/auth/session";
import { actionAllowed } from "@/lib/auth/navigation";
import { queryKeys } from "@/lib/query/keys";
import { formatDateTime, personName } from "@/lib/format";
import { newClientKey } from "@/lib/test-management/submissions";
import {
  COMMENT_MAX, KIND_LABEL, TESTS_ADJUST_MARKS, TESTS_DISTRIBUTE, draftFrom, draftTotal, marksBody, marksProblems, marksText, reasonProblem, type MarksDraft,
} from "@/lib/test-management/marking";
import { SUBMISSION_STATUS } from "@/lib/test-management/marking-status";
import { MarkingStatusBadge } from "@/app/components/marking/MarkingStatusBadge";
import { PaperViewer } from "@/app/components/marking/PaperViewer";
import { ReviewScoreRing } from "@/app/components/marking/ReviewScoreRing";
import { ReviewTimeline } from "@/app/components/marking/ReviewTimeline";
import { Alert, EmptyState, ErrorState } from "@/app/components/ui/feedback";
import { Modal, Notice, SearchInput, TableCard, btnDanger, btnPrimary, btnSecondary, td, th } from "@/app/admin/components/adminUi";
import { CoachDialog, useMarkingOverview } from "./DistributionPanel";
import { inputBad, inputCls, inputOk, labelCls } from "./shared";

type StatusTab = "" | SubmissionStatus;

/** The status tabs, in the reviewer's order of work (the API filters one status at a time). */
const TABS: ReadonlyArray<{ value: StatusTab; label: string; empty: string }> = [
  { value: "MARKED", label: "Awaiting review", empty: "No paper is waiting for your review." },
  { value: "RETURNED", label: "Returned", empty: "No paper is back with its coach for correction." },
  { value: "AWAITING_SECOND_MARKING", label: "Second marking", empty: "No paper is being marked a second time." },
  { value: "MARKING_IN_PROGRESS", label: "In progress", empty: "No coach has a marking in progress." },
  { value: "ASSIGNED", label: "Not started", empty: "Every assigned paper has been started." },
  { value: "SUBMITTED", label: "Not assigned", empty: "Every submitted paper has a coach." },
  { value: "APPROVED", label: "Approved", empty: "No approved result is waiting to be published." },
  { value: "PUBLISHED", label: "Published", empty: "No result is published yet." },
  { value: "", label: "All", empty: "No student has submitted this test yet." },
];

const LIMIT = 20;
const LG = "(min-width: 1024px)";
const focusRing = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00428C] focus-visible:ring-offset-2";
const initials = (p: { firstName: string; lastName: string }) => `${p.firstName.trim()[0] ?? ""}${p.lastName.trim()[0] ?? ""}`.toUpperCase() || "?";
const matches = (query: string) => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
const isWide = () => matches(LG);
function subscribeWide(onChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const mq = window.matchMedia(LG);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** The total a list card shows: the final mark, else the submitted first marking. */
function rowTotal(r: ReviewRow): number | null {
  if (r.final?.totalMarks != null) return r.final.totalMarks;
  if (r.first && r.first.status !== "DRAFT") return r.first.totalMarks;
  return null;
}

export default function ReviewPanel({ testId }: { testId: string }) {
  const [status, setStatus] = useState<StatusTab>("MARKED");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  // undefined: not chosen yet — wide screens then open the first paper of the tab by themselves.
  const [selected, setSelected] = useState<string | null | undefined>(undefined);
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);
  const detailRef = useRef<HTMLDivElement>(null);
  const filters = { status: status || undefined, q: q || undefined, page, limit: LIMIT };
  const list = useQuery({ queryKey: queryKeys.tests.review(testId, filters), queryFn: () => testMarkingApi.list(testId, filters), placeholderData: keepPreviousData });
  // The test itself (already loaded by the page): its maximum marks for the list totals.
  const test = useQuery({ queryKey: queryKeys.tests.detail(testId), queryFn: () => testsApi.get(testId) });
  const maxMarks = test.data?.maxMarks;
  const counts = list.data?.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const rows = list.data?.data;

  // Adjusting state while rendering (React's "derived state" pattern): once, when the tab's papers arrive.
  if (selected === undefined && wide && rows && !list.isPlaceholderData) setSelected(rows.find((r) => r.status !== "SUBMITTED")?.id ?? null);

  const changeTab = (v: StatusTab) => { setStatus(v); setPage(1); setSelected(undefined); };
  const pick = (id: string) => {
    setSelected(id);
    if (!isWide()) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: matches("(prefers-reduced-motion: reduce)") ? "auto" : "smooth", block: "start" }));
    }
  };
  const close = useCallback(() => setSelected(null), []);
  const active = TABS.find((t) => t.value === status) ?? TABS[0];

  return (
    <div className="space-y-5" data-testid="review-panel">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Review &amp; approval</h3>
        <p className="mt-0.5 text-sm text-slate-700">Approve, return for correction, ask for a second marking, choose the mark, unlock. Approved results are locked.</p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Status" data-testid="review-tabs">
        {TABS.map((t) => {
          const on = t.value === status;
          const n = t.value ? counts[t.value] ?? 0 : total;
          return (
            <button
              key={t.value || "all"}
              type="button"
              aria-pressed={on}
              onClick={() => changeTab(t.value)}
              className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold transition-colors ${focusRing} ${on ? "bg-[#00428C] text-white shadow-sm" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              {t.label}
              <span className={`ml-1.5 tabular-nums ${on ? "text-blue-100" : t.value === "RETURNED" && n > 0 ? "text-red-700" : "text-slate-600"}`}>· {list.data ? n : "…"}</span>
            </button>
          );
        })}
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start">
        {/* The papers */}
        <section className="min-w-0 rounded-xl border border-gray-100 bg-white p-3 shadow-sm" aria-label="Papers">
          <div className="mb-3 flex [&>div]:max-w-none">
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search student, school or code" label="Search submissions" />
          </div>
          {list.isPending ? <ListSkeleton /> : list.isError ? (
            <ErrorState error={list.error} title="Couldn't load the submissions" onRetry={() => list.refetch()} />
          ) : list.data.data.length === 0 ? (
            <EmptyState title={q ? "No paper matches your search" : `${active.label}: none`} description={q ? "Check the spelling, or search by the paper's code." : active.empty} />
          ) : (
            <>
              <ul className={`space-y-2 transition-opacity motion-reduce:transition-none ${list.isFetching && list.isPlaceholderData ? "opacity-60" : ""}`} data-testid="review-rows" aria-busy={list.isFetching}>
                {list.data.data.map((r) => <PaperCard key={r.id} r={r} maxMarks={maxMarks} selected={r.id === selected} onOpen={() => pick(r.id)} />)}
              </ul>
              <Pager page={list.data.meta.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} shown={list.data.data.length}
                onPage={setPage} disabled={list.isFetching} />
            </>
          )}
        </section>

        {/* The selected paper */}
        <div ref={detailRef} className="min-w-0 scroll-mt-4">
          {selected ? <ReviewPaper key={selected} testId={testId} submissionId={selected} onClose={close} /> : (
            <div className="hidden rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center lg:block">
              <FileText className="mx-auto h-8 w-8 text-slate-500" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-slate-800">Choose a paper</p>
              <p className="mt-1 text-sm text-slate-600">Its marks, answer pages and history open here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** One paper in the list (the whole card opens it; a paper nobody marks yet has nothing to review). */
function PaperCard({ r, maxMarks, selected, onOpen }: { r: ReviewRow; maxMarks: number | undefined; selected: boolean; onOpen: () => void }) {
  const name = personName(r.student);
  const marker = r.status === "AWAITING_SECOND_MARKING" && r.secondMarker ? r.secondMarker : r.firstMarker;
  const totalMarks = rowTotal(r);
  const body = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-900">{name}</span>
          <span className="block truncate text-xs text-slate-600"><span className="font-mono">{r.publicCode}</span>{r.student.school && ` · ${r.student.school.name}`}</span>
        </span>
        <span className="shrink-0 whitespace-nowrap text-sm font-bold tabular-nums text-slate-900" data-testid="review-row-total">
          {totalMarks ?? "—"}{maxMarks != null && <span className="font-normal text-slate-600"> / {maxMarks}</span>}
        </span>
      </span>
      <span className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <MarkingStatusBadge status={SUBMISSION_STATUS[r.status]} />
        <span className="min-w-0 truncate text-xs text-slate-600">
          {marker ? personName(marker) : r.status === "SUBMITTED" && !r.markable && r.markableAfter ? `Markable after ${formatDateTime(r.markableAfter)}` : "No coach yet"}
          {r.secondMarker && r.firstMarker && marker === r.firstMarker && ` · 2nd: ${personName(r.secondMarker)}`}
        </span>
      </span>
    </>
  );
  const box = "block w-full rounded-lg border p-3 text-left";
  return (
    <li data-testid={`review-${r.student.username}`}>
      {r.status === "SUBMITTED" ? (
        <div className={`${box} border-slate-100 bg-slate-50`}>{body}</div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Review ${name}`}
          aria-current={selected ? "true" : undefined}
          className={`${box} transition-colors ${focusRing} ${selected ? "border-[#00428C] bg-[#00428C]/[0.04] ring-1 ring-[#00428C]" : "border-slate-100 bg-slate-50 hover:border-slate-300 hover:bg-white"}`}
          data-testid={`open-review-${r.student.username}`}
        >
          {body}
        </button>
      )}
    </li>
  );
}

function Pager({ page, totalPages, total, shown, onPage, disabled }: { page: number; totalPages: number; total: number; shown: number; onPage: (p: number) => void; disabled: boolean }) {
  const from = (page - 1) * LIMIT + 1;
  const btn = `inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 ${focusRing}`;
  return (
    <nav className="mt-3 flex items-center justify-between gap-2 px-1" aria-label="Pages of papers">
      <p className="text-xs text-slate-600">Showing {from}–{from + shown - 1} of {total}</p>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" className={btn} onClick={() => onPage(page - 1)} disabled={disabled || page <= 1} aria-label="Previous page"><ArrowLeft className="h-4 w-4" aria-hidden="true" /></button>
          <span className="px-1 text-xs text-slate-700">{page} / {totalPages}</span>
          <button type="button" className={btn} onClick={() => onPage(page + 1)} disabled={disabled || page >= totalPages} aria-label="Next page"><ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
        </div>
      )}
    </nav>
  );
}

const pulse = "animate-pulse rounded bg-slate-200 motion-reduce:animate-none";

function ListSkeleton() {
  return (
    <ul className="space-y-2" role="status" aria-label="Loading the papers">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
          <div className={`${pulse} h-4 w-2/3`} />
          <div className={`${pulse} mt-2 h-3 w-1/2`} />
          <div className={`${pulse} mt-3 h-5 w-28 rounded-full`} />
        </li>
      ))}
    </ul>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading the paper">
      <div className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className={`${pulse} h-12 w-12 rounded-xl`} />
        <div className="flex-1 space-y-2"><div className={`${pulse} h-5 w-1/2`} /><div className={`${pulse} h-3 w-1/3`} /></div>
      </div>
      <div className={`${pulse} h-16 rounded-xl`} />
      <div className={`${pulse} h-56 rounded-xl`} />
    </div>
  );
}

type Decision = "approve" | "return" | "second" | "choose" | "unlock" | "reassign";

function ReviewPaper({ testId, submissionId, onClose }: { testId: string; submissionId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const one = useQuery({ queryKey: queryKeys.tests.reviewDetail(testId, submissionId), queryFn: () => testMarkingApi.get(testId, submissionId) });
  const [notice, setNotice] = useState<string | null>(null);
  const done = async (d: ReviewDetail, message: string) => {
    qc.setQueryData(queryKeys.tests.reviewDetail(testId, submissionId), d);
    await qc.invalidateQueries({ queryKey: queryKeys.tests.all, predicate: (x) => x.queryKey.includes("marking") && !x.queryKey.includes("detail") });
    // Phase 4: an approval or an unlock (G6 withdrawal) changes what Publishing, Results and Rankings show.
    await qc.invalidateQueries({ queryKey: [...queryKeys.tests.all, "results", testId] });
    setNotice(message);
  };
  if (one.isPending) return <DetailSkeleton />;
  if (one.isError) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <ErrorState error={one.error} title="Couldn't load the paper" onRetry={() => one.refetch()} />
      </div>
    );
  }
  return <ReviewBody d={one.data} testId={testId} notice={notice} onNotice={setNotice} onDone={done} onClose={onClose} onConflict={async () => { await one.refetch(); }} />;
}

function ReviewBody({ d, testId, notice, onNotice, onDone, onClose, onConflict }: {
  d: ReviewDetail; testId: string; notice: string | null; onNotice: (m: string | null) => void;
  onDone: (d: ReviewDetail, m: string) => Promise<void>; onClose: () => void; onConflict: () => Promise<void>;
}) {
  const ids = useId();
  const { can, permissionsStatus } = useSession();
  const canChoose = actionAllowed(TESTS_ADJUST_MARKS, permissionsStatus, can);
  const canReassign = actionAllowed(TESTS_DISTRIBUTE, permissionsStatus, can);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [paperOpen, setPaperOpen] = useState(false);
  const overview = useMarkingOverview(testId, decision === "second" || decision === "reassign");
  const columns = useMemo(() => {
    const current = new Set(d.assignments.filter((a) => a.current).map((a) => a.id));
    // Current first / second markings and every adjustment; a marking of an ended assignment is history only.
    return d.markings.filter((m) => m.kind === "ADJUSTMENT" || (m.assignmentId && current.has(m.assignmentId)));
  }, [d]);
  const submitted = columns.filter((m) => m.status === "SUBMITTED" || m.status === "APPROVED");
  const markers = submitted.filter((m) => m.kind !== "ADJUSTMENT");
  const a = d.actions;
  const firstCoach = d.assignments.find((x) => x.current && x.kind === "FIRST")?.coach.id;
  const secondCoach = d.assignments.find((x) => x.current && x.kind === "SECOND")?.coach.id;
  const choiceNeeded = submitted.some((m) => m.kind === "SECOND") && !d.finalMarkingId;
  // The total in the header: the final marking, else the first, else the second.
  const shown = submitted.find((m) => m.final) ?? submitted.find((m) => m.kind === "FIRST") ?? submitted.find((m) => m.kind === "SECOND") ?? null;
  const pages = d.answer?.pages ?? [];

  // Why a decision is not on offer now (plain words; the backend has the last word).
  const why: string[] = [];
  if (a.approve && choiceNeeded) why.push(canChoose ? "Choose a mark first: there is a second marking. Then approve." : "There is a second marking: the subject's Head Coach chooses the mark before it can be approved.");
  if (a.choose && !canChoose) why.push("Only the subject's Head Coach can choose or adjust the mark.");
  if (d.status === "ASSIGNED" || d.status === "MARKING_IN_PROGRESS") why.push("The coach is still marking this paper: there is nothing to decide yet.");
  if (d.status === "AWAITING_SECOND_MARKING") why.push("A second coach is marking it independently: decide once they submit.");
  if (d.status === "RETURNED") why.push("Returned to the coach: decide once the corrected marking is submitted.");

  const secondary = [
    a.requestSecondMarking && <button key="second" type="button" className={`${btnSecondary} min-h-10`} onClick={() => setDecision("second")} data-testid="action-second"><Users className="h-4 w-4" aria-hidden="true" />Request second marking</button>,
    a.return && <button key="return" type="button" className={`${btnSecondary} min-h-10 border-red-200! text-red-800! hover:bg-red-50!`} onClick={() => setDecision("return")} data-testid="action-return"><Undo2 className="h-4 w-4" aria-hidden="true" />Return for correction</button>,
    a.choose && canChoose && <button key="choose" type="button" className={`${btnSecondary} min-h-10`} onClick={() => setDecision("choose")} data-testid="action-choose">Choose or adjust the mark</button>,
    (a.reassignFirst || a.reassignSecond) && canReassign && <button key="reassign" type="button" className={`${btnSecondary} min-h-10`} onClick={() => setDecision("reassign")}>Reassign</button>,
    a.unlock && <button key="unlock" type="button" className={`${btnDanger} min-h-10`} onClick={() => setDecision("unlock")} data-testid="action-unlock">Unlock</button>,
  ].filter(Boolean);

  return (
    <div className="space-y-4" data-testid="review-detail">
      {/* Header */}
      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm" aria-labelledby={`${ids}-name`}>
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-50 text-base font-bold text-[#00428C]" aria-hidden="true">{initials(d.student)}</span>
          <div className="min-w-0 flex-1">
            <h3 id={`${ids}-name`} className="break-words text-xl font-semibold text-slate-900">{personName(d.student)}</h3>
            <p className="mt-0.5 break-words text-sm text-slate-700">
              <span className="font-mono text-xs">{d.publicCode}</span>
              {d.student.school && ` · ${d.student.school.name}`}{d.student.gradeLevel && ` · ${d.student.gradeLevel}`}
              {d.student.username && <span className="text-slate-600"> · @{d.student.username}</span>}
            </p>
            <div className="mt-2"><MarkingStatusBadge status={SUBMISSION_STATUS[d.status]} testId="submission-status" /></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" title="Close this paper" className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 ${focusRing}`}>
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <ReviewScoreRing total={shown?.totalMarks ?? null} max={d.test.maxMarks} caption={shown ? `${KIND_LABEL[shown.kind]}${shown.final ? " (final)" : ""}` : undefined} />
          {a.approve && (
            <button type="button" className={`${btnPrimary} min-h-11 px-5 text-sm`} onClick={() => setDecision("approve")} data-testid="action-approve">
              <Check className="h-4 w-4" aria-hidden="true" />Approve marks
            </button>
          )}
        </div>
      </section>

      {notice && <Notice tone="success" onClose={() => onNotice(null)}>{notice}</Notice>}
      {d.status === "APPROVED" && <Alert tone="info">Approved and locked. Unlock it (with a reason) to change anything.</Alert>}
      {d.status === "PUBLISHED" && (
        <Alert tone="info">
          Published: the student and their school&apos;s teachers can see this result. Unlocking it (with a reason) withdraws it from their views until it is
          approved and published again; they are told once.
        </Alert>
      )}
      {why.length > 0 && (
        <div className="flex gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800" data-testid="review-why">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#00428C]" aria-hidden="true" />
          <ul className="space-y-0.5">{why.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}

      {/* The answer */}
      <section className="rounded-xl border border-gray-100 bg-white shadow-sm" aria-label="Answer">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#00428C]"><FileText className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">
                {d.answer ? <>Answer pages · {pages.length} page{pages.length === 1 ? "" : "s"} · version {d.answer.version}{d.answer.versionCount > 1 && ` of ${d.answer.versionCount}`}</> : "No answer on file"}
              </p>
              <p className="text-xs text-slate-600">{d.answer ? (pages.length ? "Every page of the student's upload" : d.answer.typedAnswer ? "A typed answer" : "Nothing was uploaded") : "The student's answer could not be found."}</p>
            </div>
          </div>
          {d.answer && (pages.length > 0 || d.answer.typedAnswer) && (
            <button type="button" className={`${btnSecondary} min-h-10`} onClick={() => setPaperOpen((o) => !o)} aria-expanded={paperOpen} aria-controls={`${ids}-paper`} data-testid="toggle-paper">
              {paperOpen ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              {paperOpen ? "Hide the paper" : "View the paper"}
            </button>
          )}
        </div>
        {paperOpen && d.answer && (
          <div id={`${ids}-paper`} className="border-t border-slate-100 p-3">
            <PaperViewer
              pages={pages}
              typedAnswer={d.answer.typedAnswer}
              queryKey={["review-paper", testId, d.id, d.answer.versionId]}
              fetchPage={(n) => testTrackingApi.page(testId, d.id, d.answer!.versionId, n)}
              title={`${personName(d.student)} · answer`}
            />
          </div>
        )}
      </section>

      <MarksTable d={d} columns={columns} actions={secondary} />

      <ReviewTimeline d={d} />

      {decision && decision !== "reassign" && decision !== "second" && (
        <DecisionDialog d={d} testId={testId} decision={decision} markers={markers} submitted={submitted}
          onClose={() => setDecision(null)} onDone={onDone} onConflict={onConflict} />
      )}
      {decision === "second" && overview.data && (
        <CoachDialog o={overview.data} title="Request a second marking" confirmLabel="Request" reasonRequired={false}
          exclude={[firstCoach, secondCoach].filter((x): x is string => !!x)}
          onSubmit={async (coachId, reason) => {
            await run(onConflict, async () => onDone(await testMarkingApi.requestSecondMarking(testId, d.id, { coachId, ...(reason && { reason }), clientKey: newClientKey(), expectedStatus: d.status }),
              "A second coach marks it independently; they cannot see the first marks."));
          }}
          onClose={() => setDecision(null)} />
      )}
      {decision === "reassign" && overview.data && (
        <CoachDialog o={overview.data} title="Reassign" confirmLabel="Reassign" reasonRequired
          kinds={a.reassignFirst && a.reassignSecond ? ["FIRST", "SECOND"] : a.reassignSecond ? ["SECOND"] : ["FIRST"]}
          exclude={[firstCoach, secondCoach].filter((x): x is string => !!x)}
          onSubmit={async (coachId, reason, kind) => {
            await run(onConflict, async () => onDone(await testMarkingApi.reassign(testId, d.id, { coachId, reason, kind }), "Reassigned."));
          }}
          onClose={() => setDecision(null)} />
      )}
      {(decision === "second" || decision === "reassign") && overview.isError && (
        <ErrorState error={overview.error} title="Couldn't load the coaches" onRetry={() => overview.refetch()} />
      )}
    </div>
  );
}

/** Every current marking side by side: marks per question (of the maximum), each coach's comments, the totals. */
function MarksTable({ d, columns, actions }: { d: ReviewDetail; columns: StaffMarking[]; actions: ReactNode[] }) {
  const several = columns.length > 1;
  const withComments = columns.filter((m) => m.comment);
  const commentOf = (m: StaffMarking, questionId: string) => m.scores.find((x) => x.questionId === questionId)?.comment ?? null;
  const anyQuestionComment = d.test.questions.some((q) => columns.some((m) => commentOf(m, q.id)));
  const actionRow = actions.length > 0 && <div className="flex flex-wrap gap-2" data-testid="review-actions">{actions}</div>;
  return (
    <section aria-labelledby="review-marks-title">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h3 id="review-marks-title" className="text-lg font-semibold text-slate-900">Marks by question</h3>
        {columns.length === 1 && (
          <p className="text-xs text-slate-600">
            {KIND_LABEL[columns[0].kind]} by <b className="font-semibold text-slate-800">{personName(columns[0].marker)}</b>
            {columns[0].submittedAt ? ` · submitted ${formatDateTime(columns[0].submittedAt)}` : " · not submitted"}
          </p>
        )}
      </div>
      {columns.length === 0 ? (
        <div className="space-y-4 rounded-xl border border-gray-100 bg-white p-5 text-sm text-slate-700 shadow-sm">
          <p>Not marked yet.</p>
          {actionRow}
        </div>
      ) : (
        <TableCard
          tableClassName="text-sm"
          footer={(withComments.length > 0 || actionRow) && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-slate-50 px-4 py-3 sm:px-6">
              <div className="min-w-0 flex-1 space-y-1 text-sm text-slate-700">
                {withComments.map((m) => (
                  <p key={m.id} className="break-words">
                    {several ? `${KIND_LABEL[m.kind]} (${personName(m.marker)})` : "Coach's"} overall comment: <span className="text-slate-900">“{m.comment}”</span>
                  </p>
                ))}
              </div>
              {actionRow}
            </div>
          )}
        >
          <thead>
            <tr className="border-b border-gray-100">
              <th scope="col" className={th}>Question</th>
              {columns.map((m) => (
                <th key={m.id} scope="col" className={`${th} ${m.final ? "bg-emerald-50" : ""}`} data-testid={`column-${m.kind}`}>
                  {several ? KIND_LABEL[m.kind] : "Marks"}{m.final && " (final)"}
                  {several && (
                    <span className="mt-0.5 block font-medium normal-case tracking-normal text-slate-700">
                      {personName(m.marker)}
                      <span className="block font-normal text-slate-600">{m.submittedAt ? formatDateTime(m.submittedAt) : m.status === "DRAFT" ? "Draft, not submitted" : m.status === "RETURNED" ? "Returned" : ""}</span>
                    </span>
                  )}
                </th>
              ))}
              {anyQuestionComment && <th scope="col" className={th}>{several ? "Comments" : "Coach's comment"}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/80">
            {d.test.questions.map((q) => (
              <tr key={q.id}>
                <th scope="row" className={`${td} min-w-[10rem] text-left font-normal text-slate-800`}>
                  <span className="font-semibold">Q{q.order}.</span> <span className="line-clamp-2">{q.prompt}</span>
                </th>
                {columns.map((m) => {
                  const s = m.scores.find((x) => x.questionId === q.id);
                  return (
                    <td key={m.id} className={`${td} whitespace-nowrap font-semibold tabular-nums text-[#00428C]`}>
                      {s?.marks ?? "—"}<span className="font-normal text-slate-600"> / {q.maxMarks}</span>
                    </td>
                  );
                })}
                {anyQuestionComment && (
                  <td className={`${td} min-w-[12rem] text-slate-700`}>
                    {several ? (
                      <ul className="space-y-0.5">
                        {columns.filter((m) => commentOf(m, q.id)).map((m) => <li key={m.id}><span className="text-slate-600">{KIND_LABEL[m.kind]}:</span> {commentOf(m, q.id)}</li>)}
                      </ul>
                    ) : commentOf(columns[0], q.id) ?? "—"}
                  </td>
                )}
              </tr>
            ))}
            <tr className="bg-slate-50 font-bold">
              <th scope="row" className={`${td} text-left text-slate-900`}>Total</th>
              {columns.map((m) => (
                <td key={m.id} className={`${td} whitespace-nowrap tabular-nums text-slate-900`}>
                  <span data-testid={`total-${m.kind}`}>{m.status === "DRAFT" ? "draft" : m.totalMarks ?? "—"}</span>
                  <span className="font-normal text-slate-600"> / {d.test.maxMarks}</span>
                </td>
              ))}
              {anyQuestionComment && <td className={td} />}
            </tr>
          </tbody>
        </TableCard>
      )}
    </section>
  );
}

/** A 409 (someone else decided meanwhile): reload the submission, then show the error. */
async function run(onConflict: () => Promise<void>, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    if (isApiError(e) && e.status === 409) await onConflict();
    throw e;
  }
}

function DecisionDialog({ d, testId, decision, markers, submitted, onClose, onDone, onConflict }: {
  d: ReviewDetail; testId: string; decision: Exclude<Decision, "reassign" | "second">; markers: StaffMarking[]; submitted: StaffMarking[];
  onClose: () => void; onDone: (d: ReviewDetail, m: string) => Promise<void>; onConflict: () => Promise<void>;
}) {
  const ids = useId();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"FIRST" | "SECOND">(markers[0]?.kind === "SECOND" ? "SECOND" : "FIRST");
  const [source, setSource] = useState<MarkingKind>(submitted.some((m) => m.kind === "SECOND") ? "SECOND" : "FIRST");
  // Adjusted marks start from the marks they replace: the final ones, else the latest independent marking (as the backend logs it).
  const base = submitted.find((m) => m.final) ?? submitted.find((m) => m.kind === "SECOND") ?? submitted.find((m) => m.kind === "FIRST") ?? null;
  const [marks, setMarks] = useState<MarksDraft>(() => draftFrom(d.test.questions, base));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => newClientKey());
  const twoMarkings = markers.length > 1;
  const choiceNeeded = decision === "approve" && submitted.some((m) => m.kind === "SECOND") && !d.finalMarkingId;
  const spec = {
    approve: { title: "Approve these marks?", label: "Approve", text: null as null | { label: string; max: number; hint: string } },
    return: { title: "Return for correction", label: "Return to the coach", text: { label: "What the coach must correct", max: COMMENT_MAX, hint: `Required: the coach reads this (3 to ${COMMENT_MAX} characters).` } },
    choose: { title: "Choose the mark that counts", label: "Confirm", text: { label: "Reason", max: 500, hint: "Required (3 to 500 characters); kept in the paper's history." } },
    unlock: {
      title: d.status === "PUBLISHED" ? "Unlock and withdraw this published result?" : "Unlock this approved result?",
      label: d.status === "PUBLISHED" ? "Unlock and withdraw" : "Unlock", text: { label: "Reason", max: 500, hint: "Required (3 to 500 characters); kept in the paper's history." },
    },
  }[decision];

  async function submit(e: FormEvent) {
    e.preventDefault();
    const p: Record<string, string> = {};
    if (spec.text) {
      const rp = reasonProblem(text, spec.text.max);
      if (rp) p.text = rp;
    }
    if (decision === "choose" && source === "ADJUSTMENT") Object.assign(p, marksProblems(d.test.questions, d.test.maxMarks, marks, true));
    setErrors(p);
    if (Object.keys(p).length) return;
    setBusy(true);
    setError(null);
    const common = { clientKey: key, expectedStatus: d.status };
    try {
      await run(onConflict, async () => {
        if (decision === "approve") await onDone(await testMarkingApi.approve(testId, d.id, common), "Approved: the result is locked.");
        else if (decision === "return") await onDone(await testMarkingApi.returnForCorrection(testId, d.id, { ...common, comment: text.trim(), ...(twoMarkings && { kind }) }), "Returned to the marker for correction.");
        else if (decision === "unlock") await onDone(await testMarkingApi.unlock(testId, d.id, { ...common, reason: text.trim() }),
          d.status === "PUBLISHED" ? "Unlocked and withdrawn: the student and their teachers no longer see it until it is published again." : "Unlocked: it can be reviewed again.");
        else await onDone(await testMarkingApi.choose(testId, d.id, {
          ...common, source, reason: text.trim(), ...(source === "ADJUSTMENT" && { marks: marksBody(d.test.questions, marks) }),
        }), source === "ADJUSTMENT" ? "Adjusted marks recorded as the final mark." : `The ${source === "FIRST" ? "first" : "second"} marking is the final mark.`);
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={spec.title} onClose={busy ? () => undefined : onClose} wide={decision === "choose"}>
      <form onSubmit={submit} noValidate className="space-y-4" data-testid={`decision-${decision}`}>
        {error && <Alert tone="error">{error}</Alert>}
        {decision === "approve" && (choiceNeeded
          ? <Alert tone="error">Two markings exist: the subject&apos;s Head Coach chooses the mark first.</Alert>
          : <p className="text-sm text-slate-700">The final mark becomes approved and locked.</p>)}
        {decision === "return" && twoMarkings && (
          <fieldset>
            <legend className={labelCls}>Which marking</legend>
            {markers.map((m) => (
              <label key={m.id} className="mr-4 inline-flex min-h-10 items-center gap-2 text-sm text-slate-900">
                <input type="radio" name={`${ids}-kind`} checked={kind === m.kind} onChange={() => setKind(m.kind as "FIRST" | "SECOND")} /> {KIND_LABEL[m.kind]} ({personName(m.marker)})
              </label>
            ))}
          </fieldset>
        )}
        {decision === "choose" && (
          <fieldset>
            <legend className={labelCls}>The mark that counts</legend>
            <div className="flex flex-wrap gap-x-4">
              {submitted.filter((m) => m.kind !== "ADJUSTMENT").map((m) => (
                <label key={m.id} className="inline-flex min-h-10 items-center gap-2 text-sm text-slate-900">
                  <input type="radio" name={`${ids}-source`} checked={source === m.kind} onChange={() => setSource(m.kind)} data-testid={`choose-${m.kind}`} />
                  {KIND_LABEL[m.kind]} — {marksText(m.totalMarks, d.test.maxMarks)}
                </label>
              ))}
              <label className="inline-flex min-h-10 items-center gap-2 text-sm text-slate-900">
                <input type="radio" name={`${ids}-source`} checked={source === "ADJUSTMENT"} onChange={() => setSource("ADJUSTMENT")} data-testid="choose-ADJUSTMENT" /> Adjusted marks
              </label>
            </div>
          </fieldset>
        )}
        {decision === "choose" && source === "ADJUSTMENT" && (
          <AdjustFields d={d} marks={marks} setMarks={setMarks} errors={errors} />
        )}
        {spec.text && (
          <div>
            <label htmlFor={`${ids}-text`} className={labelCls}>{spec.text.label} <span className="text-red-700" aria-hidden="true">*</span></label>
            <p id={`${ids}-text-h`} className="mb-1 text-xs text-slate-600">{spec.text.hint}</p>
            <textarea id={`${ids}-text`} rows={3} maxLength={spec.text.max} required className={`${inputCls} ${errors.text ? inputBad : inputOk}`} value={text}
              onChange={(e) => setText(e.target.value)} aria-invalid={!!errors.text} aria-describedby={errors.text ? `${ids}-text-h ${ids}-text-e` : `${ids}-text-h`} data-testid="decision-text" />
            {errors.text && <p id={`${ids}-text-e`} className="mt-1 text-xs text-red-700">{errors.text}</p>}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" className={`${btnSecondary} min-h-10`} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={`${decision === "unlock" ? btnDanger : btnPrimary} min-h-10`} disabled={busy || choiceNeeded} data-testid="decision-confirm">
            {busy ? "Saving…" : spec.label}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** The adjusted marks (the subject's Head Coach only — G4), starting from the marks they replace. */
function AdjustFields({ d, marks, setMarks, errors }: { d: ReviewDetail; marks: MarksDraft; setMarks: (f: (m: MarksDraft) => MarksDraft) => void; errors: Record<string, string> }) {
  const ids = useId();
  const total = draftTotal(d.test.questions, marks);
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-3" data-testid="adjust-fields">
      {d.test.questions.length === 0 ? (
        <div className="max-w-[12rem]">
          <label htmlFor={`${ids}-total`} className={labelCls}>Total (of {d.test.maxMarks})</label>
          <input id={`${ids}-total`} inputMode="numeric" className={`${inputCls} ${errors.total ? inputBad : inputOk}`} value={marks.total}
            onChange={(e) => setMarks((m) => ({ ...m, total: e.target.value }))} aria-invalid={!!errors.total} />
          {errors.total && <p className="mt-1 text-xs text-red-700">{errors.total}</p>}
        </div>
      ) : d.test.questions.map((q) => {
        const k = `q:${q.id}`;
        const v = marks.scores[q.id] ?? { marks: "", comment: "" };
        return (
          <div key={q.id} className="flex flex-wrap items-center gap-2">
            <label htmlFor={`${ids}-${q.id}`} className="w-40 text-sm text-slate-800">Question {q.order} (of {q.maxMarks})</label>
            <input id={`${ids}-${q.id}`} inputMode="numeric" className={`${inputCls} ${errors[k] ? inputBad : inputOk} max-w-[7rem]`} value={v.marks}
              onChange={(e) => setMarks((m) => ({ ...m, scores: { ...m.scores, [q.id]: { ...v, marks: e.target.value } } }))}
              aria-invalid={!!errors[k]} data-testid={`adjust-q${q.order}`} />
            {errors[k] && <span className="text-xs text-red-700">{errors[k]}</span>}
          </div>
        );
      })}
      <p className="text-sm font-semibold text-slate-900">Adjusted total: {marksText(total, d.test.maxMarks)}</p>
    </div>
  );
}
