"use client";

/**
 * Divisions = Olympiad levels (`/admin/divisions`, divisions.manage). With the backend's administrator-managed divisions
 * (capability adminDivisions, owner 2026-11-22): create a division (its code is permanent), edit its name,
 * description and the grades it is suggested for (grades given to a division are taken from the one that had them —
 * every grade stays with exactly one active division), activate or deactivate it (refused while students are in it or
 * a test for it is open), and choose the courses it offers. Older backends: name and description only.
 */
import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2, Plus } from "lucide-react";
import { hasFeature } from "@/lib/api/capabilities";
import { DIVISION_RULES, type DivisionInput } from "@/lib/api/admin";
import { errorMessage, isApiError } from "@/lib/api/errors";
import type { AdminDivision, GradeLevel } from "@/lib/api/types";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { useActiveScopes, useAdminDivisions, useUpdateDivision } from "@/lib/queries/admin";
import { useCreateDivision, useDivisionCourses, useEditDivision, useSetDivisionCourses } from "@/lib/queries/divisions";
import { divisionCodeProblem, gradesText, suggestedGrades } from "@/lib/divisions/divisions";
import { formatNumber } from "@/lib/format";
import { Alert, EmptyState, ErrorState, LoadingBlock, Spinner } from "@/app/components/ui/feedback";
import { Modal, btnPrimary, btnSecondary } from "../components/adminUi";

const GRADES: GradeLevel[] = ["S1", "S2", "S3", "S4", "S5", "S6"];
const input = "w-full text-sm text-gray-800 bg-white border border-gray-300 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-[#00428C]/20 focus:border-[#00428C]";

const ERRORS: Record<string, string> = {
  GRADES_NOT_COVERED: "Every grade S1–S6 must be suggested by exactly one active division.",
  DIVISION_HAS_STUDENTS: "Students are in this division. Move them to another division first (one by one, or in bulk from the Users list).",
  DIVISION_HAS_OPEN_TESTS: "Tests for this division are still open. Wait until they close, or move them to another level.",
  DIVISION_CODE_TAKEN: "A division with this code already exists.",
};
function divisionProblemText(err: unknown): string {
  if (!isApiError(err)) return errorMessage(err);
  const base = ERRORS[err.code] ?? errorMessage(err);
  const problems = (err.details as { problems?: string[] } | undefined)?.problems;
  return Array.isArray(problems) && problems.length ? `${base} ${problems.join("; ")}.` : base;
}

/** Which division each grade is suggested for — the whole mapping at a glance. */
function GradeMap({ divisions }: { divisions: AdminDivision[] }) {
  return (
    <div className="mb-6 flex flex-wrap gap-2" data-testid="grade-map">
      {GRADES.map((g) => {
        const d = divisions.find((x) => x.isActive && suggestedGrades(x).includes(g));
        return (
          <span key={g} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs shadow-sm ring-1 ring-gray-200">
            <strong className="text-gray-900">{g}</strong>
            <span className="text-gray-600">→ {d?.name ?? <span className="text-red-700">none</span>}</span>
          </span>
        );
      })}
    </div>
  );
}

function GradePicker({ value, onChange, divisions, self }: { value: GradeLevel[]; onChange: (v: GradeLevel[]) => void; divisions: AdminDivision[]; self?: string }) {
  return (
    <fieldset>
      <legend className="block text-xs font-semibold text-gray-700 mb-1">Suggested for grades</legend>
      <p className="mb-2 text-[11px] text-gray-600">New students and grade changes follow this. Choosing a grade takes it from the division that has it; existing students are not moved.</p>
      <div className="flex flex-wrap gap-2">
        {GRADES.map((g) => {
          const holder = divisions.find((d) => d.id !== self && d.isActive && suggestedGrades(d).includes(g));
          const on = value.includes(g);
          return (
            <label key={g} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${on ? "border-[#00428C] bg-[#00428C]/5 text-[#00428C]" : "border-gray-300 text-gray-800"}`}>
              <input type="checkbox" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== g) : ([...value, g].sort() as GradeLevel[]))} />
              {g}
              {!on && holder && <span className="text-gray-500">({holder.name})</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function NewDivisionDialog({ divisions, onClose }: { divisions: AdminDivision[]; onClose: () => void }) {
  const create = useCreateDivision();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [grades, setGrades] = useState<GradeLevel[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    const p = divisionCodeProblem(code) ?? (n.length < DIVISION_RULES.name.min || n.length > DIVISION_RULES.name.max ? "Give a name of 2–100 characters." : undefined);
    setProblem(p ?? null);
    if (p) return;
    try {
      await create.mutateAsync({
        code: code.trim().toUpperCase(),
        name: n,
        description: description.trim() || undefined,
        suggestedGrades: grades,
        sortOrder: Math.max(0, ...divisions.map((d) => d.sortOrder ?? 0)) + 1,
      });
      onClose();
    } catch (err) {
      setProblem(divisionProblemText(err));
    }
  }
  return (
    <Modal title="New division" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate data-testid="new-division-form">
        <div>
          <label htmlFor="div-code" className="block text-xs font-semibold text-gray-700 mb-1">Code (permanent)</label>
          <input id="div-code" className={input} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ADVANCED" maxLength={30} />
        </div>
        <div>
          <label htmlFor="div-name" className="block text-xs font-semibold text-gray-700 mb-1">Name</label>
          <input id="div-name" className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Advanced" maxLength={DIVISION_RULES.name.max} />
        </div>
        <div>
          <label htmlFor="div-desc" className="block text-xs font-semibold text-gray-700 mb-1">Description (optional)</label>
          <textarea id="div-desc" rows={2} className={input} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={DIVISION_RULES.description.max} />
        </div>
        <GradePicker value={grades} onChange={setGrades} divisions={divisions} />
        <p className="text-[11px] text-gray-600">A new division offers no course until you choose its courses.</p>
        {problem && <Alert tone="error">{problem}</Alert>}
        <div className="flex gap-2">
          <button type="submit" className={btnPrimary} disabled={create.isPending} data-testid="create-division">{create.isPending ? "Creating…" : "Create division"}</button>
          <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function CoursesOffered({ division }: { division: AdminDivision }) {
  const courses = useDivisionCourses(division.id);
  const save = useSetDivisionCourses(division.id);
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  if (courses.isPending) return <LoadingBlock />;
  if (courses.isError) return <ErrorState error={courses.error} title="Couldn't load the courses" onRetry={() => courses.refetch()} />;
  const current = chosen ?? new Set(courses.data.filter((c) => c.offered).map((c) => c.id));
  const toggle = (id: string) => {
    const n = new Set(current);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setChosen(n);
    setMessage(null);
  };
  return (
    <div data-testid={`division-courses-${division.code}`}>
      {courses.data.length === 0 ? (
        <p className="text-xs text-gray-600">No course exists yet.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {courses.data.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-gray-50">
                <input type="checkbox" checked={current.has(c.id)} onChange={() => toggle(c.id)} />
                <span className="font-semibold text-gray-900">{c.title}</span>
                <span className="text-gray-500">{c.discipline?.name}{c.status !== "PUBLISHED" && ` · ${c.status.toLowerCase()}`}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {message && <div className="mt-2"><Alert tone={message.tone}>{message.text}</Alert></div>}
      <button
        type="button"
        className={`${btnSecondary} mt-3`}
        disabled={save.isPending || chosen === null}
        onClick={async () => {
          try {
            await save.mutateAsync([...current]);
            setChosen(null);
            setMessage({ tone: "success", text: "Courses saved. Students of this division see exactly these." });
          } catch (err) {
            setMessage({ tone: "error", text: divisionProblemText(err) });
          }
        }}
        data-testid={`save-courses-${division.code}`}
      >
        {save.isPending ? "Saving…" : "Save courses"}
      </button>
    </div>
  );
}

function DivisionCard({ division, divisions, mentors, managed }: { division: AdminDivision; divisions: AdminDivision[]; mentors: number | undefined; managed: boolean }) {
  const edit = useEditDivision();
  const legacy = useUpdateDivision();
  const [name, setName] = useState(division.name);
  const [description, setDescription] = useState(division.description ?? "");
  const [grades, setGrades] = useState<GradeLevel[]>(suggestedGrades(division));
  const [showCourses, setShowCourses] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const pending = edit.isPending || legacy.isPending;

  async function run(change: DivisionInput, done: string) {
    setMessage(null);
    try {
      if (managed) await edit.mutateAsync({ id: division.id, input: change });
      else await legacy.mutateAsync({ id: division.id, input: { name: change.name, description: change.description } });
      setMessage({ tone: "success", text: done });
    } catch (err) {
      setMessage({ tone: "error", text: divisionProblemText(err) });
    }
  }
  function save(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (n.length < DIVISION_RULES.name.min || n.length > DIVISION_RULES.name.max) return setMessage({ tone: "error", text: "The name must be 2–100 characters." });
    const changed = n !== division.name || description.trim() !== (division.description ?? "") || gradesText(grades) !== gradesText(suggestedGrades(division));
    if (!changed) return setMessage({ tone: "info", text: "Nothing has changed." });
    void run({ name: n, description: description.trim(), ...(managed && division.isActive ? { suggestedGrades: grades } : {}) }, "Division saved.");
  }

  const students = division._count?.students ?? 0;
  return (
    <form onSubmit={save} className={`bg-white rounded-2xl p-6 shadow-sm border flex flex-col gap-4 ${division.isActive ? "border-gray-100/80" : "border-amber-200"}`} data-testid={`division-${division.code}`}>
      <div>
        <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold text-gray-900">
          {division.name}
          <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-gray-700">{division.code}</span>
          {!division.isActive && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">Inactive</span>}
        </h2>
        <p className="text-xs text-gray-600 mt-0.5 font-medium">
          {gradesText(suggestedGrades(division)) || "No grade suggested"} · {formatNumber(students)} student{students === 1 ? "" : "s"} · {mentors === undefined ? "…" : formatNumber(mentors)} coach{mentors === 1 ? "" : "es"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={`/admin/users?role=STUDENT&divisionId=${division.id}`} className="px-3 py-1.5 border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-xl">View students</Link>
          <Link href={`/admin/mentors?divisionId=${division.id}`} className="px-3 py-1.5 border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-xl">View coaches</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`name-${division.id}`} className="block text-xs font-semibold text-gray-700 mb-1">Name</label>
          <input id={`name-${division.id}`} className={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={DIVISION_RULES.name.max} />
        </div>
        <div>
          <label htmlFor={`desc-${division.id}`} className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
          <input id={`desc-${division.id}`} className={input} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={DIVISION_RULES.description.max} />
        </div>
      </div>
      {managed && division.isActive && <GradePicker value={grades} onChange={setGrades} divisions={divisions} self={division.id} />}

      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={btnPrimary} data-testid={`save-division-${division.code}`}>
          {pending && <Spinner className="h-3.5 w-3.5 !text-white" />} Save
        </button>
        {managed && (
          <button
            type="button"
            className={btnSecondary}
            disabled={pending}
            data-testid={`toggle-division-${division.code}`}
            onClick={() => void run({ isActive: !division.isActive }, division.isActive ? "Division deactivated." : "Division activated.")}
          >
            {division.isActive ? "Deactivate" : "Activate"}
          </button>
        )}
        {managed && (
          <button type="button" className={btnSecondary} onClick={() => setShowCourses((v) => !v)} aria-expanded={showCourses} data-testid={`show-courses-${division.code}`}>
            {showCourses ? "Hide courses" : "Courses offered"}
          </button>
        )}
      </div>
      {managed && showCourses && <CoursesOffered division={division} />}
    </form>
  );
}

export default function DivisionsContent() {
  const divisions = useAdminDivisions();
  const scopes = useActiveScopes();
  const managed = hasFeature(useBackendCapabilities().detection, "adminDivisions");
  const [creating, setCreating] = useState(false);
  const mentorsIn = (divisionId: string) => (scopes.data ? new Set(scopes.data.filter((s) => s.division.id === divisionId).map((s) => s.mentor.id)).size : undefined);
  const sorted = useMemo(() => [...(divisions.data ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.code.localeCompare(b.code)), [divisions.data]);

  return (
    <div className="min-h-screen bg-[#E6EBF2] p-4 sm:p-6 md:p-10 text-gray-800 font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Divisions</h1>
          <p className="text-sm text-gray-600 mt-1 font-medium max-w-2xl">
            {managed
              ? "Each division is an Olympiad level. Students follow the division their grade is suggested for, unless a coach or a user manager sets it. Divisions are never deleted: deactivate one you no longer use."
              : "The ROF LMS has two divisions: Junior (S1–S3) and Senior (S4–S6)."}
          </p>
        </div>
        {managed && (
          <button type="button" className={btnPrimary} onClick={() => setCreating(true)} data-testid="new-division">
            <Plus className="h-4 w-4" aria-hidden="true" /> New division
          </button>
        )}
      </div>

      {divisions.isPending ? (
        <LoadingBlock />
      ) : divisions.isError ? (
        <ErrorState error={divisions.error} title="Couldn't load divisions" onRetry={() => divisions.refetch()} />
      ) : sorted.length === 0 ? (
        <EmptyState title="No divisions yet" description="Divisions are created when the platform is set up." />
      ) : (
        <>
          {managed && <GradeMap divisions={sorted} />}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {sorted.map((d) => (
              <DivisionCard key={`${d.id}-${(d.suggestedGrades ?? []).join()}-${d.isActive}`} division={d} divisions={sorted} mentors={mentorsIn(d.id)} managed={managed} />
            ))}
          </div>
          {managed && (
            <p className="mt-6 inline-flex items-center gap-1.5 text-xs text-gray-600">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" /> Assign a coach to all the courses of a division from Coaches → Assign courses.
            </p>
          )}
        </>
      )}
      {creating && <NewDivisionDialog divisions={sorted} onClose={() => setCreating(false)} />}
    </div>
  );
}
