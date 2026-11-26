/**
 * One paper's history for the Head Coach review (design 3): the reviewers' decisions, the marker assignments, the
 * status changes and the mark changes merged by date, newest first, with a coloured dot (tone) per event, who did it
 * and the comment or reason. A status change recorded with a decision or an assignment at the same moment is shown
 * once (the decision / assignment says more).
 */
import type { ReviewAction, ReviewDetail } from "@/lib/api/test-marking";
import type { SubmissionStatus } from "@/lib/api/test-submissions";
import { formatDateTime, personName } from "@/lib/format";
import { ASSIGNMENT_METHOD_LABEL, KIND_LABEL, REVIEW_ACTION_LABEL } from "@/lib/test-management/marking";
import { SUBMISSION_STATUS, TONE_DOT, type MarkingTone } from "@/lib/test-management/marking-status";

export interface ReviewEvent {
  key: string;
  at: string;
  tone: MarkingTone;
  title: string;
  detail?: string | null;
}

const ACTION_TONE: Record<ReviewAction, MarkingTone> = {
  APPROVED: "green", RETURNED: "red", SECOND_MARKING_REQUESTED: "indigo", MARK_CHOSEN: "amber", UNLOCKED: "amber",
};

const STATUS_PHRASE: Record<SubmissionStatus, string> = {
  SUBMITTED: "Submitted by the student",
  ASSIGNED: "Assigned to a coach",
  MARKING_IN_PROGRESS: "Marking started",
  MARKED: "Marking submitted",
  AWAITING_SECOND_MARKING: "Second marking requested",
  RETURNED: "Returned for correction",
  APPROVED: "Approved",
  PUBLISHED: "Result published",
};

const SAME_MOMENT_MS = 3000;
const ms = (iso: string) => new Date(iso).getTime();
const by = (p: { firstName: string; lastName: string } | null | undefined) => (p ? ` by ${personName(p)}` : "");
const quoted = (s: string | null | undefined) => (s ? `“${s}”` : null);

export function reviewEvents(d: ReviewDetail): ReviewEvent[] {
  const out: ReviewEvent[] = [];
  for (const r of d.reviews) {
    out.push({
      key: `r-${r.id}`, at: r.createdAt, tone: ACTION_TONE[r.action],
      title: `${REVIEW_ACTION_LABEL[r.action]}${r.chosenKind ? ` (${KIND_LABEL[r.chosenKind].toLowerCase()})` : ""}${by(r.actor)}`,
      detail: quoted(r.comment),
    });
  }
  for (const a of d.assignments) {
    out.push({
      key: `a-${a.id}`, at: a.assignedAt, tone: a.kind === "SECOND" ? "indigo" : "blue",
      title: `${a.kind === "SECOND" ? "Second marking assigned" : "Assigned"} to ${personName(a.coach)} (${ASSIGNMENT_METHOD_LABEL[a.method]})${by(a.assignedBy)}`,
      detail: quoted(a.reason),
    });
    if (a.endedAt) {
      out.push({ key: `e-${a.id}`, at: a.endedAt, tone: "neutral", title: `${personName(a.coach)} no longer marks it${by(a.endedBy)}`, detail: quoted(a.endReason) });
    }
  }
  // A status change at the same moment as a decision or an assignment is that decision / assignment.
  const covered = (s: { toStatus: SubmissionStatus; createdAt: string }) => {
    const t = ms(s.createdAt);
    if (d.reviews.some((r) => r.toStatus === s.toStatus && Math.abs(ms(r.createdAt) - t) < SAME_MOMENT_MS)) return true;
    return (s.toStatus === "ASSIGNED" || s.toStatus === "AWAITING_SECOND_MARKING")
      && d.assignments.some((a) => Math.abs(ms(a.assignedAt) - t) < SAME_MOMENT_MS);
  };
  d.statusHistory.forEach((s, i) => {
    if (covered(s)) return;
    const marking = s.toStatus === "MARKED" ? d.markings.find((m) => m.marker.id === s.actor?.id && m.kind !== "ADJUSTMENT") : undefined;
    out.push({
      key: `s-${i}`, at: s.createdAt, tone: SUBMISSION_STATUS[s.toStatus].tone,
      title: `${STATUS_PHRASE[s.toStatus]}${s.toStatus === "SUBMITTED" ? "" : by(s.actor)}`,
      detail: quoted(s.reason) ?? (marking?.totalMarks != null ? `Total ${marking.totalMarks} / ${d.test.maxMarks}` : null),
    });
  });
  // Mark changes: one event per marking and moment (an adjustment changes several questions at once).
  const groups = new Map<string, typeof d.markChanges>();
  for (const c of d.markChanges) {
    const g = [...groups.entries()].find(([, list]) => list[0].markingId === c.markingId && Math.abs(ms(list[0].createdAt) - ms(c.createdAt)) < SAME_MOMENT_MS);
    if (g) g[1].push(c);
    else groups.set(c.id, [c]);
  }
  for (const [id, list] of groups) {
    const first = list[0];
    const m = d.markings.find((x) => x.id === first.markingId);
    const parts = list.map((c) => {
      const q = d.test.questions.find((x) => x.id === c.questionId);
      return `${q ? `Q${q.order}` : "Total"}: ${c.oldMarks ?? "—"} → ${c.newMarks ?? "—"}`;
    });
    out.push({
      key: `m-${id}`, at: first.createdAt, tone: "amber",
      title: `Marks changed (${m ? KIND_LABEL[m.kind].toLowerCase() : "marking"})${by(first.changedBy)}`,
      detail: [parts.join(" · "), quoted(first.reason)].filter(Boolean).join(" — "),
    });
  }
  return out.sort((a, b) => ms(b.at) - ms(a.at));
}

export function ReviewTimeline({ d }: { d: ReviewDetail }) {
  const events = reviewEvents(d);
  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm" aria-labelledby="review-history-title" data-testid="review-history">
      <h3 id="review-history-title" className="text-lg font-semibold text-slate-900">History</h3>
      {events.length === 0 ? <p className="mt-3 text-sm text-slate-600">Nothing recorded yet.</p> : (
        <ol className="mt-4 space-y-4">
          {events.map((e) => (
            <li key={e.key} className="flex gap-3">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[e.tone]}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="text-sm font-medium text-slate-900">{e.title}</p>
                  <time dateTime={e.at} className="whitespace-nowrap font-mono text-xs text-slate-600">{formatDateTime(e.at)}</time>
                </div>
                {e.detail && <p className="mt-0.5 break-words text-sm text-slate-700">{e.detail}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
