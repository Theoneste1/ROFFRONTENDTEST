"use client";

/**
 * New test (the reusable FormWizard): Details → Questions (optional) → Paper and marking guide. The test is created as a
 * DRAFT with its questions in one request, then the files are uploaded (private storage), then its page opens.
 * Administrators: any subject; Head Coaches: the subjects they head (the backend refuses any other).
 */
import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { testsApi, type TestFileKind } from "@/lib/api/tests";
import { errorMessage, fieldErrors } from "@/lib/api/errors";
import { queryKeys } from "@/lib/query/keys";
import { formatFileSize, hasAcceptedExtension } from "@/lib/format";
import { firstStepWithError, type WizardPartStep } from "@/lib/forms/wizard";
import {
  EMPTY_DETAILS, TEST_FILE_ACCEPT, TEST_FILE_MAX_BYTES, detailsBody, detailsProblems, moveItem, parseMarks, questionBody,
  questionProblems, sumText, questionSum, TESTS_MANAGE, type DetailsDraft, type DetailsField, type QuestionDraft,
} from "@/lib/test-management/rules";
import FormWizard, { useFormWizard, WIZARD_FORM_CLASS } from "@/app/components/forms/FormWizard";
import { Alert } from "@/app/components/ui/feedback";
import { PageFrame } from "@/app/components/ui/PageFrame";
import { RequirePermission, btnSecondary } from "@/app/admin/components/adminUi";
import { DetailsFields, TestsGate, inputBad, inputCls, inputOk, labelCls } from "./shared";

const DETAIL_FIELDS: DetailsField[] = ["title", "subjectId", "division", "answerFormat", "maxMarks", "opensAt", "closesAt"];
const STEPS: WizardPartStep[] = [
  { id: "details", title: "Details", description: "Title, subject, division, answer format, marks and when it is open.", fields: DETAIL_FIELDS, parts: [{ id: "details", fields: DETAIL_FIELDS, wide: true, order: 0 }] },
  { id: "questions", title: "Questions", description: "Optional. Without questions the test is marked as one total.", fields: ["questions"], parts: [{ id: "questions", fields: ["questions"], wide: true, order: 1 }] },
  { id: "files", title: "Paper and guide", description: "Optional now: you can add or replace them later. PDF or images, at most 20 MB each.", fields: ["paper", "guide"], parts: [{ id: "files", fields: ["paper", "guide"], wide: true, order: 2 }] },
];

type QErrors = Array<Partial<Record<keyof QuestionDraft, string>>>;

export default function TestCreate({ base }: { base: string }) {
  return (
    <TestsGate title="New test">
      <RequirePermission permission={TESTS_MANAGE} title="New test">
        <Create base={base} />
      </RequirePermission>
    </TestsGate>
  );
}

function fileProblem(f: File | null): string | undefined {
  if (!f) return undefined;
  if (!hasAcceptedExtension(f.name, TEST_FILE_ACCEPT)) return "Use a PDF or an image (JPEG, PNG, WebP, GIF, HEIC).";
  if (f.size > TEST_FILE_MAX_BYTES) return `The file is larger than ${formatFileSize(TEST_FILE_MAX_BYTES)}.`;
  return undefined;
}

function Create({ base }: { base: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const ids = useId();
  const wizard = useFormWizard(STEPS);
  const [details, setDetails] = useState<DetailsDraft>(EMPTY_DETAILS);
  const [detailErrors, setDetailErrors] = useState<Partial<Record<DetailsField, string>>>({});
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [qErrors, setQErrors] = useState<QErrors>([]);
  const [qError, setQError] = useState<string | null>(null);
  const [paper, setPaper] = useState<File | null>(null);
  const [guide, setGuide] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const maxMarks = parseMarks(details.maxMarks) ?? 0;
  const marks = questions.map((q) => parseMarks(q.maxMarks) ?? 0);

  function checkQuestions(): boolean {
    const errs: QErrors = questions.map((q, i) => questionProblems(q, maxMarks, marks.reduce((a, m, j) => (j === i ? a : a + m), 0)));
    setQErrors(errs);
    const over = questionSum(maxMarks, marks).over;
    setQError(over ? `The questions total more than the test's ${maxMarks} marks.` : null);
    return errs.every((e) => Object.keys(e).length === 0) && !over;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (submitting) return;
    const de = detailsProblems(details);
    setDetailErrors(de);
    const step = STEPS[wizard.index].id;
    if (step === "details" && Object.keys(de).length) return wizard.showErrors();
    if (step === "questions" && !checkQuestions()) return wizard.showErrors();
    if (step === "files" && (fileProblem(paper) || fileProblem(guide))) return wizard.showErrors();
    if (!wizard.isLast) return wizard.next();
    if (Object.keys(de).length) return wizard.showErrors(0);
    if (!checkQuestions()) return wizard.showErrors(1);

    setSubmitting(true);
    setError(null);
    let id = created;
    try {
      if (!id) {
        const t = await testsApi.create({ ...detailsBody(details), ...(questions.length && { questions: questions.map(questionBody) }) });
        id = t.id;
        setCreated(id);
      }
      for (const [kind, file] of [["paper", paper], ["marking-guide", guide]] as Array<[TestFileKind, File | null]>) {
        if (file) await testsApi.putFile(id, kind, file);
      }
      await qc.invalidateQueries({ queryKey: queryKeys.tests.all });
      router.push(`${base}/${id}`);
    } catch (e) {
      if (!id) {
        const fe = fieldErrors(e, DETAIL_FIELDS);
        setDetailErrors(fe);
        const at = firstStepWithError(STEPS, Object.keys(fe));
        setError(errorMessage(e));
        if (at !== -1) wizard.showErrors(at);
        else wizard.showMessage();
      } else {
        setError(`The test was saved as a draft, but a file could not be uploaded: ${errorMessage(e)}`);
        wizard.showMessage();
      }
      setSubmitting(false);
    }
  }

  const setQ = (i: number, patch: Partial<QuestionDraft>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  const parts = {
    details: <DetailsFields draft={details} onChange={setDetails} errors={detailErrors} />,
    questions: (
      <div className="space-y-3" data-testid="wizard-questions">
        <p className={`text-sm font-medium ${questionSum(maxMarks, marks).over ? "text-red-700" : "text-slate-700"}`} aria-live="polite" data-testid="question-sum">
          {sumText(maxMarks, marks)}
        </p>
        {qError && <Alert tone="error">{qError}</Alert>}
        <ol className="space-y-3">
          {questions.map((q, i) => (
            <li key={i} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-start gap-3">
                <span className="mt-2 text-sm font-bold text-slate-700" aria-hidden="true">{i + 1}.</span>
                <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem]">
                  <div>
                    <label htmlFor={`${ids}-p${i}`} className={labelCls}>Question {i + 1}</label>
                    <textarea id={`${ids}-p${i}`} rows={2} maxLength={5000} className={`${inputCls} ${qErrors[i]?.prompt ? inputBad : inputOk}`} value={q.prompt}
                      onChange={(e) => setQ(i, { prompt: e.target.value })} aria-invalid={!!qErrors[i]?.prompt} aria-describedby={qErrors[i]?.prompt ? `${ids}-p${i}-e` : undefined} />
                    {qErrors[i]?.prompt && <p id={`${ids}-p${i}-e`} className="mt-1 text-xs text-red-700">{qErrors[i]?.prompt}</p>}
                  </div>
                  <div>
                    <label htmlFor={`${ids}-m${i}`} className={labelCls}>Marks</label>
                    <input id={`${ids}-m${i}`} inputMode="numeric" className={`${inputCls} ${qErrors[i]?.maxMarks ? inputBad : inputOk}`} value={q.maxMarks}
                      onChange={(e) => setQ(i, { maxMarks: e.target.value })} aria-invalid={!!qErrors[i]?.maxMarks} aria-describedby={qErrors[i]?.maxMarks ? `${ids}-m${i}-e` : undefined} />
                    {qErrors[i]?.maxMarks && <p id={`${ids}-m${i}-e`} className="mt-1 text-xs text-red-700">{qErrors[i]?.maxMarks}</p>}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <button type="button" className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40" disabled={i === 0} onClick={() => setQuestions((qs) => moveItem(qs, i, -1))} aria-label={`Move question ${i + 1} up`}><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40" disabled={i === questions.length - 1} onClick={() => setQuestions((qs) => moveItem(qs, i, 1))} aria-label={`Move question ${i + 1} down`}><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" className="rounded p-1 text-red-700 hover:bg-red-50" onClick={() => { setQuestions((qs) => qs.filter((_, j) => j !== i)); setQErrors([]); }} aria-label={`Remove question ${i + 1}`}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" className={btnSecondary} onClick={() => setQuestions((qs) => [...qs, { prompt: "", maxMarks: "" }])} data-testid="wizard-add-question">
          Add a question
        </button>
      </div>
    ),
    files: (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {([["paper", "Question paper", paper, setPaper], ["guide", "Marking guide", guide, setGuide]] as const).map(([key, label, file, set]) => {
          const problem = fileProblem(file);
          return (
            <div key={key}>
              <label htmlFor={`${ids}-${key}`} className={labelCls}>{label} <span className="font-normal text-slate-600">(optional)</span></label>
              <input id={`${ids}-${key}`} type="file" accept={TEST_FILE_ACCEPT} className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:font-semibold file:text-indigo-800"
                onChange={(e) => set(e.target.files?.[0] ?? null)} aria-invalid={!!problem} aria-describedby={`${ids}-${key}-d`} data-testid={`wizard-file-${key}`} />
              <p id={`${ids}-${key}-d`} className={`mt-1 text-xs ${problem ? "text-red-700" : "text-slate-600"}`}>
                {problem ?? (file ? `${file.name} · ${formatFileSize(file.size)}` : key === "guide" ? "Seen only by Administrators and the subject's Head Coaches (and, later, its authorised markers)." : "PDF or images, at most 20 MB.")}
              </p>
            </div>
          );
        })}
      </div>
    ),
  };

  return (
    <PageFrame title="New test" description="The test is saved as a draft; you publish it from its page.">
      <div className="max-w-3xl rounded-2xl bg-white p-5 shadow-sm sm:p-6">
        <form onSubmit={onSubmit} noValidate className={WIZARD_FORM_CLASS}>
          <FormWizard
            wizard={wizard}
            steps={STEPS}
            parts={parts}
            label="New test steps"
            submitLabel="Create test"
            submittingLabel="Creating…"
            submitting={submitting}
            notices={error && (
              <Alert tone="error">
                {error} {created && <Link href={`${base}/${created}`} className="font-semibold underline">Open the test</Link>}
              </Alert>
            )}
            footer={<Link href={base} className="text-sm font-medium text-slate-700 underline-offset-2 hover:underline">Cancel</Link>}
          />
        </form>
      </div>
    </PageFrame>
  );
}
