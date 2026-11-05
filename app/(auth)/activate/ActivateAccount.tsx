"use client";

/**
 * Account activation.
 *
 * 1. `POST /auth/activation/inspect` says who the link is for and whether a
 *    password must be chosen (invitations) or not (e-mail confirmation).
 * 2. `POST /auth/activate` completes it. The user then signs in.
 *
 * Without a valid token the page offers `POST /auth/resend-activation`.
 * Activation needs an explicit click so that link scanners in mail clients
 * cannot use up the one-time link.
 */
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { authApi } from "@/lib/api/auth";
import { errorMessage, fieldErrors } from "@/lib/api/errors";
import { Alert, LoadingBlock } from "@/app/components/ui/feedback";
import { Button, TextField } from "@/app/components/ui/form";
import NewPasswordFields, { validateNewPassword } from "@/app/components/auth/NewPasswordFields";

export default function ActivateAccount() {
  const token = useSearchParams().get("token") ?? "";

  const inspect = useQuery({
    queryKey: ["activation", token],
    queryFn: () => authApi.inspectActivation(token),
    enabled: token.length > 0,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  if (!token) return <ResendActivation />;
  if (inspect.isPending) return <LoadingBlock label="Checking your link…" />;
  if (inspect.isError) return <ResendActivation invalidLink />;

  return <ActivateForm token={token} info={inspect.data} />;
}

function ActivateForm({ token, info }: { token: string; info: { firstName: string; username: string; email: string; requiresPassword: boolean } }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);

  const mutation = useMutation({
    mutationFn: () => authApi.activate(token, info.requiresPassword ? password : undefined),
  });

  const local = touched && info.requiresPassword ? validateNewPassword(password, confirm) : {};
  const server = fieldErrors(mutation.error, ["password"]);
  const errors = { password: local.password ?? server.password, confirm: local.confirm };

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (info.requiresPassword) {
      const v = validateNewPassword(password, confirm);
      if (v.password || v.confirm) return;
    }
    if (!mutation.isPending) mutation.mutate();
  }

  if (mutation.isSuccess) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Account activated</h1>
        <Alert tone="success">
          Welcome, {info.firstName}! Your account is ready. Sign in with the username <strong>{mutation.data.username}</strong>.
        </Alert>
        <Link href="/login" className="block">
          <span className="w-full inline-flex justify-center px-6 py-3 text-sm font-semibold rounded-lg bg-[#2B2BB2] hover:bg-[#232c94] text-white shadow-md">
            Sign in
          </span>
        </Link>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome, {info.firstName}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {info.requiresPassword
            ? "Choose a password to activate your account."
            : "Confirm your e-mail address to activate your account."}
        </p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
        <dt className="text-slate-500">Username</dt>
        <dd className="font-medium text-slate-800 break-all">{info.username}</dd>
        <dt className="text-slate-500">E-mail</dt>
        <dd className="font-medium text-slate-800 break-all">{info.email}</dd>
      </dl>

      {mutation.isError && !server.password && <Alert tone="error">{errorMessage(mutation.error)}</Alert>}

      {info.requiresPassword && (
        <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} errors={errors} label="Password" />
      )}

      <Button type="submit" loading={mutation.isPending} className="w-full">
        Activate account
      </Button>
    </form>
  );
}

function ResendActivation({ invalidLink = false }: { invalidLink?: boolean }) {
  const [email, setEmail] = useState("");
  const mutation = useMutation({ mutationFn: (value: string) => authApi.resendActivation(value) });
  const emailError = fieldErrors(mutation.error, ["email"]).email;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!mutation.isPending) mutation.mutate(email);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{invalidLink ? "Link not valid" : "Activate your account"}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {invalidLink
            ? "This activation link is invalid, has already been used, or has expired."
            : "Open the activation link from your e-mail, or request a new one below."}
        </p>
      </div>

      {mutation.isSuccess ? (
        <Alert tone="success">
          {mutation.data.message || "If an account is waiting for activation at that address, a new link has been sent."}
        </Alert>
      ) : (
        <form method="post" onSubmit={onSubmit} noValidate className="space-y-5">
          {mutation.isError && !emailError && <Alert tone="error">{errorMessage(mutation.error)}</Alert>}
          <TextField
            label="E-mail address"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={emailError ? "Enter a valid e-mail address." : undefined}
          />
          <Button type="submit" loading={mutation.isPending} disabled={!email.includes("@")} className="w-full">
            Send a new activation link
          </Button>
        </form>
      )}

      <Link href="/login" className="block text-center text-sm font-medium text-[#2B2BB2] hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}
