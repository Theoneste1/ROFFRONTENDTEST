"use client";

/**
 * Invite a new Coach into a programme (`POST /admin/programmes/:id/coach-invitations`,
 * users.manageCoaches). The coach gets an activation e-mail. Invited by a Head
 * Coach, the account stays pending until an Administrator approves it
 * (`pendingApproval`); the backend refuses programmes the Head Coach doesn't head.
 */
import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { USER_RULES } from "@/lib/api/admin";
import { programmesApi, type CoachInvitationResult } from "@/lib/api/programmes";
import { errorMessage, fieldErrors, isApiError } from "@/lib/api/errors";
import { formatDate } from "@/lib/format";
import { queryKeys } from "@/lib/query/keys";
import { Alert } from "@/app/components/ui/feedback";
import { Modal, btnPrimary, btnSecondary } from "@/app/admin/components/adminUi";
import { TextInput } from "@/app/admin/users/components/userUi";

const FIELDS = ["firstName", "lastName", "email", "username"] as const;
type F = (typeof FIELDS)[number];

export default function CoachInvite({ programmeId, programmeName }: { programmeId: string; programmeName: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ firstName: "", lastName: "", email: "", username: "" });
  const [errors, setErrors] = useState<Partial<Record<F, string>>>({});
  const [done, setDone] = useState<CoachInvitationResult | null>(null);
  const invite = useMutation({
    mutationFn: () =>
      programmesApi.inviteCoach(programmeId, {
        firstName: v.firstName.trim(),
        lastName: v.lastName.trim(),
        email: v.email.trim().toLowerCase(),
        username: v.username.trim().toLowerCase() || undefined,
      }),
    onSuccess: (r) => {
      setDone(r);
      setOpen(false);
      setV({ firstName: "", lastName: "", email: "", username: "" });
      void qc.invalidateQueries({ queryKey: queryKeys.programmes.all });
    },
    onError: (e) => setErrors(fieldErrors(e, FIELDS)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (invite.isPending) return;
    const err: Partial<Record<F, string>> = {};
    const len = (s: string, min: number, max: number) => s.trim().length >= min && s.trim().length <= max;
    if (!len(v.firstName, USER_RULES.name.min, USER_RULES.name.max)) err.firstName = "First name is required.";
    if (!len(v.lastName, USER_RULES.name.min, USER_RULES.name.max)) err.lastName = "Last name is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) err.email = "Enter a valid e-mail address.";
    const u = v.username.trim().toLowerCase();
    if (u && (!len(u, USER_RULES.username.min, USER_RULES.username.max) || !USER_RULES.username.pattern.test(u))) err.username = "3–30 characters: lowercase letters, digits, “.”, “_” and “-”.";
    setErrors(err);
    if (Object.keys(err).length === 0) invite.mutate();
  }

  const formError =
    invite.error && Object.keys(errors).length === 0
      ? isApiError(invite.error) && invite.error.code === "IDENTITY_TAKEN"
        ? "That username or e-mail is already in use."
        : errorMessage(invite.error)
      : null;

  return (
    <div className="mb-4">
      {done && (
        <div className="mb-3">
          <Alert tone="success">
            Invitation sent to {done.user.email} (@{done.user.username}); the link is valid until {formatDate(done.invitation.expiresAt)}.{" "}
            {done.pendingApproval ? "An administrator must approve the account before the coach can sign in." : "The coach can sign in after setting a password."}
          </Alert>
        </div>
      )}
      <button
        type="button"
        className={btnSecondary}
        onClick={() => {
          setOpen(true);
          setDone(null);
          setErrors({});
          invite.reset();
        }}
      >
        Invite a coach
      </button>
      {open && (
        <Modal title={`Invite a coach to ${programmeName}`} onClose={() => setOpen(false)}>
          <form onSubmit={onSubmit} noValidate className="space-y-4" data-testid="coach-invite-form">
            <p className="text-xs text-gray-500">The coach receives an e-mail to set a password. An administrator approves the account and gives course access.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextInput label="First name" required value={v.firstName} onChange={(x) => setV((s) => ({ ...s, firstName: x }))} error={errors.firstName} maxLength={USER_RULES.name.max} autoComplete="off" />
              <TextInput label="Last name" required value={v.lastName} onChange={(x) => setV((s) => ({ ...s, lastName: x }))} error={errors.lastName} maxLength={USER_RULES.name.max} autoComplete="off" />
              <TextInput label="E-mail" required type="email" value={v.email} onChange={(x) => setV((s) => ({ ...s, email: x }))} error={errors.email} autoComplete="off" />
              <TextInput label="Username" value={v.username} onChange={(x) => setV((s) => ({ ...s, username: x }))} error={errors.username} maxLength={USER_RULES.username.max} autoComplete="off" hint="Optional — made from the e-mail address when empty." />
            </div>
            {formError && <Alert tone="error">{formError}</Alert>}
            <div className="flex justify-end gap-3">
              <button type="button" className={btnSecondary} onClick={() => setOpen(false)} disabled={invite.isPending}>
                Cancel
              </button>
              <button type="submit" className={btnPrimary} disabled={invite.isPending}>
                {invite.isPending ? "Sending…" : "Send invitation"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
