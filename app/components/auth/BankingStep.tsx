"use client";

/**
 * Shown instead of the portal while a Teacher, Coach or Head Coach has not completed their banking information
 * (capability bankingDetails; owner 2026-11-25). Every portal page shows it (RoleGate), and the backend refuses every
 * other request until it is done (403 BANKING_DETAILS_REQUIRED), so it cannot be skipped by a refresh, an address, the
 * menu or another tab. What is already saved is shown and kept; the user can sign out at any time.
 *
 *  - Teachers: personal and school details (six fields). With a backend advertising managedBanks (owner 2026-11-27)
 *    both banks are chosen from the list the Super Administrator manages (Umwalimu SACCO suggested), and each account
 *    number follows its chosen bank: Umwalimu SACCO exactly 12 digits, another bank its own rule; the instruction
 *    under the number changes as soon as the bank changes. Older backends: both banks fixed to Umwalimu SACCO.
 *  - Coaches and Head Coaches: their personal details only (three fields; the bank chosen from the list). No school
 *    section, no school check, no school confirmation; school details saved earlier are left as they are.
 */
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, Landmark, Lock, School } from "lucide-react";
import { bankingApi } from "@/lib/api/banking";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { queryKeys } from "@/lib/query/keys";
import { useSession } from "@/lib/auth/session";
import { Button, TextField } from "@/app/components/ui/form";
import { Alert, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import {
  asksSchool, conflictsOf, FIELD_LABELS, initialValues, managedBanks, numberInstruction, numericBank, rulesFor, submissionOf, UMWALIMU_SACCO, validateBanking, type BankingSubmission,
  type BankingField, type BankingValues, type BankingView, type FixableBankField,
} from "@/lib/accounts/banking";

const selectCls = (bad: boolean) =>
  `w-full px-4 py-3 bg-white border rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 transition-all ${bad ? "border-red-400 focus:ring-red-500/20 focus:border-red-500" : "border-slate-300 focus:ring-indigo-500/20 focus:border-indigo-500"}`;

export default function BankingStep({ firstName, role }: { firstName: string; role: string }) {
  const view = useQuery({ queryKey: ["me", "banking"], queryFn: bankingApi.mine, retry: 1 });
  const { logout } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = (
    <button
      type="button"
      className="inline-flex min-h-11 items-center text-sm text-slate-600 underline hover:text-slate-800 disabled:opacity-60"
      disabled={signingOut}
      onClick={async () => {
        setSigningOut(true);
        await logout();
      }}
      data-testid="banking-sign-out"
    >
      {signingOut ? "Signing out…" : "Sign out"}
    </button>
  );

  return (
    <main className="min-h-screen w-full bg-[#e2e8f0] px-4 py-8 sm:py-12" data-testid="banking-step">
      <div className="mx-auto w-full max-w-2xl">
        {view.isPending ? (
          <div className="rounded-2xl bg-white p-6 shadow-sm"><LoadingBlock label="Loading your banking information…" /></div>
        ) : view.isError ? (
          <div className="space-y-4">
            <ErrorState error={view.error} title="Couldn't load your banking information" onRetry={() => view.refetch()} />
            <div className="text-center">{signOut}</div>
          </div>
        ) : (
          <BankingForm firstName={firstName} role={role} view={view.data} signOut={signOut} />
        )}
      </div>
    </main>
  );
}

export interface BankingFormProps {
  firstName: string;
  role: string;
  view: BankingView;
  /** The step only: the sign-out link. */
  signOut?: ReactNode;
  /**
   * "step" (default): the first-sign-in step. "edit": changing saved details later — the owner in Settings, or an
   * administrator on the person's page (owner 2026-11-25). Same fields and rules; "Save changes" / "Cancel".
   */
  variant?: "step" | "edit";
  /** Where the details are saved (default: the signed-in user's own, PUT /me/banking). */
  save?: (body: BankingSubmission) => Promise<unknown>;
  onSaved?: () => void;
  onCancel?: () => void;
  /** "edit": the heading (default "Edit banking information"). */
  title?: string;
  /** false when an administrator edits someone else's details: "Personal bank account", not "Your …". */
  owner?: boolean;
}

export function BankingForm({ firstName, role, view, signOut, variant = "step", save, onSaved, onCancel, title, owner = true }: BankingFormProps) {
  const editing = variant === "edit";
  const queryClient = useQueryClient();
  const rules = view.rules ?? rulesFor(role);
  const school = asksSchool(rules);
  const [values, setValues] = useState<BankingValues>(() => initialValues({ ...view, rules }));
  const [errors, setErrors] = useState<Partial<Record<BankingField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // A bank saved earlier that this role may not use (e.g. after a role change): shown in its field, marked for
  // correction, and replaced by Umwalimu SACCO only when the user ticks the confirmation for that field.
  const conflicts = useMemo(() => conflictsOf({ ...view, rules }), [view, rules]);
  const [confirmed, setConfirmed] = useState<Set<FixableBankField>>(() => new Set());
  const toggleConfirm = (f: FixableBankField, on: boolean) => {
    setConfirmed((s) => {
      const next = new Set(s);
      if (on) next.add(f);
      else next.delete(f);
      return next;
    });
    setErrors((e) => ({ ...e, [f]: undefined }));
  };

  const set = (f: BankingField) => (v: string) => {
    setValues((s) => ({ ...s, [f]: v }));
    setErrors((e) => ({ ...e, [f]: undefined }));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problems = validateBanking(rules, values, conflicts, confirmed, view.details);
    setErrors(problems);
    setFormError(null);
    if (Object.keys(problems).length) {
      setFormError("Check the highlighted fields and try again.");
      const first = Object.keys(problems)[0];
      (document.getElementById(`banking-${first}`) ?? document.getElementById(`banking-confirm-${first}`))?.focus();
      return;
    }
    setSaving(true);
    try {
      const body = submissionOf(rules, values, confirmed);
      if (editing) {
        await (save ?? bankingApi.save)(body);
        onSaved?.();
        return;
      }
      const result = await bankingApi.save(body);
      queryClient.setQueryData(["me", "banking"], result);
      setSaved(true);
    } catch (err) {
      const fields = isApiError(err) && err.code === "BANKING_INVALID" ? (err.details as { fields?: Partial<Record<BankingField, string>> } | undefined)?.fields : undefined;
      if (fields) setErrors(fields);
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <section className="rounded-2xl bg-white p-6 text-center shadow-sm sm:p-10" data-testid="banking-saved" aria-live="polite">
        <CircleCheck className="mx-auto h-12 w-12 text-emerald-600" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Your banking information has been saved</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Thank you, {firstName}. You can now continue to your dashboard. You can change these details at any time in Settings.</p>
        <Button
          type="button"
          className="mt-6 w-full sm:w-auto"
          onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.me.all })}
          data-testid="banking-continue"
        >
          Continue to my dashboard
        </Button>
      </section>
    );
  }

  const field = (f: BankingField, extra: { hint?: ReactNode; inputMode?: "numeric"; autoComplete?: string } = {}) => (
    <TextField
      id={`banking-${f}`}
      label={FIELD_LABELS[f]}
      name={f}
      required
      value={values[f]}
      onChange={(e) => set(f)(e.target.value)}
      error={errors[f]}
      hint={extra.hint}
      inputMode={extra.inputMode}
      autoComplete={extra.autoComplete ?? "off"}
      maxLength={f.endsWith("Number") ? 40 : 200}
    />
  );

  const fixedBank = (f: FixableBankField, note: string) => {
    const conflict = conflicts.find((c) => c.field === f);
    return (
      <div data-testid={`banking-bank-${f}`}>
        <p className="mb-2 block text-sm font-semibold text-slate-700" id={`banking-${f}-label`}>
          {FIELD_LABELS[f]} <span className="text-red-500">*</span>
        </p>
        {conflict && (
          // The saved value, kept as it is until the user confirms its replacement.
          <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm" data-testid={`banking-conflict-${f}`}>
            <p className="font-semibold text-red-900">
              Needs correction: your saved bank is “<span data-testid={`banking-saved-${f}`}>{conflict.saved}</span>”.
            </p>
            <p className="mt-0.5 text-xs text-red-900/80">Only {UMWALIMU_SACCO} can be used here. It stays saved until you confirm the change below.</p>
            <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 font-medium text-slate-900">
              <input
                type="checkbox"
                id={`banking-confirm-${f}`}
                className="h-4 w-4 accent-[#00428C]"
                checked={confirmed.has(f)}
                onChange={(e) => toggleConfirm(f, e.target.checked)}
                aria-describedby={errors[f] ? `banking-${f}-error` : undefined}
                data-testid={`banking-confirm-${f}`}
              />
              Replace “{conflict.saved}” with {UMWALIMU_SACCO}
            </label>
          </div>
        )}
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900" aria-labelledby={`banking-${f}-label`} data-testid={`banking-fixed-${f}`}>
          <Lock className="h-4 w-4 flex-shrink-0 text-slate-500" aria-hidden="true" /> {UMWALIMU_SACCO}
        </div>
        {errors[f] ? (
          <p id={`banking-${f}-error`} className="mt-1.5 text-xs text-red-600">{errors[f]}</p>
        ) : (
          <p className="mt-1.5 text-xs text-slate-600">{note}</p>
        )}
      </div>
    );
  };

  /** A bank chosen from the list the Super Administrator manages; the account number's instruction follows the choice. */
  const bankSelect = (f: FixableBankField) => (
    <div data-testid={`banking-bank-${f}`}>
      <label htmlFor={`banking-${f}`} className="mb-2 block text-sm font-semibold text-slate-700">
        {FIELD_LABELS[f]} <span className="text-red-500">*</span>
      </label>
      <select
        id={`banking-${f}`}
        name={f}
        value={values[f]}
        onChange={(e) => set(f)(e.target.value)}
        aria-invalid={errors[f] ? true : undefined}
        aria-describedby={errors[f] ? `banking-${f}-error` : undefined}
        className={selectCls(!!errors[f])}
        required
      >
        <option value="">Choose the bank</option>
        {rules.banks.map((b) => <option key={b} value={b}>{b}</option>)}
        {/* A saved bank no longer offered: shown so the user sees it (kept as long as it is not changed). */}
        {values[f] && !rules.banks.includes(values[f]) && <option value={values[f]}>{values[f]}</option>}
      </select>
      {errors[f] && <p id={`banking-${f}-error`} className="mt-1.5 text-xs text-red-600">{errors[f]}</p>}
    </div>
  );
  const managed = managedBanks(rules);
  const numberHint = (bank: string, legacyDigits?: number | null) => (
    <span data-testid="banking-number-hint">{numberInstruction(rules, bank, legacyDigits)}</span>
  );

  const missing = view.missing.map((f) => FIELD_LABELS[f]);

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5" data-testid="banking-form">
      <header className={editing ? "rounded-2xl border border-gray-100 bg-white p-5 sm:p-6" : "rounded-2xl bg-white p-6 shadow-sm sm:p-8"}>
        {editing ? (
          <h2 className="text-lg font-bold text-slate-900">{title ?? "Edit banking information"}</h2>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">One more step, {firstName}</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">Complete Your Banking Information</h1>
          </>
        )}
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {editing
            ? school ? "Personal and school banking information." : "Personal banking information."
            : school
              ? "To complete your profile, please provide your personal and school banking information."
              : "To complete your profile, please provide your personal banking information."}{" "}
          Rwanda Olympiad Foundation requires these details for administrative and payment-related processes.
        </p>
        <p className="mt-3 text-xs text-slate-500">Fields marked <span className="text-red-500">*</span> are required.</p>
        {view.status === "PARTIAL" && missing.length > 0 && (
          <div className="mt-4"><Alert tone="info">Some of your details are already saved. Still needed: {missing.join(", ")}.</Alert></div>
        )}
        {view.status === "NEEDS_CORRECTION" && (
          <div className="mt-4"><Alert tone="error">Some saved details need correcting: {view.invalid.map((f) => FIELD_LABELS[f]).join(", ")}.</Alert></div>
        )}
      </header>

      <Section icon={<Landmark className="h-5 w-5" aria-hidden="true" />} title={owner ? "Your personal bank account" : "Personal bank account"} testId="banking-personal">
        {field("personalAccountName", { hint: owner ? "Your name exactly as it appears on the account." : "The name exactly as it appears on the account.", autoComplete: owner ? "name" : "off" })}
        {rules.personalBank === "FIXED" ? fixedBank("personalBankName", "Teachers are paid through Umwalimu SACCO.") : bankSelect("personalBankName")}
        {field("personalAccountNumber", {
          inputMode: (managed ? numericBank(rules, values.personalBankName) : !!rules.personalNumberDigits) ? "numeric" : undefined,
          hint: numberHint(values.personalBankName, rules.personalNumberDigits),
        })}
      </Section>

      {/* The school's details: Teachers only (Coaches and Head Coaches are not asked). */}
      {school && (
        <Section icon={<School className="h-5 w-5" aria-hidden="true" />} title={owner ? "Your school's bank account" : "School's bank account"} testId="banking-school">
          {field("schoolAccountName", { hint: "The school's account name exactly as the bank shows it." })}
          {rules.schoolBank === "LIST" ? bankSelect("schoolBankName") : fixedBank("schoolBankName", "School accounts are held at Umwalimu SACCO.")}
          {field("schoolAccountNumber", {
            inputMode: (managed ? numericBank(rules, values.schoolBankName) : !!rules.schoolNumberDigits) ? "numeric" : undefined,
            hint: numberHint(values.schoolBankName, rules.schoolNumberDigits),
          })}
        </Section>
      )}

      <div className="space-y-3 rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        {formError && <Alert tone="error">{formError}</Alert>}
        <div className={editing ? "flex flex-col-reverse gap-3 sm:flex-row sm:justify-end" : ""}>
          {editing && onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel} disabled={saving} data-testid="banking-cancel">Cancel</Button>
          )}
          <Button type="submit" loading={saving} className={editing ? "" : "w-full"} data-testid="banking-submit">
            {saving ? "Saving…" : editing ? "Save changes" : "Submit banking information"}
          </Button>
        </div>
        <p className="text-center text-xs text-slate-500">These details are visible only to their owner and to authorised ROF administrators.</p>
        {signOut && <div className="text-center">{signOut}</div>}
      </div>
      <div className="sr-only" aria-live="polite">{saving ? "Saving…" : ""}</div>
    </form>
  );
}

function Section({ icon, title, testId, children }: { icon: ReactNode; title: string; testId: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-8" aria-labelledby={`${testId}-title`} data-testid={testId}>
      <h2 id={`${testId}-title`} className="flex items-center gap-2 text-lg font-bold text-slate-900">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand">{icon}</span>
        {title}
      </h2>
      <div className="mt-5 grid gap-5">{children}</div>
    </section>
  );
}
