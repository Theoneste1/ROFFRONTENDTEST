"use client";

/**
 * School Access (owner approvals TS-1…TS-6, 2026-11-18; users.manageTeachers): one school's teachers and students
 * side by side. The administrator picks students (checkboxes, filters, select all on the page) and assigns them to a
 * teacher, removes assignments, or gives / takes back a teacher's permission for exactly those students. Every action
 * shows a confirmation summary first and the per-student results after (assigned, skipped, failed and why). The
 * backend decides everything: who a teacher sees, who may be assigned, what a permission covers.
 *
 * GET /admin/schools/:id/access, GET …/access/students, POST /admin/teacher-students, DELETE …/:id,
 * POST /admin/teachers/:id/delegations (SELECTED), POST / DELETE …/delegations/:overrideId/students, POST …/reviewed.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import {
  teachersAdminApi, TEACHER_DELEGATIONS, type PersonRef, type SchoolAccessStudent, type TeacherDelegation,
} from "@/lib/api/accounts";
import { usersApi } from "@/lib/api/admin";
import type { GradeLevel } from "@/lib/api/types";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { personName, formatNumber } from "@/lib/format";
import StudentName from "@/app/components/students/StudentName";
import { queryKeys } from "@/lib/query/keys";
import { useSession } from "@/lib/auth/session";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import {
  DELEGATION_LABEL, MAX_STUDENTS_PER_REQUEST, assignReasonProblem, grantSelected, outcomeSummary, problemLines, scopeText,
  teacherStudentAccessSupported, type ItemResult,
} from "@/lib/accounts/teacher-student-access";
import { Alert, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import {
  AdminPage, Badge, Card, MetricCard, Modal, Notice, SearchInput, TableCard, TableMessage, btnPrimary, btnSecondary, linkBtn, td, th,
} from "../../../components/adminUi";
import { FilterBar } from "@/app/components/ui/FilterBar";
import { GRADES, SelectInput, TextInput } from "../../../users/components/userUi";

const PAGE_SIZE = 25;
type Action = "assign" | "grant" | "revoke";
const ACTION_TITLE: Record<Action, string> = {
  assign: "Assign the selected students to a teacher",
  grant: "Give a teacher a permission for the selected students",
  revoke: "Take a teacher's permission back for the selected students",
};

export default function SchoolAccess({ schoolId }: { schoolId: string }) {
  const { can } = useSession();
  const caps = useBackendCapabilities();
  const tsa = teacherStudentAccessSupported(caps.detection);
  const allowed = can("users.manageTeachers");
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [grade, setGrade] = useState<"" | GradeLevel>("");
  const [verification, setVerification] = useState<"" | "VERIFIED" | "PENDING">("");
  const [assigned, setAssigned] = useState<"" | "true" | "false">("");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [page, setPage] = useState(1);
  const filters = {
    q: q || undefined, gradeLevel: grade || undefined, verification: verification || undefined,
    assigned: assigned === "" ? undefined : assigned === "true", teacherId: teacherFilter || undefined, page, limit: PAGE_SIZE,
  };

  const access = useQuery({ queryKey: queryKeys.accounts.schoolAccess(schoolId), queryFn: () => teachersAdminApi.schoolAccess(schoolId), enabled: tsa && allowed });
  const students = useQuery({
    queryKey: queryKeys.accounts.schoolAccessStudents(schoolId, filters),
    queryFn: () => teachersAdminApi.schoolAccessStudents(schoolId, filters),
    enabled: tsa && allowed,
  });

  // The selection survives paging and filtering (names kept for the summary and the results).
  const [selected, setSelected] = useState<Map<string, SchoolAccessStudent>>(new Map());
  const [action, setAction] = useState<Action | null>(null);
  const [result, setResult] = useState<{ title: string; results: ItemResult[] } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: queryKeys.accounts.schoolAccess(schoolId) });

  const end = useMutation({
    mutationFn: (assignmentId: string) => teachersAdminApi.endStudentAssignment(assignmentId),
    onSuccess: () => { setNotice("The assignment was ended. It stays in the history."); refresh(); },
    onError: (e) => setNotice(errorMessage(e)),
  });
  const reviewed = useMutation({
    mutationFn: (v: { teacherId: string; overrideId: string }) => teachersAdminApi.markReviewed(v.teacherId, v.overrideId),
    onSuccess: () => refresh(),
    onError: (e) => setNotice(errorMessage(e)),
  });

  const back = (
    <Link href={`/admin/schools/${schoolId}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 mb-4">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to the school
    </Link>
  );
  if (!allowed) return <AdminPage title="Teacher & student access">{back}<ErrorState error={null} title="You don't have permission to manage teacher access." /></AdminPage>;
  if (!tsa && caps.loading) return <AdminPage title="Teacher & student access">{back}<LoadingBlock /></AdminPage>;
  if (!tsa) return <AdminPage title="Teacher & student access">{back}<Notice tone="info">This server does not offer teacher–student access yet.</Notice></AdminPage>;
  if (access.isPending) return <AdminPage title="Teacher & student access">{back}<LoadingBlock /></AdminPage>;
  if (access.isError) return <AdminPage title="Teacher & student access">{back}<ErrorState error={access.error} title="Couldn't load this school's access" onRetry={() => access.refetch()} /></AdminPage>;

  const a = access.data;
  const rows = students.data?.data ?? [];
  const pageIds = rows.map((s) => s.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggle = (s: SchoolAccessStudent) => setSelected((m) => { const n = new Map(m); if (n.has(s.id)) n.delete(s.id); else n.set(s.id, s); return n; });
  const togglePage = () => setSelected((m) => {
    const n = new Map(m);
    if (allOnPage) for (const s of rows) n.delete(s.id);
    else for (const s of rows) if (n.size < MAX_STUDENTS_PER_REQUEST) n.set(s.id, s);
    return n;
  });
  const nameOf = (id: string) => { const s = selected.get(id); return s ? personName(s) : undefined; };
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  return (
    <AdminPage title={`Teacher & student access — ${a.school.name}`} description="Which teachers work with which students of this school, and what they may do for them.">
      {back}
      {notice && <Notice tone="info" onClose={() => setNotice(null)}>{notice}</Notice>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6" data-testid="access-counts">
        <MetricCard label="Teachers" value={formatNumber(a.teachers.length)} />
        <MetricCard label="Verified students" value={formatNumber(a.counts.verifiedStudents)} />
        <MetricCard label="Pending verification" value={formatNumber(a.counts.pendingStudents)} subtext="not shown to teachers" />
        <MetricCard label="Verified, no teacher" value={formatNumber(a.counts.verifiedWithoutTeacher)} />
      </div>

      {a.attention.delegationsNeedingReview.length > 0 && (
        <div className="mb-6" data-testid="needs-review">
          <Alert tone="info">
            <p className="font-semibold mb-1">Permissions to review</p>
            <p className="text-xs mb-2">A student listed on these permissions is no longer seen by the teacher (their assignment ended), so the student was taken off. Check that the permission is still right.</p>
            <ul className="space-y-1">
              {a.attention.delegationsNeedingReview.map((d) => {
                const t = a.teachers.find((x) => x.teacher.id === d.teacherId)?.teacher;
                return (
                  <li key={d.overrideId} className="text-sm flex flex-wrap items-center gap-2">
                    <span>{t ? personName(t) : d.teacherId}: {DELEGATION_LABEL[d.permission] ?? d.permission}</span>
                    <Link href={`/admin/users/${d.teacherId}`} className={linkBtn}>Open teacher</Link>
                    <button type="button" className={linkBtn} disabled={reviewed.isPending} onClick={() => reviewed.mutate({ teacherId: d.teacherId, overrideId: d.overrideId })}>
                      Mark reviewed
                    </button>
                  </li>
                );
              })}
            </ul>
          </Alert>
        </div>
      )}

      <Card className="p-6 mb-6">
        <h2 className="text-base font-bold text-gray-900 mb-3">Teachers of this school</h2>
        {a.teachers.length === 0 ? (
          <p className="text-sm text-gray-600">No teacher is assigned to this school. Assign a school on the teacher&apos;s user page.</p>
        ) : (
          <ul className="divide-y divide-gray-100" data-testid="access-teachers">
            {a.teachers.map((t) => (
              <li key={t.teacher.id} className="py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/admin/users/${t.teacher.id}`} className="font-semibold text-gray-800 hover:text-indigo-700">{personName(t.teacher)}</Link>
                  <span className="text-xs text-gray-500"> @{t.teacher.username} · {t.assignedStudents} assigned student{t.assignedStudents === 1 ? "" : "s"} of this school</span>
                  {t.delegations.length === 0 ? (
                    <p className="text-xs text-gray-600 mt-1">No extra permissions: sees the student list only.</p>
                  ) : (
                    <ul className="mt-1 space-y-0.5">
                      {t.delegations.map((d) => (
                        <li key={d.id} className="text-xs text-gray-600">
                          {DELEGATION_LABEL[d.permission] ?? d.permission} — {scopeText(d.studentScope, d.selectedStudents)}
                          {d.reviewNeededAt && <Badge className="ml-2 bg-amber-50 text-amber-700">Review</Badge>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <button type="button" className={linkBtn} onClick={() => { setTeacherFilter(t.teacher.id); setPage(1); }}>
                  Show their students
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Search and filters (owner 2026-11-25): "+ Add filter" and the active ones as chips. */}
      <FilterBar
        testId="access-filters"
        search={<SearchInput value={q} onChange={resetPage(setQ)} placeholder="Search by name or username…" label="Search students" />}
        onClearAll={() => { setGrade(""); setVerification(""); setAssigned(""); setTeacherFilter(""); setPage(1); }}
        filters={[
          { key: "grade", kind: "select", label: "Grade", value: grade, onChange: (v) => resetPage(setGrade)(v as "" | GradeLevel),
            options: GRADES.map((g) => ({ label: g, value: g })) },
          { key: "verification", kind: "select", label: "School verification", value: verification, onChange: (v) => resetPage(setVerification)(v as "" | "VERIFIED" | "PENDING"),
            options: [{ label: "Verified", value: "VERIFIED" }, { label: "Pending", value: "PENDING" }] },
          // "With / without a teacher", or one teacher's students.
          { key: "teacher", kind: "select", label: "Teacher", value: teacherFilter || assigned, onChange: (v) => {
              if (v === "true" || v === "false" || v === "") { setAssigned(v as "" | "true" | "false"); setTeacherFilter(""); } else { setTeacherFilter(v); setAssigned(""); }
              setPage(1);
            },
            options: [
              { label: "With a teacher", value: "true" }, { label: "Without a teacher", value: "false" },
              ...a.teachers.map((t) => ({ label: `Assigned to ${personName(t.teacher)}`, value: t.teacher.id })),
            ] },
        ]}
      />

      {selected.size > 0 && (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3" data-testid="selection-bar">
          <span className="text-sm font-semibold text-indigo-900">{selected.size} selected</span>
          <button type="button" className={btnPrimary} onClick={() => setAction("assign")}>Assign to a teacher</button>
          <button type="button" className={btnSecondary} onClick={() => setAction("grant")}>Give a permission</button>
          <button type="button" className={btnSecondary} onClick={() => setAction("revoke")}>Take a permission back</button>
          <button type="button" className={linkBtn} onClick={() => setSelected(new Map())}>Clear selection</button>
          {selected.size >= MAX_STUDENTS_PER_REQUEST && <span className="text-xs text-indigo-800">At most {MAX_STUDENTS_PER_REQUEST} students at a time.</span>}
        </div>
      )}

      {result && (
        <div className="mb-4" data-testid="action-results">
          <Notice tone={result.results.some((r) => r.outcome === "FAILED") ? "error" : "success"} onClose={() => setResult(null)}>
            <span className="font-semibold">{result.title}: {outcomeSummary(result.results)}.</span>
            {problemLines(result.results, nameOf).length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs">
                {problemLines(result.results, nameOf).map((l) => <li key={l}>{l}</li>)}
              </ul>
            )}
          </Notice>
        </div>
      )}

      {students.isError ? (
        <ErrorState error={students.error} title="Couldn't load the students" onRetry={() => students.refetch()} />
      ) : (
        <TableCard footer={students.data ? <Pagination page={page} totalPages={students.data.meta.totalPages} total={students.data.meta.total} onPage={setPage} disabled={students.isFetching} /> : undefined}>
          <thead className="bg-gray-50/60 border-b border-gray-100">
            <tr>
              <th className={th}>
                <input type="checkbox" aria-label="Select every student on this page" checked={allOnPage} onChange={togglePage} disabled={pageIds.length === 0} />
              </th>
              <th className={th}>Student</th>
              <th className={th}>Grade</th>
              <th className={th}>School</th>
              <th className={th}>Teachers</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50" data-testid="access-students">
            {students.isPending ? (
              <TableMessage colSpan={5}>Loading…</TableMessage>
            ) : rows.length === 0 ? (
              <TableMessage colSpan={5}>No student matches these filters.</TableMessage>
            ) : (
              rows.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50/50">
                  <td className={td}>
                    <input type="checkbox" aria-label={`Select ${personName(s)}`} checked={selected.has(s.id)} onChange={() => toggle(s)}
                      disabled={!selected.has(s.id) && selected.size >= MAX_STUDENTS_PER_REQUEST} />
                  </td>
                  <td className={td}>
                    <p className="font-semibold text-gray-800"><StudentName student={s} /></p>
                    <p className="text-xs text-gray-500">@{s.username}</p>
                  </td>
                  <td className={`${td} text-gray-600`}>{s.gradeLevel ?? "—"}</td>
                  <td className={td}>
                    {s.claim?.status === "VERIFIED"
                      ? <Badge className="bg-emerald-50 text-emerald-700">Verified</Badge>
                      : <Badge className="bg-amber-50 text-amber-700">Pending</Badge>}
                  </td>
                  <td className={td}>
                    {s.teachers.length === 0 ? (
                      <span className="text-xs text-gray-500">None</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {s.teachers.map((t) => (
                          <li key={t.assignmentId} className="text-xs text-gray-700 flex items-center gap-2">
                            {personName(t)}{t.crossSchool && <span className="text-gray-500">(other school)</span>}
                            <button type="button" className={linkBtn} disabled={end.isPending} aria-label={`End ${personName(t)}'s assignment to ${personName(s)}`}
                              onClick={() => { if (window.confirm(`End ${personName(t)}'s assignment to ${personName(s)}? It stays in the history.`)) end.mutate(t.assignmentId); }}>
                              End
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableCard>
      )}

      {action && (
        <ActionDialog
          action={action}
          schoolTeachers={a.teachers.map((t) => t.teacher)}
          students={[...selected.values()]}
          onClose={() => setAction(null)}
          onDone={(title, results) => {
            setAction(null);
            setResult({ title, results });
            // Keep only the students that need another try.
            setSelected((m) => new Map([...m].filter(([id]) => results.some((r) => r.studentId === id && r.outcome === "FAILED"))));
            refresh();
          }}
        />
      )}
    </AdminPage>
  );
}

/** Choose the teacher, the permission and the reason; confirm the summary; run; hand the per-student results back. */
function ActionDialog({ action, schoolTeachers, students, onClose, onDone }: {
  action: Action;
  schoolTeachers: PersonRef[];
  students: SchoolAccessStudent[];
  onClose: () => void;
  onDone: (title: string, results: ItemResult[]) => void;
}) {
  const [teacherId, setTeacherId] = useState(schoolTeachers[0]?.id ?? "");
  const [otherSearch, setOtherSearch] = useState("");
  const others = useQuery({
    queryKey: ["teacher-search", otherSearch],
    queryFn: () => usersApi.list({ role: "TEACHER", search: otherSearch, limit: 10 }),
    enabled: action === "assign" && otherSearch.trim().length >= 2,
  });
  const [permission, setPermission] = useState<TeacherDelegation | "">("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [running, setRunning] = useState(false);

  const otherTeacher = (others.data?.data ?? []).find((u) => u.id === teacherId);
  const teacher = schoolTeachers.find((t) => t.id === teacherId) ?? otherTeacher;
  const pending = students.filter((s) => s.claim?.status !== "VERIFIED").length;
  const fromOtherSchool = !!teacherId && !schoolTeachers.some((t) => t.id === teacherId);
  const reasonNeeded = action === "assign" && (pending > 0 || fromOtherSchool);
  const ids = useMemo(() => students.map((s) => s.id), [students]);

  function next() {
    if (!teacher) return setError("Choose a teacher.");
    if (action !== "assign" && !permission) return setError("Choose a permission.");
    const problem = action === "assign" ? assignReasonProblem(reason, reasonNeeded)
      : action === "grant" && reason.trim().length < 3 ? "Give a reason (at least 3 characters): it is recorded with the permission." : null;
    if (problem) return setError(problem);
    setError(null);
    setStep("confirm");
  }

  async function run() {
    setRunning(true);
    setError(null);
    try {
      let out: ItemResult[];
      if (action === "assign") {
        out = (await teachersAdminApi.assignStudents(teacherId, ids, reason.trim() || undefined)).results;
      } else {
        const current = (await teachersAdminApi.delegations(teacherId)).find((d) => d.active && d.permission === permission && d.studentScope === "SELECTED");
        if (action === "grant") {
          if (current) out = (await teachersAdminApi.addDelegationStudents(teacherId, current.id, ids)).results;
          else {
            // All-or-nothing on the backend: students the teacher does not see are reported, the rest is given.
            out = await grantSelected(ids, (studentIds) => teachersAdminApi.grant(teacherId, {
              permission: permission as TeacherDelegation, reason: reason.trim(), studentScope: "SELECTED", studentIds,
            }), errorMessage);
          }
        } else if (!current) {
          out = ids.map((studentId) => ({ studentId, outcome: "SKIPPED" as const, code: "NOT_APPLICABLE" }));
        } else {
          out = [];
          for (const studentId of ids) {
            try {
              await teachersAdminApi.removeDelegationStudent(teacherId, current.id, studentId);
              out.push({ studentId, outcome: "REMOVED" });
            } catch (e) {
              // Only "not covered" is nothing to do; any other refusal or failure is reported as it is.
              out.push(isApiError(e) && e.status === 404
                ? { studentId, outcome: "SKIPPED", code: "NOT_APPLICABLE" }
                : { studentId, outcome: "FAILED", message: errorMessage(e) });
            }
          }
        }
      }
      onDone(ACTION_TITLE[action], out);
    } catch (e) {
      setError(errorMessage(e));
      setStep("form");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Modal wide title={ACTION_TITLE[action]} onClose={onClose}>
      {step === "form" ? (
        <div className="space-y-3" data-testid="access-action-form">
          <SelectInput label="Teacher" value={schoolTeachers.some((t) => t.id === teacherId) ? teacherId : ""} onChange={setTeacherId}
            options={[{ label: schoolTeachers.length ? "Choose a teacher of this school" : "No teacher at this school", value: "" },
              ...schoolTeachers.map((t) => ({ label: `${personName(t)} (@${t.username})`, value: t.id }))]} />
          {action === "assign" && (
            <div>
              <TextInput label="Or find a teacher of another school" value={otherSearch} onChange={setOtherSearch} hint="Type at least 2 letters of the name or username." />
              {(others.data?.data ?? []).length > 0 && (
                <ul className="mt-1 border border-gray-100 rounded-lg divide-y divide-gray-100">
                  {others.data!.data.map((u) => (
                    <li key={u.id}>
                      <button type="button" className={`w-full text-left px-3 py-1.5 text-sm ${u.id === teacherId ? "bg-indigo-50" : ""}`} onClick={() => setTeacherId(u.id)}>
                        {personName(u)} <span className="text-xs text-gray-500">@{u.username}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {action !== "assign" && (
            <SelectInput label="Permission" value={permission} onChange={(v) => setPermission(v as TeacherDelegation)}
              options={[{ label: "Choose a permission", value: "" }, ...TEACHER_DELEGATIONS.map((p) => ({ label: DELEGATION_LABEL[p], value: p }))]} />
          )}
          {action !== "revoke" && (
            <TextInput label={reasonNeeded || action === "grant" ? "Reason" : "Reason (optional)"} required={reasonNeeded || action === "grant"} value={reason} onChange={setReason} maxLength={500}
              hint={action === "assign" ? "Needed when a student is not a verified student of the teacher's schools. Recorded in the audit log." : "Recorded with the permission and in the audit log."} />
          )}
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
            <button type="button" className={btnPrimary} onClick={next}>Review</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3" data-testid="access-action-confirm">
          <p className="text-sm text-gray-700">
            {action === "assign" && <>Assign <strong>{students.length}</strong> student{students.length === 1 ? "" : "s"} to <strong>{teacher ? personName(teacher) : ""}</strong>.</>}
            {action === "grant" && <>Let <strong>{teacher ? personName(teacher) : ""}</strong> <strong>{DELEGATION_LABEL[permission]?.toLowerCase()}</strong> for <strong>{students.length}</strong> selected student{students.length === 1 ? "" : "s"}.</>}
            {action === "revoke" && <>Stop <strong>{teacher ? personName(teacher) : ""}</strong> being able to <strong>{DELEGATION_LABEL[permission]?.toLowerCase()}</strong> for <strong>{students.length}</strong> selected student{students.length === 1 ? "" : "s"}.</>}
          </p>
          <ul className="text-xs text-gray-600 list-disc pl-5">
            {action === "assign" && fromOtherSchool && <li>This teacher is not a teacher of this school: they will see only these students, never the rest of the school.</li>}
            {action === "assign" && pending > 0 && <li>{pending} selected student{pending === 1 ? " is" : "s are"} still waiting for school verification.</li>}
            {action === "assign" && <li>Students already assigned to this teacher are skipped. The teacher is told once; students are not notified.</li>}
            {action === "grant" && <li>Only students the teacher sees can be covered: any other selected student is reported as failed and the permission is given for the rest. The teacher is told about a new permission.</li>}
            {action === "revoke" && <li>Permissions for the whole school or for assigned students are not changed here: revoke those on the teacher&apos;s page.</li>}
            <li>Nothing is deleted: every change is kept in the history and the audit log.</li>
          </ul>
          <details className="text-xs text-gray-600">
            <summary>Show the students</summary>
            <p className="mt-1">{students.map((s) => personName(s)).join(", ")}</p>
          </details>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <button type="button" className={btnSecondary} onClick={() => setStep("form")} disabled={running}>Back</button>
            <button type="button" className={btnPrimary} onClick={() => void run()} disabled={running} data-testid="access-action-run">
              {running ? "Working…" : "Confirm"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

