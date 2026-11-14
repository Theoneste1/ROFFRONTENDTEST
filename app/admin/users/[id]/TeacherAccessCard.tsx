"use client";

/**
 * A Teacher's access (users.manageTeachers): the schools whose students they see
 * (`/admin/teacher-assignments`) and the three delegations an Administrator may
 * grant (`/admin/teachers/:id/delegations`: students.viewProfile,
 * students.viewProgress, submissions.submitOnBehalf). The backend refuses
 * delegations to a teacher without an active school, and on your own account.
 * Ending a school or revoking a delegation applies on the teacher's next request.
 */
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DELEGATION_RULES, TEACHER_DELEGATIONS, teachersAdminApi, type TeacherDelegation } from "@/lib/api/accounts";
import { errorMessage, isApiError } from "@/lib/api/errors";
import type { SchoolRef } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { queryKeys } from "@/lib/query/keys";
import { Alert, LoadingBlock } from "@/app/components/ui/feedback";
import { Card, btnPrimary, btnSecondary, linkBtn } from "../../components/adminUi";
import { SchoolPicker, SelectInput, TextInput } from "../components/userUi";

const DELEGATION_LABEL: Record<TeacherDelegation, string> = {
  "students.viewProfile": "View student profiles",
  "students.viewProgress": "View student progress and submissions",
  "submissions.submitOnBehalf": "Submit work on a student's behalf",
};

const ERRORS: Record<string, string> = {
  ALREADY_ASSIGNED: "This teacher is already assigned to that school.",
  SCHOOL_INACTIVE: "That school is no longer active.",
  NOT_A_TEACHER: "This account is not a Teacher.",
  OVERRIDE_EXISTS: "This permission is already granted.",
  OVERRIDE_NOT_ALLOWED: "This permission can't be granted here — a teacher needs at least one active school first, and you can't grant it to yourself.",
  ASSIGNMENT_ENDED: "That school assignment has already ended.",
  OVERRIDE_ALREADY_REVOKED: "That permission was already revoked.",
};
const message = (e: unknown) => (isApiError(e) && e.code && ERRORS[e.code]) || errorMessage(e);

export default function TeacherAccessCard({ teacherId }: { teacherId: string }) {
  const qc = useQueryClient();
  const schools = useQuery({ queryKey: queryKeys.accounts.teacherSchools(teacherId), queryFn: () => teachersAdminApi.assignments(teacherId) });
  const delegations = useQuery({ queryKey: queryKeys.accounts.delegations(teacherId), queryFn: () => teachersAdminApi.delegations(teacherId) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.accounts.teacherSchools(teacherId) });
    void qc.invalidateQueries({ queryKey: queryKeys.accounts.delegations(teacherId) });
  };
  const [error, setError] = useState<string | null>(null);
  const act = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: () => { setError(null); refresh(); }, onError: (e) => setError(message(e)) });

  const [school, setSchool] = useState<SchoolRef | null>(null);
  const [grant, setGrant] = useState<{ permission: TeacherDelegation | ""; reason: string; expiresAt: string }>({ permission: "", reason: "", expiresAt: "" });
  const [grantError, setGrantError] = useState<string | null>(null);

  const active = (schools.data?.data ?? []).filter((a) => a.isActive);
  const activeDelegations = (delegations.data ?? []).filter((d) => d.active);
  const granted = new Set(activeDelegations.map((d) => d.permission));

  function onGrant(e: FormEvent) {
    e.preventDefault();
    const reason = grant.reason.trim();
    if (!grant.permission) return setGrantError("Choose a permission.");
    if (reason.length < DELEGATION_RULES.reasonMin || reason.length > DELEGATION_RULES.reasonMax) return setGrantError(`Give a reason (${DELEGATION_RULES.reasonMin}–${DELEGATION_RULES.reasonMax} characters).`);
    const expires = grant.expiresAt ? new Date(`${grant.expiresAt}T23:59:59`) : null;
    if (expires && expires.getTime() <= Date.now()) return setGrantError("The end date must be in the future.");
    setGrantError(null);
    const permission = grant.permission;
    act.mutate(() => teachersAdminApi.grant(teacherId, { permission, reason, ...(expires && { expiresAt: expires.toISOString() }) }).then(() => setGrant({ permission: "", reason: "", expiresAt: "" })));
  }

  return (
    <Card className="p-6 lg:col-span-3" >
      <div data-testid="teacher-access">
        <h2 className="text-base font-bold text-gray-900 mb-1">Teacher access</h2>
        <p className="text-xs text-gray-500 mb-4">A teacher sees only students of their assigned schools whose school an administrator has verified. Changes apply on the teacher&apos;s next request.</p>
        {error && <Alert tone="error">{error}</Alert>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-3">
          <section aria-labelledby="t-schools">
            <h3 id="t-schools" className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Schools</h3>
            {schools.isPending ? (
              <LoadingBlock />
            ) : schools.isError ? (
              <Alert tone="error">{errorMessage(schools.error)}</Alert>
            ) : (
              <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg mb-3" data-testid="teacher-schools">
                {active.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-gray-400">No school assigned yet.</li>
                ) : (
                  active.map((a) => (
                    <li key={a.id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0">
                        {a.school.name} <span className="text-xs text-gray-400">· {a.school.location} · since {formatDate(a.createdAt)}</span>
                      </span>
                      <button type="button" className={linkBtn} disabled={act.isPending} onClick={() => act.mutate(() => teachersAdminApi.endAssignment(a.id))}>
                        End
                      </button>
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
            <h3 id="t-delegations" className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Extra permissions</h3>
            {delegations.isPending ? (
              <LoadingBlock />
            ) : delegations.isError ? (
              <Alert tone="error">{errorMessage(delegations.error)}</Alert>
            ) : (
              <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg mb-3" data-testid="teacher-delegations">
                {activeDelegations.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-gray-400">None — the teacher sees the student list only.</li>
                ) : (
                  activeDelegations.map((d) => (
                    <li key={d.id} className="px-3 py-2 flex items-start justify-between gap-2 text-sm">
                      <span className="min-w-0">
                        {DELEGATION_LABEL[d.permission as TeacherDelegation] ?? d.permission}
                        <span className="block text-xs text-gray-400">
                          {d.reason} · {d.expiresAt ? `until ${formatDate(d.expiresAt)}` : "no end date"}
                          {d.createdBy ? ` · by @${d.createdBy.username}` : ""}
                        </span>
                      </span>
                      <button type="button" className={linkBtn} disabled={act.isPending} onClick={() => act.mutate(() => teachersAdminApi.revoke(teacherId, d.id))}>
                        Revoke
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
            {active.length === 0 ? (
              <p className="text-xs text-gray-500">Assign a school before granting extra permissions.</p>
            ) : (
              <form onSubmit={onGrant} noValidate className="space-y-3" data-testid="grant-delegation">
                <SelectInput
                  label="Permission"
                  value={grant.permission}
                  onChange={(v) => setGrant((g) => ({ ...g, permission: v as TeacherDelegation }))}
                  options={[{ label: "Choose a permission", value: "" }, ...TEACHER_DELEGATIONS.filter((p) => !granted.has(p)).map((p) => ({ label: DELEGATION_LABEL[p], value: p }))]}
                />
                <TextInput label="Reason" required value={grant.reason} onChange={(v) => setGrant((g) => ({ ...g, reason: v }))} maxLength={DELEGATION_RULES.reasonMax} hint="Recorded in the audit log." />
                <TextInput label="End date (optional)" type="date" value={grant.expiresAt} onChange={(v) => setGrant((g) => ({ ...g, expiresAt: v }))} />
                {grantError && <Alert tone="error">{grantError}</Alert>}
                <button type="submit" className={btnPrimary} disabled={act.isPending}>
                  Grant permission
                </button>
              </form>
            )}
          </section>
        </div>
      </div>
    </Card>
  );
}
