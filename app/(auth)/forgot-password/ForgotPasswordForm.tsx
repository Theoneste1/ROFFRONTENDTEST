"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { errorMessage, fieldErrors } from "@/lib/api/errors";
import { Alert } from "@/app/components/ui/feedback";
import { Button, TextField } from "@/app/components/ui/form";

/**
 * `POST /auth/forgot-password` always answers 200 with the same message
 * (no account enumeration). Un-activated accounts get a fresh activation link.
 */
export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const mutation = useMutation({ mutationFn: (value: string) => authApi.forgotPassword(value) });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!mutation.isPending) mutation.mutate(email);
  }

  const emailError = fieldErrors(mutation.error, ["email"]).email;

  return (
    <div className="space-y-5">
      <Link href="/login" className="inline-flex items-center text-xs font-semibold text-gray-600 hover:text-gray-900">
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to sign in
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Forgot your password?</h1>
        <p className="mt-1 text-sm text-slate-500">Enter the e-mail address of your account and we&apos;ll send you a link to choose a new password.</p>
      </div>

      {mutation.isSuccess ? (
        <Alert tone="success">
          {mutation.data.message ||
            "If an account exists for that address, a reset link is on its way. The link is valid for 30 minutes; only the newest link works."}
        </Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          {mutation.isError && !emailError && <Alert tone="error">{errorMessage(mutation.error)}</Alert>}
          <TextField
            label="E-mail address"
            type="email"
            name="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={emailError ? "Enter a valid e-mail address." : undefined}
          />
          <Button type="submit" loading={mutation.isPending} disabled={!email.includes("@")} className="w-full">
            Send reset link
          </Button>
        </form>
      )}
    </div>
  );
}
