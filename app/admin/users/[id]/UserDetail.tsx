"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, BadgeCheck, CheckCircle2, KeyRound, MailPlus, Pencil, Trash2, UserCheck, UserX } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { useAdminUser, useUserAction, type UserAction } from "@/lib/queries/admin";
import { isApiError } from "@/lib/api/errors";
import { formatDateTime, formatNumber } from "@/lib/format";
import { roleLabel } from "@/lib/auth/roles";
import { courseAccessTarget } from "@/lib/programmes/programme-rules";
import type { UpdateUserInput } from "@/lib/api/admin";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { AdminPage, Card, ConfirmDialog, Modal, Notice, btnDanger, btnPrimary, btnSecondary } from "../../components/adminUi";
import { AccountStatusBadge, UserForm } from "../components/userUi";
import ProgrammeHeadsCard from "./ProgrammeHeadsCard";
import TeacherAccessCard from "./TeacherAccessCard";
import TeacherTestSubmissionCard from "./TeacherTestSubmissionCard";
import { submissionLockSupported } from "@/lib/test-management/submissions";
import { interestsWithOtherText } from "@/lib/accounts/olympiad-interests";
import PermissionOverridesCard from "./PermissionOverridesCard";
import StatusHistoryCard from "./StatusHistoryCard";
import { statusHistoryVisible } from "@/lib/accounts/status-history";
import { hasFeature } from "@/lib/api/capabilities";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { lifecycleActions, STATUS_REASON, stillBlockedText } from "@/lib/accounts/account-lifecycle";
// ACC-02 and REG-13 (kept last so this branch merges cleanly with the account-history branch).
import { personalDetailRows } from "@/lib/accounts/admin-user-details";
import RegistrationHistoryCard from "./RegistrationHistoryCard";
import DateOfBirthCard from "./DateOfBirthCard";
import { canCorrectDateOfBirth } from "@/lib/accounts/date-of-birth-correction";
import { canEditCoachSubjects, coachInterestsSupported } from "@/lib/accounts/coach-application";
import CoachSubjectsCard from "./CoachSubjectsCard";
import CoachAccessPanel from "@/app/components/coaches/CoachAccessPanel";
import { coachProgrammeAccessSupported } from "@/lib/coaches/coach-access";
import OlympiadLevelCard from "@/app/components/students/OlympiadLevelCard";
import { AvatarTile } from "@/app/components/account/UserAvatar";
import ViewAsButton from "./ViewAsButton";
import { viewAsButtonVisible } from "@/lib/auth/view-as";
import { activateNowConfirmText, activateNowDoneText, activateNowVisible } from "@/lib/accounts/activate-now";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-4 py-2.5 border-b border-gray-100 last:border-0 text-sm">
      <dt className="sm:w-44 shrink-0 text-xs font-semibold text-gray-500 uppercase tracking-wider pt-0.5">{label}</dt>
      <dd className="text-gray-800 min-w-0 break-words">{children}</dd>
    </div>
  );
}

type Confirm = { action: UserAction; title: string; body: ReactNode; label: string; tone?: "danger"; done: string; reason?: boolean; name?: string };

export default function UserDetail({ userId }: { userId: string }) {
  const router = useRouter();
  const { user: me, can, permissionOverrides, viewAs } = useSession();
  // Account states (archive instead of delete): only on a backend that advertises them; null while not known yet
  // (loading or UNKNOWN), when neither Delete nor Archive is offered.
  const { detection } = useBackendCapabilities();
  const accountStates = detection?.state === "NEW" || detection?.state === "LEGACY" ? hasFeature(detection, "accountStates") : null;
  const user = useAdminUser(userId);
  const act = useUserAction(userId);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const back = (
    <Link href="/admin/users" className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 mb-4">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> All users
    </Link>
  );

  if (user.isPending) return <AdminPage title="User">{back}<LoadingBlock /></AdminPage>;
  if (user.isError)
    return (
      <AdminPage title="User">
        {back}
        <ErrorState error={user.error} title={isApiError(user.error) && user.error.status === 404 ? "User not found" : "Couldn't load this user"} onRetry={() => user.refetch()} />
      </AdminPage>
    );

  const u = user.data;
  const isMe = me?.id === u.id;
  const name = `${u.firstName} ${u.lastName}`;
  const actions = lifecycleActions(u, { accountStates, isMe, canArchive: can("users.archive") });

  const ask = (c: Confirm) => {
    setNotice(null);
    setConfirm(c);
  };

  return (
    <AdminPage
      title={name}
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          @{u.username} · {roleLabel(u.role)} <AccountStatusBadge user={u} />
        </span>
      }
      actions={
        <button type="button" onClick={() => setEditing(true)} className={btnSecondary}>
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit details
        </button>
      }
    >
      {back}
      {/* The photo first (owner 2026-11-22): the picture, or the initials avatar when there is none. */}
      <div className="mb-6 flex flex-col items-center gap-4 sm:flex-row sm:items-center" data-testid="user-photo">
        <AvatarTile user={u} />
        {u.role === "STUDENT" && hasFeature(detection, "studentOverview") && (
          <Link href={`/admin/profiles/${u.id}`} className={btnSecondary} data-testid="open-student-profile">
            Student profile
          </Link>
        )}
      </div>
      {notice && (
        <Notice tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-base font-bold text-gray-900 mb-2">Account</h2>
          <dl>
            <Row label="E-mail">{u.email}</Row>
            <Row label="Role">{roleLabel(u.role)}</Row>
            {u.role === "STUDENT" && (
              <>
                <Row label="Grade">{u.gradeLevel ?? "—"}</Row>
                <Row label="Olympiad level">{u.division ? `${u.division.name}${u.divisionManual ? " (set by hand)" : ""}` : "—"}</Row>
                <Row label="Points">{formatNumber(u.points)} · {formatNumber(u.problemsSolved)} problems solved</Row>
                {u.olympiadInterests !== undefined && <Row label="Olympiad interests">{interestsWithOtherText(u.olympiadInterests, u.olympiadInterestOther) || "None chosen"}</Row>}
              </>
            )}
            <Row label="School">{u.school ? u.school.name : "—"}</Row>
            <Row label="Home location">{u.homeLocation || "—"}</Row>
            {/* ACC-02: the account's personal details (sent to administrators for one account only). */}
            {personalDetailRows(u).map((r) => (
              <Row key={r.label} label={r.label}>
                {r.value}
              </Row>
            ))}
            <Row label="Activated">{u.activatedAt ? formatDateTime(u.activatedAt) : "Not yet — waiting for the user to set a password"}</Row>
            <Row label="Last sign-in">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</Row>
            <Row label="Created">{formatDateTime(u.createdAt)}</Row>
          </dl>
          {u.role === "MENTOR" && (
            <p className="mt-4 text-xs text-gray-600">
              Course access for this coach is managed on the{" "}
              <Link href={`/admin/mentors?mentor=${u.id}`} className="text-indigo-600 hover:text-indigo-800 font-medium">
                Coaches page
              </Link>
              .
            </p>
          )}
          {u.role === "HEAD_COACH" && courseAccessTarget(me?.role, can, u.role) === "headCoach" && (
            <p className="mt-4 text-xs text-gray-600" data-testid="head-coach-course-access">
              To let this Head Coach prepare and grade work, give them course access on a course of a programme they head:{" "}
              <Link href={`/admin/mentors?mentor=${u.id}`} className="text-indigo-600 hover:text-indigo-800 font-medium">
                Course access
              </Link>
              .
            </p>
          )}
        </Card>

        <Card className="p-6 h-fit">
          <h2 className="text-base font-bold text-gray-900 mb-1">Actions</h2>
          <p className="text-xs text-gray-600 mb-4">Administrators never see or set another person&apos;s password; send a reset link instead.</p>
          <div className="flex flex-col gap-2">
            {/* View as, read only (owner 2026-11-23): lower-ranked users only; the backend checks again. */}
            {viewAsButtonVisible({ featureOn: hasFeature(detection, "viewAs"), canImpersonate: can("users.impersonate"), viewing: viewAs !== null, actor: me, target: u }) && (
              <ViewAsButton userId={u.id} name={name} />
            )}
            {/* The backend approves any active account; a coach invited by a Head Coach waits for approval even before activation. */}
            {u.isActive && !u.isApproved && (
              <button
                type="button"
                className={btnPrimary}
                onClick={() => ask({ action: { type: "status", isApproved: true }, title: "Approve this account?", body: `${name} will be able to use the platform.`, label: "Approve", done: "Account approved." })}
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Approve account
              </button>
            )}
            {/* Activate now (adminActivateNow, owner 2026-11-24): awaiting setup, with the person's own password. */}
            {activateNowVisible(u, { featureOn: hasFeature(detection, "adminActivateNow"), canChangeStatus: can("users.changeStatus"), isMe }) && (
              <button
                type="button"
                className={btnPrimary}
                data-testid="activate-now"
                onClick={() => ask({ action: { type: "activateNow" }, title: "Activate this account now?", body: activateNowConfirmText(name), label: "Activate now", done: "activated", name })}
              >
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Activate now
              </button>
            )}
            {!u.activatedAt && u.isActive && (
              <button
                type="button"
                className={btnSecondary}
                onClick={() => ask({ action: { type: "resendInvitation" }, title: "Send a new invitation?", body: `A new activation link (valid 7 days) is e-mailed to ${u.email}. Earlier links stop working.`, label: "Send invitation", done: `A new invitation was sent to ${u.email}.` })}
              >
                <MailPlus className="h-3.5 w-3.5" aria-hidden="true" /> Resend invitation
              </button>
            )}
            {u.activatedAt && u.isActive && (
              <button
                type="button"
                className={btnSecondary}
                onClick={() => ask({ action: { type: "sendPasswordReset" }, title: "Send a password-reset link?", body: `A reset link is e-mailed to ${u.email}.`, label: "Send link", done: `A password-reset link was sent to ${u.email}.` })}
              >
                <KeyRound className="h-3.5 w-3.5" aria-hidden="true" /> Send password-reset link
              </button>
            )}
            {actions.includes("suspend") && (
              <button
                type="button"
                className={btnSecondary}
                onClick={() =>
                  ask({ action: { type: "status", isActive: false }, title: "Suspend this account?", body: `${name} is signed out everywhere and cannot sign in until the account is reactivated. Their work and results are kept.`, label: "Suspend", tone: "danger", done: "Account suspended. All of the user's sessions were ended." })
                }
              >
                <UserX className="h-3.5 w-3.5" aria-hidden="true" /> Suspend account
              </button>
            )}
            {actions.includes("reactivate") && (
              <button
                type="button"
                className={btnPrimary}
                onClick={() => ask({ action: { type: "status", isActive: true }, title: "Reactivate this account?", body: `${name} can sign in again.`, label: "Reactivate", done: "Account reactivated." })}
              >
                <UserCheck className="h-3.5 w-3.5" aria-hidden="true" /> Reactivate account
              </button>
            )}
            {actions.includes("restore") && (
              <button
                type="button"
                className={btnPrimary}
                onClick={() =>
                  ask({
                    action: { type: "restore", reason: "" },
                    title: "Restore this archived account?",
                    body: `${name} becomes active again and can sign in, unless something else still stops it (for example an activation that was never completed). Give the reason; it is recorded in the account's history.`,
                    label: "Restore account",
                    done: "Account restored.",
                    reason: true,
                  })
                }
              >
                <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" /> Restore account
              </button>
            )}
            {actions.includes("archive") && (
              <button
                type="button"
                className={btnDanger}
                onClick={() =>
                  ask({
                    action: { type: "archive", reason: "" },
                    title: "Archive this account?",
                    body: `${name} is signed out everywhere and can no longer sign in. Nothing is deleted: their submissions, results, discussions and history are kept, and an administrator can restore the account later. Give the reason; it is recorded in the account's history.`,
                    label: "Archive account",
                    tone: "danger",
                    done: "Account archived. All of the user's sessions were ended.",
                    reason: true,
                  })
                }
              >
                <Archive className="h-3.5 w-3.5" aria-hidden="true" /> Archive account
              </button>
            )}
            {actions.includes("delete") && (
              <button
                type="button"
                className={btnDanger}
                onClick={() =>
                  ask({
                    action: { type: "delete" },
                    title: "Delete this account permanently?",
                    body: "Only accounts without academic history (submissions, assignments, reviews) can be deleted. Otherwise suspend the account. This cannot be undone.",
                    label: "Delete account",
                    tone: "danger",
                    done: "deleted",
                  })
                }
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete account
              </button>
            )}
            {isMe && <p className="text-[11px] text-gray-500">This is your own account: it cannot be suspended, archived or deleted here, and its role cannot be changed.</p>}
          </div>
        </Card>

        {/* A student's Olympiad level and its history (olympiadLevels; students.classifyLevel). */}
        {u.role === "STUDENT" && hasFeature(detection, "olympiadLevels") && can("students.classifyLevel") && <OlympiadLevelCard studentId={u.id} canChange className="lg:col-span-3" />}
        {/* A Coach's subjects (capability coachOlympiadInterests): shown, and edited by administrators (users.manage and users.manageCoaches, as the backend checks; canEditCoachSubjects). */}
        {u.role === "MENTOR" && coachInterestsSupported(detection) && <CoachSubjectsCard userId={u.id} subjects={u.olympiadInterests} other={u.olympiadInterestOther ?? null} canEdit={canEditCoachSubjects({ role: me?.role, can, overrides: permissionOverrides })} />}
        {/* Students' date of birth: correction with a reason, and its history (capability dateOfBirthCorrection). */}
        {canCorrectDateOfBirth(detection, u.role, can("users.manage")) && <DateOfBirthCard userId={u.id} dateOfBirth={u.dateOfBirth} />}
        {can("users.manage") && <RegistrationHistoryCard userId={u.id} />}
        {/* Shown only with the backend permission (an Administrator's frozen /me/permissions list lacks both: see the PR notes). */}
        {/* A teacher's test submission for students: one switch, the account untouched (testSubmissionLock). */}
        {u.role === "TEACHER" && can("users.manageTeachers") && submissionLockSupported(detection) && !isMe && <TeacherTestSubmissionCard teacherId={u.id} />}
        {u.role === "TEACHER" && can("users.manageTeachers") && <TeacherAccessCard teacherId={u.id} />}
        {/* A coach's access across their programmes (coachProgrammeAccess): Administrators hold users.manageCoaches (not in their
            frozen /me/permissions list, so the role is checked too); the backend enforces every change. */}
        {u.role === "MENTOR" && coachProgrammeAccessSupported(detection) && (me?.role === "ADMIN" || me?.role === "SUPER_ADMIN" || can("users.manageCoaches")) && (
          <Card className="lg:col-span-3 p-6">
            <h2 className="mb-3 text-base font-bold text-gray-900">Programme access</h2>
            <CoachAccessPanel coachId={u.id} />
          </Card>
        )}
        {u.role === "HEAD_COACH" && can("programmes.manageHeads") && <ProgrammeHeadsCard userId={u.id} name={name} />}
        {/* Super Administrators: effective permissions (permissions.view) and overrides (permissions.manageOverrides). */}
        {(can("permissions.view") || can("permissions.manageOverrides")) && <PermissionOverridesCard user={u} />}
        {statusHistoryVisible(detection, can) && <StatusHistoryCard userId={u.id} />}
      </div>

      {editing && (
        <Modal wide title="Edit details" onClose={() => setEditing(false)}>
          <UserForm
            mode="edit"
            initial={u}
            lockRole={isMe}
            submitLabel="Save changes"
            onCancel={() => setEditing(false)}
            onSubmit={async (input) => {
              await act.mutateAsync({ type: "update", input: input as UpdateUserInput });
              setEditing(false);
              setNotice({ tone: "success", text: "Details saved." });
            }}
          />
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.label}
          tone={confirm.tone}
          note={confirm.reason ? { label: "Reason", min: STATUS_REASON.min, max: STATUS_REASON.max, required: true } : undefined}
          onClose={() => setConfirm(null)}
          onConfirm={async (reason) => {
            const action = confirm.action.type === "archive" || confirm.action.type === "restore" ? { ...confirm.action, reason } : confirm.action;
            const result = (await act.mutateAsync(action)) as { stillBlockedBy?: string[] } | undefined;
            if (confirm.done === "deleted") router.replace("/admin/users");
            else if (action.type === "activateNow") setNotice({ tone: "success", text: activateNowDoneText(confirm.name ?? name, result?.stillBlockedBy) });
            else setNotice({ tone: "success", text: [confirm.done, action.type === "restore" ? stillBlockedText(result?.stillBlockedBy) : null].filter(Boolean).join(" ") });
          }}
        />
      )}
    </AdminPage>
  );
}
