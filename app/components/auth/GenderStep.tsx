"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { meApi } from "@/lib/api/auth";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { validateGender, type Gender } from "@/lib/accounts/gender";
import { queryKeys } from "@/lib/query/keys";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/app/components/ui/form";
import GenderField from "@/app/components/account/GenderField";

/**
 * Shown instead of the portal while a student, teacher or coach has no gender (capability genderStep; owner,
 * 2026-11-20): accounts from before gender was asked at sign-up give it once (PUT /me/gender). They can give it or sign
 * out. An administrator corrects it later if needed.
 */
export default function GenderStep({ firstName }: { firstName: string }) {
  const queryClient = useQueryClient();
  const { logout } = useSession();
  const [value, setValue] = useState<Gender | "">("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = validateGender(value);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const profile = await meApi.setGender(value as Gender);
      queryClient.setQueryData(queryKeys.me.profile(), profile);
      await queryClient.invalidateQueries({ queryKey: queryKeys.me.all });
    } catch (err) {
      if (isApiError(err) && err.code === "GENDER_ALREADY_SET") {
        // Already recorded (another tab, or an administrator): reload the profile and continue.
        await queryClient.invalidateQueries({ queryKey: queryKeys.me.all });
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-[#e2e8f0] p-4" data-testid="gender-step">
      <div className="max-w-md w-full rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">One more step, {firstName}</h1>
        <p className="mt-2 text-sm text-slate-600">
          Please tell us your gender to continue. You give it once; if it is ever wrong, ask an administrator to correct it.
        </p>
        <form className="mt-5 space-y-4" onSubmit={onSubmit} noValidate>
          <GenderField
            value={value}
            onChange={(g) => {
              setValue(g);
              setError(null);
            }}
            error={error ?? undefined}
          />
          <Button type="submit" loading={saving} className="w-full" data-testid="gender-step-continue">
            Continue
          </Button>
        </form>
        <div className="mt-4 text-center">
          <button
            type="button"
            className="text-sm text-slate-600 underline hover:text-slate-700 disabled:opacity-60"
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              await logout();
            }}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
        <div className="sr-only" aria-live="polite">{saving ? "Saving…" : ""}</div>
      </div>
    </main>
  );
}
