"use client";

/**
 * Test Management (capability `testManagement`): pieces shared by the Administrator (`/admin/tests`) and Head Coach
 * (`/mentor/tests`) pages — the page gate, the status badge and the details fields (create wizard and Details tab).
 * Rules: lib/test-management/rules.ts. The backend remains the authority (subject scope, every rule).
 */
import { useTestLevelOptions } from "@/lib/queries/divisions";
import { useId, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { testsApi, type TestStatus } from "@/lib/api/tests";
import { useSession } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query/keys";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import {
  ANSWER_FORMAT_OPTIONS, MAX_TEST_MARKS, STATUS_BADGE, testsPageMode, type DetailsDraft, type DetailsField,
} from "@/lib/test-management/rules";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { PageFrame } from "@/app/components/ui/PageFrame";
import { Notice } from "@/app/admin/components/adminUi";

export const inputCls =
  "w-full px-3 py-2 bg-white border rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50 disabled:text-slate-600";
export const inputOk = "border-slate-300 focus:border-indigo-500";
export const inputBad = "border-red-500 focus:border-red-600";
export const labelCls = "block text-sm font-semibold text-slate-700 mb-1";

/** The page when the backend has no Test Management, or the user lacks tests.view; otherwise the children. */
export function TestsGate({ title, children }: { title: string; children: ReactNode }) {
  const { permissionsStatus, can, retry } = useSession();
  const caps = useBackendCapabilities();
  const mode = testsPageMode({ detection: caps.detection, detectionLoading: caps.loading, permissionsStatus, can });
  if (mode === "visible") return <>{children}</>;
  return (
    <PageFrame title={title}>
      {mode === "loading" && <LoadingBlock />}
      {mode === "error" && <ErrorState error={null} title="Couldn't load your permissions" onRetry={retry} />}
      {mode === "unsupported" && <Notice tone="info">This server does not provide Test Management yet.</Notice>}
      {mode === "forbidden" && <Notice tone="info">Tests need the tests.view permission (Administrators, and Head Coaches for the subjects they head).</Notice>}
    </PageFrame>
  );
}

export function StatusBadge({ status }: { status: TestStatus }) {
  const b = STATUS_BADGE[status];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${b.className}`} data-testid="test-status">{b.label}</span>;
}

/** The subjects the caller manages tests in (Administrators: all; Head Coaches: the subjects they head). */
export function useTestSubjects() {
  return useQuery({ queryKey: queryKeys.tests.subjects(), queryFn: testsApi.subjects, staleTime: 60_000 });
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {label} <span className="text-red-600" aria-hidden="true">*</span>
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-700">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-600">{hint}</p>
      ) : null}
    </div>
  );
}

const describe = (id: string, error?: string, hint?: ReactNode) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

/**
 * The details of a test. `only` limits the fields shown (the create wizard spreads them over its steps); `subjectLocked`
 * keeps the subject (a published test keeps its subject).
 */
export function DetailsFields({
  draft, onChange, errors, subjectLocked, only,
}: {
  draft: DetailsDraft;
  onChange: (d: DetailsDraft) => void;
  errors: Partial<Record<DetailsField, string>>;
  subjectLocked?: boolean;
  only?: readonly DetailsField[];
}) {
  const base = useId();
  const subjects = useTestSubjects();
  const levelOptions = useTestLevelOptions();
  const set = <K extends DetailsField>(k: K) => (v: DetailsDraft[K]) => onChange({ ...draft, [k]: v });
  const show = (f: DetailsField) => !only || only.includes(f);
  const id = (f: string) => `${base}-${f}`;
  const cls = (f: DetailsField) => `${inputCls} ${errors[f] ? inputBad : inputOk}`;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {show("title") && (
        <div className="sm:col-span-2">
          <Field id={id("title")} label="Title" error={errors.title}>
            <input id={id("title")} name="title" className={cls("title")} value={draft.title} maxLength={200} onChange={(e) => set("title")(e.target.value)}
              aria-invalid={!!errors.title} aria-describedby={describe(id("title"), errors.title)} />
          </Field>
        </div>
      )}
      {show("subjectId") && (
        <Field id={id("subject")} label="Subject" error={errors.subjectId} hint={subjectLocked ? "A published test keeps its subject." : undefined}>
          <select id={id("subject")} name="subjectId" className={cls("subjectId")} value={draft.subjectId} disabled={subjectLocked || subjects.isPending}
            onChange={(e) => set("subjectId")(e.target.value)} aria-invalid={!!errors.subjectId}
            aria-describedby={describe(id("subject"), errors.subjectId, subjectLocked ? "x" : undefined)}>
            <option value="">{subjects.isPending ? "Loading…" : "Choose a subject"}</option>
            {subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      )}
      {show("division") && (
        <Field id={id("division")} label="Level" error={errors.division} hint="All levels, or one Olympiad level. Students of that level get the test.">
          <select id={id("division")} name="division" className={cls("division")} value={draft.division}
            onChange={(e) => set("division")(e.target.value as DetailsDraft["division"])} aria-invalid={!!errors.division}
            aria-describedby={describe(id("division"), errors.division, "x")}>
            {levelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            {!levelOptions.some((o) => o.value === draft.division) && <option value={draft.division}>{draft.division}</option>}
          </select>
        </Field>
      )}
      {show("answerFormat") && (
        <Field id={id("format")} label="How students answer" error={errors.answerFormat}>
          <select id={id("format")} name="answerFormat" className={cls("answerFormat")} value={draft.answerFormat}
            onChange={(e) => set("answerFormat")(e.target.value as DetailsDraft["answerFormat"])} aria-invalid={!!errors.answerFormat}
            aria-describedby={describe(id("format"), errors.answerFormat)}>
            <option value="">Choose…</option>
            {ANSWER_FORMAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      )}
      {show("maxMarks") && (
        <Field id={id("marks")} label="Maximum marks" error={errors.maxMarks} hint={`Whole marks, 1–${MAX_TEST_MARKS}.`}>
          <input id={id("marks")} name="maxMarks" className={cls("maxMarks")} inputMode="numeric" value={draft.maxMarks}
            onChange={(e) => set("maxMarks")(e.target.value)} aria-invalid={!!errors.maxMarks} aria-describedby={describe(id("marks"), errors.maxMarks, "x")} />
        </Field>
      )}
      {show("opensAt") && (
        <Field id={id("opens")} label="Opens" error={errors.opensAt} hint="Your local time.">
          <input id={id("opens")} name="opensAt" type="datetime-local" className={cls("opensAt")} value={draft.opensAt}
            onChange={(e) => set("opensAt")(e.target.value)} aria-invalid={!!errors.opensAt} aria-describedby={describe(id("opens"), errors.opensAt, "x")} />
        </Field>
      )}
      {show("closesAt") && (
        <Field id={id("closes")} label="Closes" error={errors.closesAt} hint="After it opens.">
          <input id={id("closes")} name="closesAt" type="datetime-local" className={cls("closesAt")} value={draft.closesAt}
            onChange={(e) => set("closesAt")(e.target.value)} aria-invalid={!!errors.closesAt} aria-describedby={describe(id("closes"), errors.closesAt, "x")} />
        </Field>
      )}
    </div>
  );
}
