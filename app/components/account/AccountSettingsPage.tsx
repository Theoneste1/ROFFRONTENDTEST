"use client";

/**
 * "Settings" for every role: `/student|mentor|teacher|admin/account` (the profile menu's Settings).
 * Only what the backend supports, each a working control:
 * - sign-in details (username and e-mail, read-only: administrators manage them);
 * - `PATCH /auth/password`, which signs out every session;
 * - `POST /auth/logout-all` (sign out of every device);
 * - notification e-mail preferences and, for coaches and administrators, per-type switches
 *   (NotificationPreferences.tsx).
 * Administrators' platform settings stay at /admin/settings (the sidebar's Settings).
 */
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AtSign, KeyRound, LogOut } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { portalPath, roleLabel } from "@/lib/auth/roles";
import { clearLoginNotice, setLoginNotice } from "@/lib/auth/notice";
import { useChangePassword } from "@/lib/queries/account";
import { PASSWORD_RULE } from "@/lib/api/auth";
import { errorMessage, fieldErrors, isApiError } from "@/lib/api/errors";
import { Alert, LoadingBlock } from "@/app/components/ui/feedback";
import { Button, PasswordField } from "@/app/components/ui/form";
import { PageFrame } from "@/app/components/ui/PageFrame";
import NewPasswordFields, { validateNewPassword } from "@/app/components/auth/NewPasswordFields";
import NotificationPreferences from "./NotificationPreferences";
import { Section } from "./Section";

export default function AccountSettingsPage() {
  const { user } = useSession();
  if (!user) return <LoadingBlock />;
  return (
    <PageFrame title="Settings" description="Your sign-in details, password, devices and notification e-mails.">
      <div className="max-w-3xl space-y-6" data-testid="account-settings">
        <Section title="Sign-in details" icon={<AtSign className="w-5 h-5" />} description="How you sign in. Administrators change these on request.">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Username</dt>
              <dd className="mt-0.5 break-words text-sm text-gray-800">{user.username}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-500">E-mail</dt>
              <dd className="mt-0.5 break-words text-sm text-gray-800" data-testid="settings-email">{user.email}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Account</dt>
              <dd className="mt-0.5 text-sm text-gray-800">{roleLabel(user.role)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-gray-600">
            Your name and picture are on <Link href={portalPath(user.role, "profile")} className="font-semibold text-brand hover:underline">My Profile</Link>.
          </p>
        </Section>
        <PasswordForm />
        <SessionsCard />
        <NotificationPreferences role={user.role} />
      </div>
    </PageFrame>
  );
}

// ─── Password (PATCH /auth/password) ────────────────────────────────────────

function PasswordForm() {
  const { endSession } = useSession();
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ current?: string; password?: string; confirm?: string }>({});

  const wrongCurrent = isApiError(change.error) && change.error.code === "WRONG_PASSWORD";
  const policy = fieldErrors(change.error, ["newPassword"]).newPassword;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = { ...validateNewPassword(password, confirm) };
    if (!current) errs.current = "Enter your current password.";
    else if (password && password === current) errs.password = "Choose a password different from your current one.";
    setErrors(errs);
    if (Object.keys(errs).length || change.isPending) return;
    change.mutate(
      { currentPassword: current, newPassword: password },
      {
        onSuccess: () => {
          // The backend revoked every session, this one included.
          setLoginNotice("password-changed");
          endSession();
        },
      },
    );
  }

  return (
    <Section
      title="Change password"
      icon={<KeyRound className="w-5 h-5" />}
      description="After the change you are signed out everywhere, including here, and sign in again with the new password."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {change.isError && !wrongCurrent && !policy && <Alert tone="error">{errorMessage(change.error)}</Alert>}
        <PasswordField
          label="Current password"
          name="current-password"
          autoComplete="current-password"
          required
          maxLength={PASSWORD_RULE.max}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          error={errors.current ?? (wrongCurrent ? "Your current password is incorrect." : undefined)}
        />
        <NewPasswordFields
          password={password}
          confirm={confirm}
          onPassword={setPassword}
          onConfirm={setConfirm}
          errors={{ password: errors.password ?? policy, confirm: errors.confirm }}
        />
        <div className="flex justify-end">
          <Button type="submit" loading={change.isPending}>
            Change password
          </Button>
        </div>
      </form>
    </Section>
  );
}

// ─── Sessions (POST /auth/logout-all) ───────────────────────────────────────

function SessionsCard() {
  const { logoutEverywhere } = useSession();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function onConfirm() {
    setPending(true);
    setError(null);
    try {
      setLoginNotice("signed-out-everywhere");
      await logoutEverywhere(); // RoleGate then opens the sign-in page
    } catch (err) {
      clearLoginNotice();
      setError(err);
      setPending(false);
    }
  }

  return (
    <Section title="Sessions" icon={<LogOut className="w-5 h-5" />} description="Signed in on a shared or lost device? Sign out of every browser and device at once.">
      {error != null && (
        <div className="mb-4">
          <Alert tone="error">{errorMessage(error)}</Alert>
        </div>
      )}
      {confirming ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="text-sm text-gray-600 mr-auto">You will be signed out here too.</span>
          <Button type="button" variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} loading={pending} className="!bg-red-600 hover:!bg-red-700">
            Sign out everywhere
          </Button>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
            Sign out of all devices
          </Button>
        </div>
      )}
    </Section>
  );
}
