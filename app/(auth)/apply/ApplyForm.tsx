"use client";

/**
 * Coach application (`POST /mentor-requests`). Coaches are the people who
 * mentor ROF students (the platform's MENTOR accounts). An administrator reviews
 * the request (Coaches → Applications) and the applicant is e-mailed the decision.
 * School teachers have no accounts yet: `?as=teacher` explains that and links
 * to the contact form instead.
 */
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { publicApi } from "@/lib/api/auth";
import { errorMessage, fieldErrors, isApiError } from "@/lib/api/errors";
import { Alert } from "@/app/components/ui/feedback";
import { Button, TextField } from "@/app/components/ui/form";
import NewPasswordFields, { validateNewPassword } from "@/app/components/auth/NewPasswordFields";

const USERNAME = /^[a-z0-9._-]{3,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FIELDS = ["firstName", "lastName", "username", "email", "password"] as const;
type F = (typeof FIELDS)[number] | "confirm";

export default function ApplyForm() {
  const teacher = useSearchParams().get("as") === "teacher";
  const role = "Coach";
  const [v, setV] = useState({ firstName: "", lastName: "", username: "", email: "" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Partial<Record<F, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof v) => (val: string) => setV((s) => ({ ...s, [k]: val }));

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (submitting) return;
    const e: Partial<Record<F, string>> = {};
    if (v.firstName.trim().length < 2) e.firstName = "Enter your first name (at least 2 characters).";
    if (v.lastName.trim().length < 2) e.lastName = "Enter your last name (at least 2 characters).";
    if (!USERNAME.test(v.username)) e.username = "3–30 characters: lowercase letters, digits, “.”, “_” or “-”.";
    if (!EMAIL.test(v.email.trim())) e.email = "Enter a valid e-mail address.";
    const p = validateNewPassword(password, confirm);
    if (p.password) e.password = p.password;
    if (p.confirm) e.confirm = p.confirm;
    setErrors(e);
    setError(null);
    if (Object.keys(e).length) return;
    setSubmitting(true);
    try {
      await publicApi.applyAsMentor({ firstName: v.firstName.trim(), lastName: v.lastName.trim(), username: v.username, email: v.email.trim(), password });
      setDone(true);
    } catch (err) {
      setError(err);
      setErrors(fieldErrors(err, FIELDS));
    } finally {
      setSubmitting(false);
    }
  }

  if (teacher) {
    return (
      <div className="space-y-5" data-testid="apply-teacher">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Join as a teacher</h1>
        <Alert tone="info">Teacher accounts are not available on ROF LMS yet.</Alert>
        <p className="text-sm text-slate-700">
          If you teach at a school and would like to connect your students with the Rwanda Olympiad Foundation, send us a message and we will get in touch.
        </p>
        <Link href="/?subject=teacher#contact" className="inline-flex w-full items-center justify-center rounded-lg bg-[#2B2BB2] px-6 py-3 text-sm font-semibold text-white hover:bg-[#232c94]">
          Contact us
        </Link>
        <p className="text-center text-sm text-slate-500">
          Want to mentor ROF students? <Link href="/apply" className="font-medium text-[#2B2BB2] hover:underline">Apply as a coach</Link>
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-5" data-testid="apply-done">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Application received</h1>
        <Alert tone="success">Thank you for applying to join ROF LMS as a {role.toLowerCase()}.</Alert>
        <p className="text-sm text-slate-700">
          An administrator will review your application. You will receive an e-mail at <strong>{v.email.trim()}</strong> with the decision. Once approved, sign in with the username and password you chose.
        </p>
        <Link href="/" className="inline-flex w-full items-center justify-center rounded-lg bg-[#2B2BB2] px-6 py-3 text-sm font-semibold text-white hover:bg-[#232c94]">
          Back to the homepage
        </Link>
      </div>
    );
  }

  const taken = isApiError(error) && error.code === "IDENTITY_TAKEN";
  const fieldErr = Object.keys(fieldErrors(error, FIELDS)).length > 0;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Join as a {role.toLowerCase()}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Coaches mentor ROF students: you prepare assignments, share resources and review student work for the courses you are assigned. An administrator reviews every application.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          A school teacher? <Link href="/?subject=teacher#contact" className="font-medium text-[#2B2BB2] hover:underline">Contact us</Link> to connect your school.
        </p>
      </div>

      {error != null && !fieldErr && (
        <Alert tone="error">
          {taken ? "That username or e-mail is already in use or has a pending application. Try another, or sign in if you already have an account." : errorMessage(error)}
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="First name" name="firstName" autoComplete="given-name" required maxLength={50} value={v.firstName} onChange={(e) => set("firstName")(e.target.value)} error={errors.firstName} />
        <TextField label="Last name" name="lastName" autoComplete="family-name" required maxLength={50} value={v.lastName} onChange={(e) => set("lastName")(e.target.value)} error={errors.lastName} />
      </div>
      <TextField label="Username" name="username" autoComplete="username" required maxLength={30} value={v.username} onChange={(e) => set("username")(e.target.value.toLowerCase())} error={errors.username} hint="Lowercase letters, digits, “.”, “_” or “-”." />
      <TextField label="E-mail" name="email" type="email" autoComplete="email" required maxLength={254} value={v.email} onChange={(e) => set("email")(e.target.value)} error={errors.email} hint="We'll e-mail you the decision on your application." />
      <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} errors={{ password: errors.password, confirm: errors.confirm }} label="Password" />

      <Button type="submit" loading={submitting} className="w-full">
        {submitting ? "Sending your application…" : `Apply as a ${role.toLowerCase()}`}
      </Button>

      <p className="text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-[#2B2BB2] hover:underline">Sign in</Link>
        {" · "}
        <Link href="/" className="font-medium text-[#2B2BB2] hover:underline">Home</Link>
      </p>
    </form>
  );
}
