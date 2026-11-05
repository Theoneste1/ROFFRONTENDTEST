"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { authApi } from "@/lib/api/auth";
import { errorMessage, fieldErrors, isApiError } from "@/lib/api/errors";
import { Alert } from "@/app/components/ui/feedback";
import { Button } from "@/app/components/ui/form";
import NewPasswordFields, { validateNewPassword } from "@/app/components/auth/NewPasswordFields";

export default function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);

  const mutation = useMutation({ mutationFn: () => authApi.resetPassword(token, password) });

  const local = touched ? validateNewPassword(password, confirm) : {};
  const server = fieldErrors(mutation.error, ["newPassword"]);
  const errors = { password: local.password ?? server.newPassword, confirm: local.confirm };

  const badLink =
    !token ||
    (isApiError(mutation.error) &&
      (mutation.error.code === "INVALID_RESET_TOKEN" || fieldErrors(mutation.error, ["token"]).token !== undefined));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    const v = validateNewPassword(password, confirm);
    if (v.password || v.confirm || mutation.isPending) return;
    mutation.mutate();
  }

  if (mutation.isSuccess) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Password changed</h1>
        <Alert tone="success">Your password has been reset. For your security, you have been signed out on every device.</Alert>
        <Link href="/login" className="block">
          <span className="w-full inline-flex justify-center px-6 py-3 text-sm font-semibold rounded-lg bg-[#2B2BB2] hover:bg-[#232c94] text-white shadow-md">
            Sign in
          </span>
        </Link>
      </div>
    );
  }

  if (badLink) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Link not valid</h1>
        <Alert tone="error">This reset link is invalid or has expired. Links are valid for 30 minutes, and only the newest link works.</Alert>
        <Link href="/forgot-password" className="text-sm font-semibold text-[#2B2BB2] hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Choose a new password</h1>
        <p className="mt-1 text-sm text-slate-500">You&apos;ll be signed out everywhere and can sign in with the new password.</p>
      </div>
      {mutation.isError && !server.newPassword && <Alert tone="error">{errorMessage(mutation.error)}</Alert>}
      <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} errors={errors} />
      <Button type="submit" loading={mutation.isPending} className="w-full">
        Reset password
      </Button>
    </form>
  );
}
