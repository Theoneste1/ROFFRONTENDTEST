"use client";

/**
 * "My profile" for every role: `/student|mentor|admin/profile`.
 *
 * What can change is exactly what the backend allows:
 * - `PATCH /me`: first name, last name, home location. Username, e-mail,
 *   role, division, grade and school are read-only here (administrators
 *   manage them);
 * - `PATCH /auth/password`, which signs out every session;
 * - `POST /auth/logout-all`;
 * - notification e-mail preferences and, for mentors and admins, per-type
 *   switches (NotificationPreferences.tsx).
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { KeyRound, LogOut, UserRound } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { clearLoginNotice, setLoginNotice } from "@/lib/auth/notice";
import { useChangePassword, useUpdateMe } from "@/lib/queries/account";
import { PASSWORD_RULE } from "@/lib/api/auth";
import { errorMessage, fieldErrors, isApiError } from "@/lib/api/errors";
import type { CurrentUser, UpdateMeInput } from "@/lib/api/types";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { Alert, LoadingBlock } from "@/app/components/ui/feedback";
import { Button, PasswordField, TextField } from "@/app/components/ui/form";
import { PageFrame } from "@/app/components/ui/PageFrame";
import NewPasswordFields, { validateNewPassword } from "@/app/components/auth/NewPasswordFields";
import NotificationPreferences from "./NotificationPreferences";
import { Section } from "./Section";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-800 mt-0.5 break-words">{children || "—"}</dd>
    </div>
  );
}

export default function ProfilePage() {
  const { user } = useSession();
  if (!user) return <LoadingBlock />;

  const fullName = `${user.firstName} ${user.lastName}`.trim() || user.username;
  return (
    <PageFrame title="My profile" description="Your account details, password and notification preferences.">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className="space-y-6 min-w-0">
          <section className="bg-white rounded-2xl border border-gray-100 shadow-xs p-6 flex flex-col items-center text-center">
            <div className="h-20 w-20 rounded-full bg-indigo-600 text-white flex items-center justify-center text-3xl font-bold" aria-hidden="true">
              {(user.firstName || user.username).charAt(0).toUpperCase()}
            </div>
            <p className="mt-3 text-lg font-bold text-gray-900">{fullName}</p>
            <p className="text-sm text-gray-500">{ROLE_LABEL[user.role]}</p>
            <dl className="mt-6 w-full grid grid-cols-1 gap-4 text-left">
              <Detail label="Username">{user.username}</Detail>
              <Detail label="E-mail">{user.email}</Detail>
              {user.role === "STUDENT" && (
                <>
                  <Detail label="Division">{user.division?.name}</Detail>
                  <Detail label="Grade">{user.gradeLevel}</Detail>
                  <Detail label="School">{user.school ? `${user.school.name}${user.school.location ? `, ${user.school.location}` : ""}` : null}</Detail>
                  <Detail label="Points">{`${formatNumber(user.points)} · ${formatNumber(user.problemsSolved)} problems solved`}</Detail>
                </>
              )}
              <Detail label="Member since">{formatDate(user.createdAt)}</Detail>
              <Detail label="Last sign-in">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : null}</Detail>
            </dl>
            <p className="mt-5 text-xs text-gray-400">Username, e-mail{user.role === "STUDENT" ? ", grade and school" : ""} are managed by the administrators.</p>
          </section>
        </div>

        <div className="xl:col-span-2 space-y-6 min-w-0">
          <DetailsForm user={user} />
          <PasswordForm />
          <SessionsCard />
          <NotificationPreferences role={user.role} />
        </div>
      </div>
    </PageFrame>
  );
}

// ─── Details (PATCH /me) ────────────────────────────────────────────────────

type DetailErrors = Partial<Record<keyof UpdateMeInput, string>>;

function DetailsForm({ user }: { user: CurrentUser }) {
  const update = useUpdateMe();
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [homeLocation, setHomeLocation] = useState(user.homeLocation ?? "");
  const [errors, setErrors] = useState<DetailErrors>({});
  const [saved, setSaved] = useState(false);
  const [nothing, setNothing] = useState(false);

  const serverErrors = fieldErrors(update.error, ["firstName", "lastName", "homeLocation"]) as DetailErrors;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    setNothing(false);
    const f = firstName.trim(), l = lastName.trim(), h = homeLocation.trim();
    const errs: DetailErrors = {};
    if (f.length < 1 || f.length > 100) errs.firstName = "Enter your first name (up to 100 characters).";
    if (l.length < 1 || l.length > 100) errs.lastName = "Enter your last name (up to 100 characters).";
    if (h && (h.length < 2 || h.length > 200)) errs.homeLocation = "Use 2 to 200 characters.";
    if (!h && user.homeLocation) errs.homeLocation = "Your home location can be changed but not removed.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    // Send only what changed; the backend refuses an empty update.
    const input: UpdateMeInput = {};
    if (f !== user.firstName) input.firstName = f;
    if (l !== user.lastName) input.lastName = l;
    if (h && h !== (user.homeLocation ?? "")) input.homeLocation = h;
    if (Object.keys(input).length === 0) {
      setNothing(true);
      return;
    }
    update.mutate(input, {
      onSuccess: (me) => {
        setSaved(true);
        setFirstName(me.firstName);
        setLastName(me.lastName);
        setHomeLocation(me.homeLocation ?? "");
      },
    });
  }

  return (
    <Section title="Personal details" icon={<UserRound className="w-5 h-5" />} description="The name shown to mentors, administrators and in discussions.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {saved && <Alert tone="success">Your details were saved.</Alert>}
        {nothing && <Alert tone="info">Nothing to save: no field was changed.</Alert>}
        {update.isError && Object.keys(serverErrors).length === 0 && <Alert tone="error">{errorMessage(update.error)}</Alert>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField
            label="First name"
            name="firstName"
            autoComplete="given-name"
            required
            maxLength={100}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            error={errors.firstName ?? serverErrors.firstName}
          />
          <TextField
            label="Last name"
            name="lastName"
            autoComplete="family-name"
            required
            maxLength={100}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            error={errors.lastName ?? serverErrors.lastName}
          />
        </div>
        <TextField
          label="Home location"
          name="homeLocation"
          autoComplete="address-level2"
          maxLength={200}
          value={homeLocation}
          onChange={(e) => setHomeLocation(e.target.value)}
          error={errors.homeLocation ?? serverErrors.homeLocation}
          hint="City or district, e.g. Kigali."
        />
        <div className="flex justify-end">
          <Button type="submit" loading={update.isPending}>
            Save details
          </Button>
        </div>
      </form>
    </Section>
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
