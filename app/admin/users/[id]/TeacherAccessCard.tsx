"use client";

/**
 * A Teacher's access (users.manageTeachers): the schools whose students they see
 * (`/admin/teacher-assignments`) and the three delegations an Administrator may
 * grant (`/admin/teachers/:id/delegations`: students.viewProfile,
 * students.viewProgress, submissions.submitOnBehalf). The backend refuses
 * delegations to a teacher without an active school, and on your own account.
 * Ending a school or revoking a delegation applies on the teacher's next request.
 *
 * Backends with teacherHomeworkDefault (owner 2026-11-24): homework progress and handing homework in are every teacher's
 * defaults (the "Course homework" switch), so only the profile is still offered here; older delegations of the other two
 * stay listed, marked as adding nothing, so they can be revoked.
 *
 * Backends with teacherStudentAccess (TS-1…TS-6): a delegation covers all students of the teacher's schools, only the
 * students assigned to the teacher, or only selected students (listed here, removable); a delegation whose listed
 * student left the teacher's scope is flagged for review; the teacher's directly assigned students are listed (assign
 * them from a school's "Teacher & student access" page).
 */
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DELEGATION_RULES, TEACHER_DELEGATIONS, teachersAdminApi, type TeacherDelegation } from "@/lib/api/accounts";
import { errorMessage, isApiError } from "@/lib/api/errors";
import type { SchoolRef } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { queryKeys } from "@/lib/query/keys";
import { Alert, LoadingBlock } from "@/app/components/ui/feedback";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { personName } from "@/lib/format";
import { canMakePrimary, displayedRole, makePrimaryText, primaryTeacherSupported } from "@/lib/schools/primary-teacher";
import { DELEGATION_LABEL, SCOPE_LABEL, STUDENT_SCOPES, delegationNote, homeworkDefaultSupported, offeredDelegations, scopeText, teacherStudentAccessSupported, type StudentScope } from "@/lib/accounts/teacher-student-access";
import TeacherRoleBadge from "@/app/components/teachers/TeacherRoleBadge";
import { Card, ConfirmDialog, btnPrimary, btnSecondary, linkBtn } from "../../components/adminUi";
import { SchoolPicker, SelectInput, TextInput } from "../components/userUi";
import StudentName from "@/app/components/students/StudentName";


const ERRORS: Record<string, string> = {
  ALREADY_ASSIGNED: "This teacher is already assigned to that school.",
  SCHOOL_INACTIVE: "That school is no longer active.",
  NOT_A_TEACHER: "This account is not a Teacher.",
  OVERRIDE_EXISTS: "This permission is already granted (for these students).",
  OVERRIDE_NOT_ALLOWED: "This permission can't be granted here — a teacher needs at least one active school first, and you can't grant it to yourself.",
  OVERRIDE_ALREADY_REVOKED: "That permission was already revoked.",
  STUDENT_NOT_IN_TEACHER_SCOPE: "Some chosen students are not seen by this teacher (not verified students of their schools, and not assigned to them).",
  NO_REVIEW_NEEDED: "This permission was already reviewed.",
  ASSIGNMENT_ENDED: "That assignment has already ended.",
};
const message = (e: unknown) => (isApiError(e) && e.code && ERRORS[e.code]) || errorMessage(e);

export default function TeacherAccessCard({ teacherId }: { teacherId: string }) {
  const qc = useQueryClient();
  const schools = useQuery({ queryKey: queryKeys.accounts.teacherSchools(teacherId), queryFn: () => teachersAdminApi.assignments(teacherId) });
  const delegations = useQuery({ queryKey: queryKeys.accounts.delegations(teacherId), queryFn: () => teachersAdminApi.delegations(teacherId) });
  const detection = useBackendCapabilities().detection;
  const tsa = teacherStudentAccessSupported(detection);
  // Primary teacher (owner 2026-11-24): also from the teacher's own page, not only from the school's Teachers tab.
  const primaryOn = primaryTeacherSupported(detection);
  const [choosing, setChoosing] = useState<{ id: string; schoolName: string } | null>(null);
  const homeworkDefault = homeworkDefaultSupported(detection);
  const offered = offeredDelegations(TEACHER_DELEGATIONS, detection);
  const studentFilter = { teacherId, isActive: true, limit: 100 };
  const assignedStudents = useQuery({
    queryKey: queryKeys.accounts.teacherStudents(studentFilter), queryFn: () => teachersAdminApi.studentAssignments(studentFilter), enabled: tsa,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.accounts.teacherSchools(teacherId) });
    void qc.invalidateQueries({ queryKey: queryKeys.accounts.delegations(teacherId) });
    void qc.invalidateQueries({ queryKey: queryKeys.accounts.all });
    void qc.invalidateQueries({ queryKey: queryKeys.schoolDirectory.all });
  };
  const [error, setError] = useState<string | null>(null);
  const act = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: () => { setError(null); refresh(); }, onError: (e) => setError(message(e)) });

  const [school, setSchool] = useState<SchoolRef | null>(null);
  // scope null = the default: every student of the teacher's schools, or (no active school) the assigned students.
  const [grant, setGrant] = useState<{ permission: TeacherDelegation | ""; reason: string; expiresAt: string; scope: StudentScope | null; studentIds: string[] }>(
    { permission: "", reason: "", expiresAt: "", scope: null, studentIds: [] });
  const [grantError, setGrantError] = useState<string | null>(null);

  const active = (schools.data?.data ?? []).filter((a) => a.isActive);
  const activeDelegations = (delegations.data ?? []).filter((d) => d.active);
  // With student scopes the same permission may be given again with another scope (the backend refuses an identical one).
  const granted = new Set(tsa ? [] : activeDelegations.map((d) => d.permission));
  const myStudents = (assignedStudents.data?.data ?? []);
  const canGrant = active.length > 0 || (tsa && myStudents.length > 0);
  // Without an active school the backend refuses a school-wide delegation: default to the assigned students then.
  const scope: StudentScope = grant.scope ?? (active.length > 0 ? "SCHOOL" : "ASSIGNED");

  function onGrant(e: FormEvent) {
    e.preventDefault();
    const reason = grant.reason.trim();
    if (!grant.permission) return setGrantError("Choose a permission.");
    if (reason.length < DELEGATION_RULES.reasonMin || reason.length > DELEGATION_RULES.reasonMax) return setGrantError(`Give a reason (${DELEGATION_RULES.reasonMin}–${DELEGATION_RULES.reasonMax} characters).`);
    const expires = grant.expiresAt ? new Date(`${grant.expiresAt}T23:59:59`) : null;
    if (expires && expires.getTime() <= Date.now()) return setGrantError("The end date must be in the future.");
    if (tsa && scope === "SELECTED" && grant.studentIds.length === 0) return setGrantError("Choose at least one student.");
    setGrantError(null);
    const permission = grant.permission;
    const scoped = tsa ? { studentScope: scope, ...(scope === "SELECTED" && { studentIds: grant.studentIds }) } : {};
    act.mutate(() => teachersAdminApi.grant(teacherId, { permission, reason, ...(expires && { expiresAt: expires.toISOString() }), ...scoped })
      .then(() => setGrant({ permission: "", reason: "", expiresAt: "", scope: null, studentIds: [] })));
  }

  return (
    <Card className="p-6 lg:col-span-3" >
      <div data-testid="teacher-access">
        <h2 className="text-base font-bold text-gray-900 mb-1">Teacher access</h2>
        <p className="text-xs text-gray-600 mb-4">
          A teacher sees only students of their assigned schools whose school an administrator has verified{tsa ? ", and students assigned to them directly" : ""}. Changes apply on the teacher&apos;s next request.
        </p>
        {error && <Alert tone="error">{error}</Alert>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-3">
          <section aria-labelledby="t-schools">
            <h3 id="t-schools" className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Schools</h3>
            {schools.isPending ? (
              <LoadingBlock />
            ) : schools.isError ? (
              <Alert tone="error">{errorMessage(schools.error)}</Alert>
            ) : (
              <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg mb-3" data-testid="teacher-schools">
                {active.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-gray-500">No school assigned yet.</li>
                ) : (
                  active.map((a) => (
                    <li key={a.id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0">
                        {a.school.name} <span className="text-xs text-gray-500">· {a.school.location} · since {formatDate(a.createdAt)}</span>
                        {/* Primary teacher (owner decision 2026-11-19): the school's main contact; the same rights either way. */}
                        {displayedRole(a) && <TeacherRoleBadge role={displayedRole(a)!} className="ml-2 align-middle" />}
                      </span>
                      <span className="flex items-center gap-3">
                        {primaryOn && canMakePrimary(a, true) && (
                          <button type="button" className={linkBtn} disabled={act.isPending} onClick={() => setChoosing({ id: a.id, schoolName: a.school.name })}
                            data-testid={`make-primary-${a.id}`}>
                            Make primary
                          </button>
                        )}
                        <button type="button" className={linkBtn} disabled={act.isPending} onClick={() => act.mutate(() => teachersAdminApi.endAssignment(a.id))}>
                          End
                        </button>
                      </span>
                    </li>
                  ))
                )}
              </ul>
            )}
            <SchoolPicker label="Assign a school" value={school} onChange={setSchool} />
            <button
              type="button"
              className={`${btnSecondary} mt-2`}
              disabled={!school || act.isPending}
              onClick={() => school && act.mutate(() => teachersAdminApi.assign(teacherId, school.id).then(() => setSchool(null)))}
            >
              Assign school
            </button>
          </section>

          <section aria-labelledby="t-delegations">
            <h3 id="t-delegations" className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Extra permissions</h3>
            {delegations.isPending ? (
              <LoadingBlock />
            ) : delegations.isError ? (
              <Alert tone="error">{errorMessage(delegations.error)}</Alert>
            ) : (
              <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg mb-3" data-testid="teacher-delegations">
                {activeDelegations.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-gray-500">
                    {homeworkDefault ? "None — the teacher sees the student list and their students' course homework (see Course homework)." : "None — the teacher sees the student list only."}
                  </li>
                ) : (
                  activeDelegations.map((d) => (
                    <li key={d.id} className="px-3 py-2 flex items-start justify-between gap-2 text-sm">
                      <span className="min-w-0">
                        {DELEGATION_LABEL[d.permission] ?? d.permission}
                        {tsa && <span className="block text-xs text-gray-600">{scopeText(d.studentScope, d.students?.length)}</span>}
                        {delegationNote(d.permission, detection) && <span className="block text-xs text-amber-700" data-testid="delegation-default-note">{delegationNote(d.permission, detection)}</span>}
                        <span className="block text-xs text-gray-500">
                          {d.reason} · {d.expiresAt ? `until ${formatDate(d.expiresAt)}` : "no end date"}
                          {d.createdBy ? ` · by @${d.createdBy.username}` : ""}
                        </span>
                        {d.studentScope === "SELECTED" && (d.students ?? []).length > 0 && (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {d.students!.map((s) => (
                              <span key={s.studentId} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">
                                <StudentName student={s.student} />
                                <button type="button" className="text-gray-500 hover:text-red-600" aria-label={`Take ${personName(s.student)} off this permission`} disabled={act.isPending}
                                  onClick={() => act.mutate(() => teachersAdminApi.removeDelegationStudent(teacherId, d.id, s.studentId))}>
                                  ×
                                </button>
                              </span>
                            ))}
                          </span>
                        )}
                        {d.reviewNeededAt && (
                          <span className="mt-1 block text-xs text-amber-700" data-testid="delegation-review">
                            A listed student left this teacher&apos;s scope and was taken off. Check this permission.{" "}
                            <button type="button" className={linkBtn} disabled={act.isPending} onClick={() => act.mutate(() => teachersAdminApi.markReviewed(teacherId, d.id))}>
                              Mark reviewed
                            </button>
                          </span>
                        )}
                      </span>
                      <button type="button" className={linkBtn} disabled={act.isPending} onClick={() => act.mutate(() => teachersAdminApi.revoke(teacherId, d.id))}>
                        Revoke
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
            {!canGrant ? (
              <p className="text-xs text-gray-600">Assign a school{tsa ? " or students" : ""} before granting extra permissions.</p>
            ) : (
              <form onSubmit={onGrant} noValidate className="space-y-3" data-testid="grant-delegation">
                <SelectInput
                  label="Permission"
                  value={grant.permission}
                  onChange={(v) => setGrant((g) => ({ ...g, permission: v as TeacherDelegation }))}
                  options={[{ label: "Choose a permission", value: "" }, ...offered.filter((p) => !granted.has(p)).map((p) => ({ label: DELEGATION_LABEL[p], value: p }))]}
                />
                {tsa && (
                  <SelectInput
                    label="For which students"
                    value={scope}
                    onChange={(v) => setGrant((g) => ({ ...g, scope: v as StudentScope, studentIds: [] }))}
                    options={STUDENT_SCOPES.map((s) => ({ label: SCOPE_LABEL[s], value: s }))}
                  />
                )}
                {tsa && scope === "SELECTED" && (
                  myStudents.length === 0 ? (
                    <p className="text-xs text-gray-600">To choose students of a school, use that school&apos;s &ldquo;Teacher &amp; student access&rdquo; page. Here you can choose among students assigned to this teacher.</p>
                  ) : (
                    <fieldset className="border border-gray-100 rounded-lg p-2 max-h-40 overflow-y-auto" data-testid="grant-students">
                      <legend className="text-xs text-gray-600 px-1">Students assigned to this teacher</legend>
                      {myStudents.map((a) => (
                        <label key={a.id} className="flex items-center gap-2 text-sm py-0.5">
                          <input
                            type="checkbox"
                            checked={grant.studentIds.includes(a.student.id)}
                            onChange={(e) => setGrant((g) => ({ ...g, studentIds: e.target.checked ? [...g.studentIds, a.student.id] : g.studentIds.filter((x) => x !== a.student.id) }))}
                          />
                          {personName(a.student)} <span className="text-xs text-gray-500">@{a.student.username}</span>
                        </label>
                      ))}
                    </fieldset>
                  )
                )}
                <TextInput label="Reason" required value={grant.reason} onChange={(v) => setGrant((g) => ({ ...g, reason: v }))} maxLength={DELEGATION_RULES.reasonMax} hint="Recorded in the audit log." />
                <TextInput label="End date (optional)" type="date" value={grant.expiresAt} onChange={(v) => setGrant((g) => ({ ...g, expiresAt: v }))} />
                <p className="text-xs text-gray-600">The teacher will be notified by e-mail and in the app of the permission granted.</p>
                {grantError && <Alert tone="error">{grantError}</Alert>}
                <button type="submit" className={btnPrimary} disabled={act.isPending}>
                  Grant permission
                </button>
              </form>
            )}
          </section>
        </div>

        {tsa && (
          <section aria-labelledby="t-students" className="mt-6">
            <h3 id="t-students" className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Students assigned to this teacher</h3>
            {assignedStudents.isPending ? (
              <LoadingBlock />
            ) : assignedStudents.isError ? (
              <Alert tone="error">{errorMessage(assignedStudents.error)}</Alert>
            ) : (
              <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg" data-testid="teacher-assigned-students">
                {myStudents.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-gray-500">None. Assign students from a school&apos;s &ldquo;Teacher &amp; student access&rdquo; page.</li>
                ) : (
                  myStudents.map((a) => (
                    <li key={a.id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0">
                        {personName(a.student)}{" "}
                        <span className="text-xs text-gray-500">
                          · {a.student.school?.name ?? "no school"}{a.crossSchool ? " · other school" : ""} · since {formatDate(a.createdAt)}
                          {a.reason ? ` · ${a.reason}` : ""}
                        </span>
                      </span>
                      <button type="button" className={linkBtn} disabled={act.isPending} onClick={() => act.mutate(() => teachersAdminApi.endStudentAssignment(a.id))}>
                        End
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </section>
        )}
      </div>
    {choosing && (
        <ConfirmDialog
          title="Make this teacher the primary teacher?"
          body={`${makePrimaryText("This teacher", null, choosing.schoolName)} If the school already has a primary teacher, that teacher becomes a secondary teacher.`}
          confirmLabel="Make primary"
          onClose={() => setChoosing(null)}
          onConfirm={() => teachersAdminApi.makePrimary(choosing.id).then(() => { setChoosing(null); setError(null); refresh(); })}
        />
      )}
    </Card>
  );
}
