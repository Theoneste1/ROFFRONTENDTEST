"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, KeyRound, MailPlus, Pencil, Trash2, UserCheck, UserX } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { useAdminUser, useUserAction, type UserAction } from "@/lib/queries/admin";
import { isApiError } from "@/lib/api/errors";
import { formatDateTime, formatNumber } from "@/lib/format";
import { roleLabel } from "@/lib/auth/roles";
import type { UpdateUserInput } from "@/lib/api/admin";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { AdminPage, Card, ConfirmDialog, Modal, Notice, btnDanger, btnPrimary, btnSecondary } from "../../components/adminUi";
import { AccountStatusBadge, UserForm } from "../components/userUi";
import ProgrammeHeadsCard from "./ProgrammeHeadsCard";
import TeacherAccessCard from "./TeacherAccessCard";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-4 py-2.5 border-b border-gray-100 last:border-0 text-sm">
      <dt className="sm:w-44 shrink-0 text-xs font-semibold text-gray-400 uppercase tracking-wider pt-0.5">{label}</dt>
      <dd className="text-gray-800 min-w-0 break-words">{children}</dd>
    </div>
  );
}

type Confirm = { action: UserAction; title: string; body: ReactNode; label: string; tone?: "danger"; done: string };

export default function UserDetail({ userId }: { userId: string }) {
  const router = useRouter();
  const { user: me, can } = useSession();
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
                <Row label="Division">{u.division ? `${u.division.name}${u.gradeLevel ? ` · ${u.gradeLevel}` : ""}` : "—"}</Row>
                <Row label="Points">{formatNumber(u.points)} · {formatNumber(u.problemsSolved)} problems solved</Row>
              </>
            )}
            <Row label="School">{u.school ? `${u.school.name} · ${u.school.location}` : "—"}</Row>
            <Row label="Home location">{u.homeLocation || "—"}</Row>
            <Row label="Activated">{u.activatedAt ? formatDateTime(u.activatedAt) : "Not yet — waiting for the user to set a password"}</Row>
            <Row label="Last sign-in">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</Row>
            <Row label="Created">{formatDateTime(u.createdAt)}</Row>
          </dl>
          {u.role === "MENTOR" && (
            <p className="mt-4 text-xs text-gray-500">
              Course access for this coach is managed on the{" "}
              <Link href={`/admin/mentors?mentor=${u.id}`} className="text-indigo-600 hover:text-indigo-800 font-medium">
                Coaches page
              </Link>
              .
            </p>
          )}
        </Card>

        <Card className="p-6 h-fit">
          <h2 className="text-base font-bold text-gray-900 mb-1">Actions</h2>
          <p className="text-xs text-gray-500 mb-4">Administrators never see or set another person&apos;s password; send a reset link instead.</p>
          <div className="flex flex-col gap-2">
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
            {!isMe &&
              (u.isActive ? (
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() =>
                    ask({ action: { type: "status", isActive: false }, title: "Suspend this account?", body: `${name} is signed out everywhere and cannot sign in until the account is reactivated. Their work and results are kept.`, label: "Suspend", tone: "danger", done: "Account suspended. All of the user's sessions were ended." })
                  }
                >
                  <UserX className="h-3.5 w-3.5" aria-hidden="true" /> Suspend account
                </button>
              ) : (
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={() => ask({ action: { type: "status", isActive: true }, title: "Reactivate this account?", body: `${name} can sign in again.`, label: "Reactivate", done: "Account reactivated." })}
                >
                  <UserCheck className="h-3.5 w-3.5" aria-hidden="true" /> Reactivate account
                </button>
              ))}
            {!isMe && (
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
            {isMe && <p className="text-[11px] text-gray-400">This is your own account: it cannot be suspended or deleted here, and its role cannot be changed.</p>}
          </div>
        </Card>

        {/* Shown only with the backend permission (an Administrator's frozen /me/permissions list lacks both: see the PR notes). */}
        {u.role === "TEACHER" && can("users.manageTeachers") && <TeacherAccessCard teacherId={u.id} />}
        {u.role === "HEAD_COACH" && can("programmes.manageHeads") && <ProgrammeHeadsCard userId={u.id} name={name} />}
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
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await act.mutateAsync(confirm.action);
            if (confirm.done === "deleted") router.replace("/admin/users");
            else setNotice({ tone: "success", text: confirm.done });
          }}
        />
      )}
    </AdminPage>
  );
}
