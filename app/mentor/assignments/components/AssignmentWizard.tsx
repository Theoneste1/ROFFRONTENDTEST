"use client";

/**
 * The one assignment wizard (create and edit). It replaces the three earlier
 * copies (create, create/instructions, create/resources) and keeps the
 * stepper design of create/resources and the success screen of create.
 *
 * Backend workflow: mentors prepare assignments; administrators publish.
 * The wizard saves a DRAFT, and can submit it for approval
 * (DRAFT/REJECTED → PENDING_APPROVAL). Editing is allowed only in DRAFT or
 * REJECTED. Course and division are fixed after creation.
 */
import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Send, Save, Trash2 } from "lucide-react";
import { ASSIGNMENT_RULES, BRIEF_UPLOAD, type AssignmentInput } from "@/lib/api/mentor";
import type { MentorAssignment, TeachingScope } from "@/lib/api/types";
import { scopeKey, scopeLabel, useCreateAssignment, useUpdateAssignment } from "@/lib/queries/mentor";
import { errorMessage, fieldErrors } from "@/lib/api/errors";
import { formatDateTime, formatFileSize } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import { Alert, Spinner } from "@/app/components/ui/feedback";
import FilePicker from "@/app/components/ui/FilePicker";
import { ScopeSelect, parseScopeKey } from "../../components/mentorUi";

const STEPS = [
  { id: 1, name: "Basic Info" },
  { id: 2, name: "Instructions" },
  { id: 3, name: "Files" },
  { id: 4, name: "Settings" },
  { id: 5, name: "Review" },
];

const inputCls =
  "w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm";

/** ISO → value for <input type="datetime-local"> in the user's time zone. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface FormState {
  title: string;
  scope: string;
  description: string;
  instructions: string;
  deadline: string; // datetime-local value
  points: string;
  maximumMarks: string;
  allowResubmission: boolean;
  maxResubmissions: string;
  allowLateSubmission: boolean;
}

type Errors = Partial<Record<keyof FormState, string>>;

function validate(step: number, f: FormState, isEdit: boolean, now: number): Errors {
  const e: Errors = {};
  const t = f.title.trim();
  if (step === 1) {
    if (t.length < ASSIGNMENT_RULES.title.min || t.length > ASSIGNMENT_RULES.title.max) e.title = "Title must be 3–200 characters.";
    if (!isEdit && !parseScopeKey(f.scope)) e.scope = "Choose the course and division.";
    if (f.description.trim().length > ASSIGNMENT_RULES.description.max) e.description = "At most 500 characters.";
  }
  if (step === 2) {
    const n = f.instructions.trim().length;
    if (n < ASSIGNMENT_RULES.instructions.min || n > ASSIGNMENT_RULES.instructions.max) e.instructions = "Instructions must be 10–10,000 characters.";
  }
  if (step === 4) {
    if (!f.deadline) e.deadline = "Choose a deadline.";
    else if (new Date(f.deadline).getTime() <= now) e.deadline = "The deadline must be in the future.";
    const p = Number(f.points);
    if (!Number.isInteger(p) || p < ASSIGNMENT_RULES.points.min || p > ASSIGNMENT_RULES.points.max) e.points = "Whole number from 0 to 10,000.";
    const m = Number(f.maximumMarks);
    if (!Number.isInteger(m) || m < ASSIGNMENT_RULES.maximumMarks.min || m > ASSIGNMENT_RULES.maximumMarks.max) e.maximumMarks = "Whole number from 1 to 10,000.";
    if (f.allowResubmission) {
      const r = Number(f.maxResubmissions);
      if (!Number.isInteger(r) || r < 0 || r > ASSIGNMENT_RULES.maxResubmissions.max) e.maxResubmissions = "Whole number from 0 (unlimited) to 50.";
    }
  }
  return e;
}

export default function AssignmentWizard({
  scopes,
  existing,
  initialScope,
}: {
  scopes: TeachingScope[];
  /** Edit mode. */
  existing?: MentorAssignment;
  initialScope?: string;
}) {
  const router = useRouter();
  const now = useNow();
  const isEdit = !!existing;
  const [currentStep, setCurrentStep] = useState(1);
  const [form, setForm] = useState<FormState>(() =>
    existing
      ? {
          title: existing.title,
          scope: `${existing.courseId}:${existing.divisionId}`,
          description: existing.description ?? "",
          instructions: existing.instructions,
          deadline: toLocalInput(existing.deadline),
          points: String(existing.points),
          maximumMarks: String(existing.maximumMarks),
          allowResubmission: existing.allowResubmission,
          maxResubmissions: String(existing.maxResubmissions),
          allowLateSubmission: existing.allowLateSubmission,
        }
      : {
          title: "",
          scope: initialScope && scopes.some((s) => scopeKey(s) === initialScope) ? initialScope : scopes[0] ? scopeKey(scopes[0]) : "",
          description: "",
          instructions: "",
          deadline: "",
          points: "10",
          maximumMarks: "20",
          allowResubmission: false,
          maxResubmissions: "0",
          allowLateSubmission: false,
        },
  );
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState<{ assignment: MentorAssignment; submitted: boolean } | null>(null);

  const create = useCreateAssignment();
  const update = useUpdateAssignment(existing?.id ?? "");
  const saving = create.isPending || update.isPending;
  const saveError = create.error ?? update.error;
  const serverErrors = fieldErrors(saveError, ["title", "description", "instructions", "deadline", "points", "maximumMarks", "maxResubmissions"]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const scope = useMemo(() => scopes.find((s) => scopeKey(s) === form.scope), [scopes, form.scope]);
  const keptAttachments = (existing?.attachments ?? []).filter((a) => !removed.includes(a.id));

  function goTo(step: number) {
    // Moving forward validates every step passed over.
    if (step > currentStep) {
      for (let s = currentStep; s < step; s++) {
        const e = validate(s, form, isEdit, now);
        if (Object.keys(e).length) {
          setErrors(e);
          setCurrentStep(s);
          return;
        }
      }
    }
    setErrors({});
    setCurrentStep(step);
  }

  function buildInput(): AssignmentInput {
    const s = parseScopeKey(form.scope)!;
    return {
      title: form.title.trim(),
      courseId: s.courseId,
      divisionId: s.divisionId,
      description: form.description.trim() || undefined,
      instructions: form.instructions.trim(),
      deadline: new Date(form.deadline).toISOString(),
      points: Number(form.points),
      maximumMarks: Number(form.maximumMarks),
      allowResubmission: form.allowResubmission,
      maxResubmissions: form.allowResubmission ? Number(form.maxResubmissions) : 0,
      allowLateSubmission: form.allowLateSubmission,
    };
  }

  function save(submit: boolean) {
    for (const s of [1, 2, 4]) {
      const e = validate(s, form, isEdit, now);
      if (Object.keys(e).length) {
        setErrors(e);
        setCurrentStep(s);
        return;
      }
    }
    if (saving) return;
    const input = buildInput();
    if (isEdit) {
      const { courseId: _c, divisionId: _d, ...changes } = input;
      void _c;
      void _d;
      update.mutate(
        // An empty description is omitted (the API accepts 1–500 characters, not "").
        { input: changes, addFiles: newFiles, removeAttachmentIds: removed, submit },
        { onSuccess: (a) => setDone({ assignment: a, submitted: submit }) },
      );
    } else {
      create.mutate({ input, files: newFiles, submit }, { onSuccess: (a) => setDone({ assignment: a, submitted: submit }) });
    }
  }

  const err = (k: keyof FormState) => errors[k] ?? serverErrors[k];

  // ── Success (step 6 of the original create wizard) ──
  if (done) {
    return (
      <div className="min-h-screen bg-[#E6EBF2] p-6 sm:p-10 text-slate-800">
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="w-full max-w-xl flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center mb-6 shadow-sm border border-emerald-100">
              <div className="w-16 h-16 rounded-full border-2 border-emerald-500 flex items-center justify-center">
                <Check className="w-8 h-8 text-emerald-500" strokeWidth={2.5} />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {done.submitted ? "Submitted for approval!" : isEdit ? "Changes saved!" : "Assignment saved as draft!"}
            </h1>
            <p className="text-slate-500 text-sm mt-1 mb-8">
              {done.submitted
                ? "An administrator will review and publish it. Students see it once it is published."
                : "It stays a draft, visible only to staff, until you submit it for approval."}
            </p>
            <div className="w-full bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 mb-8 text-left flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight truncate">{done.assignment.title}</h2>
                <p className="text-sm font-medium text-slate-500 mt-1">
                  {done.assignment.course.title} • {done.assignment.division.name} division
                </p>
                <p className="text-xs text-slate-400 mt-1">Due: {formatDateTime(done.assignment.deadline)}</p>
              </div>
              <Link
                href={`/mentor/assignments/${done.assignment.id}`}
                className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shrink-0"
              >
                View Assignment
              </Link>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
              {!isEdit && (
                <button
                  type="button"
                  onClick={() => router.push(`/mentor/assignments/create?new=${Date.now()}`)}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#2A35AF] text-white text-sm font-medium hover:bg-[#232c94] transition-colors shadow-md"
                >
                  Create another Assignment
                </button>
              )}
              <Link
                href="/mentor/assignments"
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white text-slate-700 text-sm font-medium border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm text-center"
              >
                Back to Assignments
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#E6EBF2] p-4 sm:p-10 text-slate-800">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <button
            type="button"
            onClick={() => (currentStep > 1 ? goTo(currentStep - 1) : router.push(isEdit ? `/mentor/assignments/${existing!.id}` : "/mentor/assignments"))}
            className="text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-2 text-sm font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{isEdit ? "Edit Assignment" : "Create Assignment"}</span>
          </button>
        </div>

        {/* Stepper */}
        <div className="bg-white rounded-2xl p-4 mb-8 flex items-center justify-between shadow-sm border border-slate-200">
          <div className="flex items-center gap-6 overflow-x-auto">
            {STEPS.map((step) => {
              const isActive = step.id === currentStep;
              const isCompleted = step.id < currentStep;
              return (
                <button key={step.id} type="button" onClick={() => goTo(step.id)} className="flex items-center gap-2 whitespace-nowrap" aria-current={isActive ? "step" : undefined}>
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                      isActive ? "bg-blue-600 text-white" : isCompleted ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {step.id}
                  </span>
                  <span className={`text-sm font-medium ${isActive ? "text-blue-600 font-semibold" : isCompleted ? "text-slate-700" : "text-slate-400"}`}>{step.name}</span>
                </button>
              );
            })}
          </div>
          <span className="text-sm font-medium text-slate-500 hidden sm:inline-block">
            Step {currentStep} of {STEPS.length}
          </span>
        </div>

        {saveError != null && Object.keys(serverErrors).length === 0 && (
          <div className="mb-6">
            <Alert tone="error">{errorMessage(saveError)}</Alert>
          </div>
        )}

        {/* STEP 1 */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 mb-1">Basic Information</h2>
              <p className="text-slate-500 text-sm">Provide the basic details about your assignment.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
              <div className="space-y-6">
                <Field label="Assignment Title" required error={err("title")} htmlFor="title">
                  <input id="title" type="text" maxLength={200} value={form.title} onChange={(e) => set("title", e.target.value)} className={inputCls} placeholder="e.g. Circle Geometry Problem Set 4" />
                </Field>
                <Field label="Brief Description" error={err("description")} htmlFor="description" hint="Short summary shown in lists.">
                  <div className="relative">
                    <textarea
                      id="description"
                      rows={4}
                      maxLength={500}
                      value={form.description}
                      onChange={(e) => set("description", e.target.value)}
                      className={`${inputCls} resize-none p-4`}
                    />
                    <span className="absolute bottom-3 right-3 text-xs text-slate-400 font-medium">{form.description.length}/500</span>
                  </div>
                </Field>
              </div>
              <div className="space-y-6">
                {isEdit ? (
                  <Field label="Course and division">
                    <p className="text-sm font-semibold text-slate-800">
                      {existing!.course.title} · {existing!.division.name} division
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Fixed after creation.</p>
                  </Field>
                ) : (
                  <div>
                    <ScopeSelect scopes={scopes} value={form.scope} onChange={(v) => set("scope", v)} label="Course and division *" />
                    {err("scope") && <p className="mt-1.5 text-xs text-red-600">{err("scope")}</p>}
                    <p className="mt-1.5 text-xs text-slate-400">Only the course × division pairs assigned to you are listed. Every student of that division receives it.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {currentStep === 2 && (
          <div className="max-w-4xl space-y-6">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 mb-1">Instructions</h2>
              <p className="text-slate-500 text-sm">Add instructions and any specific guidelines for students.</p>
            </div>
            <Field label="Instructions for Students" required error={err("instructions")} htmlFor="instructions">
              <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                <div className="relative p-4">
                  <textarea
                    id="instructions"
                    rows={10}
                    maxLength={10000}
                    value={form.instructions}
                    onChange={(e) => set("instructions", e.target.value)}
                    placeholder={"Attempt all questions.\nShow all steps clearly.\nUpload your work as a PDF."}
                    className="w-full focus:outline-none text-slate-700 text-sm leading-relaxed resize-y bg-transparent"
                  />
                  <span className="absolute bottom-3 right-3 text-xs text-slate-400 font-medium">{form.instructions.length}/10000</span>
                </div>
              </div>
            </Field>
          </div>
        )}

        {/* STEP 3 */}
        {currentStep === 3 && (
          <div className="max-w-4xl space-y-6">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 mb-1">Files</h2>
              <p className="text-slate-500 text-sm">Attach the problem sheet, templates or reference material (optional).</p>
            </div>
            {keptAttachments.length > 0 && (
              <ul className="space-y-2">
                {keptAttachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <span className="text-xs font-medium text-slate-800 truncate flex-1">{a.file.originalName}</span>
                    <span className="text-[10px] text-slate-400">{formatFileSize(a.file.size)}</span>
                    <button type="button" onClick={() => setRemoved((r) => [...r, a.id])} className="p-1 text-slate-400 hover:text-red-600" aria-label={`Remove ${a.file.originalName}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {removed.length > 0 && <p className="text-xs text-amber-700">{removed.length} file(s) will be removed when you save.</p>}
            <FilePicker files={newFiles} onChange={setNewFiles} rules={BRIEF_UPLOAD} existingCount={keptAttachments.length} title="Drag and drop files here, or click to browse" />
          </div>
        )}

        {/* STEP 4 */}
        {currentStep === 4 && (
          <div className="max-w-3xl space-y-6">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 mb-1">Assignment Settings</h2>
              <p className="text-slate-500 text-sm">Set the deadline, submission rules and grading.</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
              <h3 className="text-base font-bold text-slate-900">Submission Settings</h3>
              <Field label="Deadline" required error={err("deadline")} htmlFor="deadline" hint="Your local time.">
                <input id="deadline" type="datetime-local" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} className={`${inputCls} max-w-xs`} />
              </Field>
              <div className="space-y-4 pt-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.allowResubmission}
                    onChange={(e) => set("allowResubmission", e.target.checked)}
                    className="w-4 h-4 mt-0.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-900">Allow resubmission</p>
                    <p className="text-xs text-slate-400">Students can replace their work before the deadline, until a coach starts reviewing it. Needed if you may ask for a new attempt.</p>
                  </div>
                </label>
                {form.allowResubmission && (
                  <div className="pl-7">
                    <Field label="Maximum resubmissions" error={err("maxResubmissions")} htmlFor="maxResubmissions" hint="0 = unlimited.">
                      <input id="maxResubmissions" type="number" min={0} max={50} value={form.maxResubmissions} onChange={(e) => set("maxResubmissions", e.target.value)} className={`${inputCls} w-28`} />
                    </Field>
                  </div>
                )}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.allowLateSubmission}
                    onChange={(e) => set("allowLateSubmission", e.target.checked)}
                    className="w-4 h-4 mt-0.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-900">Accept late submissions</p>
                    <p className="text-xs text-slate-400">A first submission after the deadline is accepted and marked late.</p>
                  </div>
                </label>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-900">Grading</h3>
              <div className="flex items-start gap-8 flex-wrap">
                <Field label="Maximum marks" required error={err("maximumMarks")} htmlFor="maximumMarks" hint="Scores are given out of this.">
                  <input id="maximumMarks" type="number" min={1} max={10000} value={form.maximumMarks} onChange={(e) => set("maximumMarks", e.target.value)} className={`${inputCls} w-28`} />
                </Field>
                <Field label="Leaderboard points" required error={err("points")} htmlFor="points" hint="Awarded in proportion to the score.">
                  <input id="points" type="number" min={0} max={10000} value={form.points} onChange={(e) => set("points", e.target.value)} className={`${inputCls} w-28`} />
                </Field>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5 */}
        {currentStep === 5 && (
          <div className="max-w-3xl space-y-6">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 mb-1">Review &amp; Submit</h2>
              <p className="text-slate-500 text-sm">Check the details. Save a draft, or submit it so an administrator can publish it.</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Title</span>
                <p className="text-lg font-bold text-slate-900">{form.title || "—"}</p>
                {form.description && <p className="text-sm text-slate-500 mt-1">{form.description}</p>}
              </div>
              <ReviewGrid
                items={[
                  ["Course / Division", isEdit ? `${existing!.course.title} · ${existing!.division.name}` : scope ? scopeLabel(scope) : "—"],
                  ["Deadline", form.deadline ? formatDateTime(new Date(form.deadline).toISOString()) : "—"],
                  ["Maximum marks", form.maximumMarks],
                  ["Leaderboard points", form.points],
                  ["Resubmission", form.allowResubmission ? (Number(form.maxResubmissions) > 0 ? `Allowed (up to ${form.maxResubmissions})` : "Allowed (unlimited)") : "Not allowed"],
                  ["Late submissions", form.allowLateSubmission ? "Accepted (marked late)" : "Not accepted"],
                  ["Files", `${keptAttachments.length + newFiles.length} file(s)`],
                  ["Instructions", `${form.instructions.trim().length} characters`],
                ]}
              />
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex flex-wrap items-center justify-end gap-3 mt-12">
          {currentStep > 1 && (
            <button
              type="button"
              onClick={() => goTo(currentStep - 1)}
              disabled={saving}
              className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium text-sm px-6 py-2.5 rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              Back
            </button>
          )}
          {currentStep < 5 ? (
            <button
              type="button"
              onClick={() => goTo(currentStep + 1)}
              className="inline-flex items-center gap-2 bg-indigo-900 hover:bg-indigo-950 text-white font-medium text-sm px-6 py-2.5 rounded-lg shadow-md transition-colors"
            >
              Next <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => save(false)}
                disabled={saving}
                className="inline-flex items-center gap-2 bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 font-medium text-sm px-6 py-2.5 rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                {saving ? <Spinner className="h-4 w-4" /> : <Save className="w-4 h-4" />}
                {isEdit ? "Save changes" : "Save as draft"}
              </button>
              <button
                type="button"
                onClick={() => save(true)}
                disabled={saving}
                className="inline-flex items-center gap-2 bg-indigo-900 hover:bg-indigo-950 text-white font-medium text-sm px-6 py-2.5 rounded-lg shadow-md transition-colors disabled:opacity-50"
              >
                {saving ? <Spinner className="h-4 w-4 !text-white" /> : <Send className="w-4 h-4" />}
                {isEdit ? "Save & submit for approval" : "Submit for approval"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, error, hint, htmlFor, children }: { label: string; required?: boolean; error?: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-slate-800 mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error ? <p className="mt-1.5 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1.5 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

function ReviewGrid({ items }: { items: [string, string][] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-3">
      {items.map(([label, value]) => (
        <div key={label}>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
          <p className="text-sm font-medium text-slate-800">{value}</p>
        </div>
      ))}
    </div>
  );
}
