"use client";

/**
 * Student self-registration (`POST /auth/register/student`). Field rules mirror
 * the backend DTO. What happens next comes from the response: e-mail activation
 * and/or administrator approval, or signing in straight away. Administrators can
 * close self-registration (403 REGISTRATION_CLOSED).
 *
 * School: a backend advertising `schoolAffiliations` (GET /api/v1) takes a school
 * from the official directory, a Rwandan school that isn't listed, or a school
 * abroad (SchoolClaimFields); every other backend — and an unknown one — gets the
 * legacy name + location fields, which both accept.
 */
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { publicApi, type RegisterStudentResult } from "@/lib/api/auth";
import type { GradeLevel } from "@/lib/api/types";
import { errorMessage, fieldErrors, isApiError } from "@/lib/api/errors";
import { Alert } from "@/app/components/ui/feedback";
import { Button, TextField } from "@/app/components/ui/form";
import NewPasswordFields, { validateNewPassword } from "@/app/components/auth/NewPasswordFields";
import SchoolClaimFields, { emptyDraft } from "@/app/components/account/SchoolClaimFields";
import { hasFeature } from "@/lib/api/capabilities";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import {
  SCHOOL_CLAIM_ERRORS,
  SCHOOL_CLAIM_SERVER_FIELDS,
  schoolClaimPayload,
  validateSchoolClaim,
  type SchoolClaimDraft,
  type SchoolClaimField,
} from "@/lib/accounts/school-claim";

const GRADES: GradeLevel[] = ["S1", "S2", "S3", "S4", "S5", "S6"];
const USERNAME = /^[a-z0-9._-]{3,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FIELDS = ["firstName", "lastName", "username", "email", "password", "gradeLevel", "schoolName", "schoolLocation", "homeLocation"] as const;
type F = (typeof FIELDS)[number] | "confirm";
const CLAIM_SERVER_FIELDS = Object.keys(SCHOOL_CLAIM_SERVER_FIELDS);

const REGISTER_ERRORS: Readonly<Record<string, string>> = {
  REGISTRATION_CLOSED: "Student registration is closed at the moment. Please try again later or contact us.",
  IDENTITY_TAKEN: "That username or e-mail is already in use. Try another, or sign in if you already have an account.",
  NO_CURRENT_ACADEMIC_YEAR: "Registration isn't open yet: the new school year hasn't started on ROF LMS. Please try again later.",
  ...SCHOOL_CLAIM_ERRORS,
};

export default function RegisterForm() {
  const [v, setV] = useState({ firstName: "", lastName: "", username: "", email: "", gradeLevel: "" as GradeLevel | "", schoolName: "", schoolLocation: "", homeLocation: "" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Partial<Record<F, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<RegisterStudentResult | null>(null);
  const [schools, setSchools] = useState<{ id: string; name: string; location: string }[]>([]);
  const set = (k: keyof typeof v) => (val: string) => setV((s) => ({ ...s, [k]: val }));
  const { detection, loading: detecting } = useBackendCapabilities();
  const directory = hasFeature(detection, "schoolAffiliations");
  const [claim, setClaim] = useState<SchoolClaimDraft>(() => emptyDraft("directory"));
  const [claimErrors, setClaimErrors] = useState<Partial<Record<SchoolClaimField, string>>>({});

  // School name suggestions from the public search (2+ characters, debounced).
  useEffect(() => {
    const q = v.schoolName.trim();
    if (q.length < 2) return;
    const t = setTimeout(() => {
      publicApi.searchSchools(q).then(setSchools, () => setSchools([]));
    }, 300);
    return () => clearTimeout(t);
  }, [v.schoolName]);

  function onSchool(name: string) {
    set("schoolName")(name);
    const match = schools.find((s) => s.name === name);
    if (match && !v.schoolLocation) set("schoolLocation")(match.location);
  }

  function validate() {
    const e: Partial<Record<F, string>> = {};
    if (!v.firstName.trim()) e.firstName = "Enter your first name.";
    if (!v.lastName.trim()) e.lastName = "Enter your last name.";
    if (!USERNAME.test(v.username)) e.username = "3–30 characters: lowercase letters, digits, “.”, “_” or “-”.";
    if (!EMAIL.test(v.email.trim())) e.email = "Enter a valid e-mail address.";
    if (!v.gradeLevel) e.gradeLevel = "Choose your grade.";
    if (!directory) {
      if (v.schoolName.trim().length < 2) e.schoolName = "Enter your school's name.";
      if (v.schoolLocation.trim().length < 2) e.schoolLocation = "Enter your school's location (e.g. district).";
    }
    if (v.homeLocation.trim().length < 2) e.homeLocation = "Enter where you live (e.g. district).";
    const p = validateNewPassword(password, confirm);
    if (p.password) e.password = p.password;
    if (p.confirm) e.confirm = p.confirm;
    return e;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (submitting) return;
    const e = validate();
    const ce = directory ? validateSchoolClaim(claim) : {};
    setErrors(e);
    setClaimErrors(ce);
    setError(null);
    if (Object.keys(e).length || Object.keys(ce).length) return;
    setSubmitting(true);
    try {
      const res = await publicApi.registerStudent({
        firstName: v.firstName.trim(),
        lastName: v.lastName.trim(),
        username: v.username,
        email: v.email.trim(),
        password,
        gradeLevel: v.gradeLevel as GradeLevel,
        ...(directory ? schoolClaimPayload(claim) : { schoolName: v.schoolName.trim(), schoolLocation: v.schoolLocation.trim() }),
        homeLocation: v.homeLocation.trim(),
      });
      setDone(res);
    } catch (err) {
      setError(err);
      setErrors(fieldErrors(err, FIELDS));
      if (directory) {
        const server = fieldErrors(err, CLAIM_SERVER_FIELDS);
        setClaimErrors(Object.fromEntries(Object.entries(server).map(([k, m]) => [SCHOOL_CLAIM_SERVER_FIELDS[k], m])));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-5" data-testid="register-done">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome to ROF LMS!</h1>
        <Alert tone="success">Your student account <strong>{done.username}</strong> has been created.</Alert>
        <ul className="space-y-2 text-sm text-slate-700 list-disc pl-5">
          {done.requiresEmailVerification && <li>We sent an activation link to your e-mail address. Open it to activate your account.</li>}
          {done.requiresApproval && <li>An administrator will review and approve your account. You can sign in once it is approved.</li>}
          {done.schoolVerification === "PENDING" && <li>An administrator will check your school. Until then it is shown as not yet verified.</li>}
          {!done.requiresEmailVerification && !done.requiresApproval && <li>You can sign in now.</li>}
        </ul>
        <Link href="/login" className="inline-flex w-full items-center justify-center rounded-lg bg-[#2B2BB2] px-6 py-3 text-sm font-semibold text-white hover:bg-[#232c94]">
          Go to sign in
        </Link>
      </div>
    );
  }

  const known = isApiError(error) && error.code ? REGISTER_ERRORS[error.code] : undefined;
  const fieldErr = Object.keys(fieldErrors(error, directory ? [...FIELDS, ...CLAIM_SERVER_FIELDS] : FIELDS)).length > 0;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Join as a student</h1>
        <p className="mt-1 text-sm text-slate-500">Create your ROF LMS account to start learning Olympiad mathematics.</p>
      </div>

      {error != null && !fieldErr && (
        <Alert tone="error">
          {known ?? errorMessage(error)}
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="First name" name="firstName" autoComplete="given-name" required maxLength={100} value={v.firstName} onChange={(e) => set("firstName")(e.target.value)} error={errors.firstName} />
        <TextField label="Last name" name="lastName" autoComplete="family-name" required maxLength={100} value={v.lastName} onChange={(e) => set("lastName")(e.target.value)} error={errors.lastName} />
      </div>
      <TextField label="Username" name="username" autoComplete="username" required maxLength={30} value={v.username} onChange={(e) => set("username")(e.target.value.toLowerCase())} error={errors.username} hint="Lowercase letters, digits, “.”, “_” or “-”." />
      <TextField label="E-mail" name="email" type="email" autoComplete="email" required maxLength={254} value={v.email} onChange={(e) => set("email")(e.target.value)} error={errors.email} />

      <div>
        <label htmlFor="gradeLevel" className="block text-sm font-semibold text-slate-700 mb-2">
          Grade <span className="text-red-500">*</span>
        </label>
        <select
          id="gradeLevel"
          name="gradeLevel"
          required
          value={v.gradeLevel}
          onChange={(e) => set("gradeLevel")(e.target.value)}
          aria-invalid={errors.gradeLevel ? true : undefined}
          aria-describedby={errors.gradeLevel ? "gradeLevel-error" : "gradeLevel-hint"}
          className={`w-full px-4 py-3 bg-white border rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 ${errors.gradeLevel ? "border-red-400 focus:ring-red-500/20" : "border-slate-300 focus:ring-indigo-500/20 focus:border-indigo-500"}`}
        >
          <option value="">Choose your grade</option>
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {g} ({["S1", "S2", "S3"].includes(g) ? "Junior" : "Senior"} division)
            </option>
          ))}
        </select>
        {errors.gradeLevel ? (
          <p id="gradeLevel-error" className="mt-1.5 text-xs text-red-600">{errors.gradeLevel}</p>
        ) : (
          <p id="gradeLevel-hint" className="mt-1.5 text-xs text-slate-500">S1–S3 study in the Junior division, S4–S6 in the Senior division.</p>
        )}
      </div>

      {directory ? (
        <SchoolClaimFields
          value={claim}
          onChange={(d) => {
            setClaim(d);
            setClaimErrors({});
          }}
          errors={claimErrors}
        />
      ) : detecting ? (
        <p className="text-sm text-slate-500" data-testid="school-loading">Loading the school list…</p>
      ) : (
        <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="School" name="schoolName" required maxLength={200} list="school-suggestions" autoComplete="off" value={v.schoolName} onChange={(e) => onSchool(e.target.value)} error={errors.schoolName} />
        <TextField label="School location" name="schoolLocation" required maxLength={200} value={v.schoolLocation} onChange={(e) => set("schoolLocation")(e.target.value)} error={errors.schoolLocation} hint="District or city" />
      </div>
      <datalist id="school-suggestions">
        {schools.map((s) => (
          <option key={s.id} value={s.name}>{s.location}</option>
        ))}
      </datalist>
        </>
      )}
      <TextField label="Home location" name="homeLocation" autoComplete="address-level2" required maxLength={200} value={v.homeLocation} onChange={(e) => set("homeLocation")(e.target.value)} error={errors.homeLocation} hint="District or city where you live" />

      <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} errors={{ password: errors.password, confirm: errors.confirm }} label="Password" />

      <Button type="submit" loading={submitting} className="w-full">
        {submitting ? "Creating your account…" : "Create my account"}
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
