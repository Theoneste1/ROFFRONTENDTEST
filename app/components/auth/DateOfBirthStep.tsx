"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { meApi } from "@/lib/api/auth";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { birthDateBounds, dateOfBirthProblem } from "@/lib/accounts/student-details";
import { queryKeys } from "@/lib/query/keys";
import { useSession } from "@/lib/auth/session";
import { Button, TextField } from "@/app/components/ui/form";

/**
 * Shown instead of the student portal while the student has no date of birth (owner decision 9.3). The student can
 * give it or sign out — nothing else (the API refuses everything else until then).
 */
export default function DateOfBirthStep({ firstName }: { firstName: string }) {
  const queryClient = useQueryClient();
  const { logout } = useSession();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const bounds = birthDateBounds(new Date());

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = dateOfBirthProblem(value);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const profile = await meApi.setDateOfBirth(value);
      queryClient.setQueryData(queryKeys.me.profile(), profile);
      await queryClient.invalidateQueries({ queryKey: queryKeys.me.all });
    } catch (err) {
      if (isApiError(err) && err.code === "DATE_OF_BIRTH_ALREADY_SET") {
        // Already recorded (another tab, or an Administrator): reload the profile and continue.
        await queryClient.invalidateQueries({ queryKey: queryKeys.me.all });
      } else {
        setError(isApiError(err) && err.validationMessages.length ? "Enter a valid date of birth (students are 5 to 30 years old)." : errorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-canvas p-4">
      <div className="max-w-md w-full rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">One more step, {firstName}</h1>
        <p className="mt-2 text-sm text-slate-600">
          Add your date of birth to continue. You give it once; if it is ever wrong, ask an administrator to correct it.
        </p>
        <form className="mt-5 space-y-4" onSubmit={onSubmit} noValidate>
          <TextField
            label="Date of birth"
            name="dateOfBirth"
            type="date"
            autoComplete="bday"
            required
            min={bounds.min}
            max={bounds.max}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            error={error ?? undefined}
          />
          <Button type="submit" loading={saving} className="w-full">
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
