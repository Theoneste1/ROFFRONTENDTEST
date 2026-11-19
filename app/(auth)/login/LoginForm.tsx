"use client";

/**
 * Sign in (the approved reference design: app/components/auth/AuthCard → LoginCard draws the card and the navy panel).
 * The fields, rules, request, messages and redirects are those of the existing sign-in.
 */
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth/session";
import { postLoginPath } from "@/lib/auth/roles";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { Alert, LoadingBlock } from "@/app/components/ui/feedback";
import { Button, PasswordField, TextField } from "@/app/components/ui/form";
import { accountRefusalMessage } from "@/lib/auth/login-refusals";
import { LOGIN_NOTICE_TEXT, clearLoginNotice, peekLoginNotice } from "@/lib/auth/notice";

export default function LoginForm() {
  const session = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [failures, setFailures] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  // A one-time message from the previous page (e.g. after a password change).
  const [notice] = useState(peekLoginNotice);
  useEffect(() => clearLoginNotice(), []);

  // Already signed in → straight to the right portal.
  useEffect(() => {
    if (session.status === "authenticated" && session.role) {
      router.replace(postLoginPath(session.role, next));
    }
  }, [session.status, session.role, next, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    // Required fields: explained beside each field (the button stays enabled so the reason is shown).
    const fe: { username?: string; password?: string } = {};
    if (username.trim().length < 3) fe.username = "Enter your username or e-mail address.";
    if (!password) fe.password = "Enter your password.";
    setFieldErrors(fe);
    if (fe.username || fe.password) return;
    setSubmitting(true);
    setError(null);
    try {
      const user = await session.login(username, password);
      router.replace(postLoginPath(user.role, next));
    } catch (err) {
      setError(err);
      setPassword("");
      if (isApiError(err) && err.status === 401) setFailures((n) => n + 1);
      setSubmitting(false);
    }
  }

  if (session.status === "loading" || session.status === "authenticated") {
    return <LoadingBlock label={session.status === "authenticated" ? "Opening your portal…" : "Checking your session…"} />;
  }

  const notActivated = isApiError(error) && error.code === "ACCOUNT_NOT_ACTIVATED";
  // Backend login checks, in order: suspended, not activated, awaiting approval (all 403 after a correct password).
  // Suspended, deactivated, archived or awaiting approval (all 403 after a correct password): lib/auth/login-refusals.ts.
  const statusMessage = isApiError(error) ? accountRefusalMessage(error.code) : null;

  return (
    <form
      method="post"
      onSubmit={onSubmit}
      noValidate
      className="mx-auto w-full max-w-md space-y-5 [&_input]:h-12 [&_input]:rounded-xl [&_input]:text-base [&_label.block]:text-slate-800 sm:[&_input]:text-sm"
      data-testid="login-form"
    >
      <div>
        <h1 className="text-[28px] font-extrabold tracking-tight text-[#0b1f4d] sm:text-[32px]">Sign in</h1>
        <p className="mt-1.5 text-[15px] text-slate-600">Enter your account details to continue.</p>
      </div>

      {notice && error == null && <Alert tone="success">{LOGIN_NOTICE_TEXT[notice]}</Alert>}

      {error != null && (
        <Alert tone="error">
          {notActivated ? (
            <>
              Your account isn&apos;t activated yet. Open the link in your e-mail, or{" "}
              <Link href="/activate" className="font-semibold underline">
                send a new activation link
              </Link>
              .
            </>
          ) : statusMessage ? (
            <>
              {statusMessage}{" "}
              <Link href="/support" className="font-semibold underline">
                Get help
              </Link>
            </>
          ) : isApiError(error) && error.status === 401 ? (
            <>
              Invalid username or password.
              {failures >= 2 && (
                <>
                  {" "}
                  <Link href="/forgot-password" className="font-semibold underline">
                    Forgot your password?
                  </Link>
                </>
              )}
            </>
          ) : (
            errorMessage(error)
          )}
        </Alert>
      )}

      <TextField
        label="Username or email"
        name="username"
        autoComplete="username"
        autoFocus
        required
        minLength={3}
        maxLength={254}
        value={username}
        onChange={(e) => {
          setUsername(e.target.value);
          setFieldErrors((s) => ({ ...s, username: undefined }));
        }}
        error={fieldErrors.username}
        placeholder="Enter your username or email"
      />

      <div>
        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          required
          maxLength={100}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setFieldErrors((s) => ({ ...s, password: undefined }));
          }}
          error={fieldErrors.password}
          placeholder="Enter your password"
        />
        <div className="mt-1 flex justify-end">
          <Link href="/forgot-password" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline" data-testid="login-forgot">
            Forgot password?
          </Link>
        </div>
      </div>

      <Button type="submit" variant="brand" loading={submitting} className="h-12 w-full rounded-xl text-[15px]">
        {submitting ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-center text-sm text-slate-700">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-semibold text-brand hover:underline" data-testid="login-create-account">
          Create account
        </Link>
      </p>

      <p className="text-center text-xs text-slate-600">
        Need help?{" "}
        <Link href="/support" className="font-medium text-brand hover:underline">
          Help and support
        </Link>
      </p>
    </form>
  );
}
