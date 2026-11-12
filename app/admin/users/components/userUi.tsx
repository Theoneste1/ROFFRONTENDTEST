"use client";

/** Account helpers shared by the users, mentors and students pages. */
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { schoolsApi, USER_RULES, type CreateUserInput, type InviteUserInput, type UpdateUserInput } from "@/lib/api/admin";
import { PASSWORD_RULE } from "@/lib/api/auth";
import { errorMessage, fieldErrors, isApiError } from "@/lib/api/errors";
import type { AdminUser, GradeLevel, Permission, Role, SchoolRef } from "@/lib/api/types";
import { roleLabel } from "@/lib/auth/roles";
import { assignableRoles, canPromoteToSuperAdmin, roleChangeNeedsPassword } from "@/lib/auth/role-rules";
import { useSession } from "@/lib/auth/session";
import { hasFeature } from "@/lib/api/capabilities";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { Alert, Spinner } from "@/app/components/ui/feedback";
import { Badge, btnPrimary } from "../../components/adminUi";

// ─── Status ─────────────────────────────────────────────────────────────────

export type AccountStatus = "SUSPENDED" | "AWAITING_SETUP" | "AWAITING_APPROVAL" | "ACTIVE";

/** Derived from the backend flags, in order of precedence. */
export function accountStatus(u: Pick<AdminUser, "isActive" | "isApproved" | "activatedAt">): AccountStatus {
  if (!u.isActive) return "SUSPENDED";
  if (!u.activatedAt) return "AWAITING_SETUP";
  if (!u.isApproved) return "AWAITING_APPROVAL";
  return "ACTIVE";
}

const STATUS: Record<AccountStatus, { label: string; badge: string }> = {
  ACTIVE: { label: "Active", badge: "bg-emerald-50 text-emerald-700" },
  AWAITING_SETUP: { label: "Awaiting setup", badge: "bg-amber-50 text-amber-700" },
  AWAITING_APPROVAL: { label: "Awaiting approval", badge: "bg-orange-50 text-orange-700" },
  SUSPENDED: { label: "Suspended", badge: "bg-gray-100 text-gray-600" },
};

export function AccountStatusBadge({ user }: { user: Pick<AdminUser, "isActive" | "isApproved" | "activatedAt"> }) {
  const s = STATUS[accountStatus(user)];
  return <Badge className={s.badge}>{s.label}</Badge>;
}

export const GRADES: GradeLevel[] = ["S1", "S2", "S3", "S4", "S5", "S6"];
export const gradeDivision = (g: GradeLevel) => (["S1", "S2", "S3"].includes(g) ? "Junior" : "Senior");

// ─── Form controls (admin style) ────────────────────────────────────────────

const inputCls =
  "w-full px-3 py-2 bg-white border rounded-lg text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500";

export function Field({ label, error, hint, required, children, id }: { label: string; error?: string; hint?: ReactNode; required?: boolean; children: (id: string, describedBy?: string) => ReactNode; id?: string }) {
  const autoId = useId();
  const fid = id ?? autoId;
  const describedBy = error ? `${fid}-error` : hint ? `${fid}-hint` : undefined;
  return (
    <div>
      <label htmlFor={fid} className="block text-xs font-semibold text-gray-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children(fid, describedBy)}
      {error ? (
        <p id={`${fid}-error`} className="mt-1 text-[11px] text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fid}-hint`} className="mt-1 text-[11px] text-gray-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({ label, value, onChange, error, hint, required, type = "text", maxLength, autoComplete, placeholder }: { label: string; value: string; onChange: (v: string) => void; error?: string; hint?: ReactNode; required?: boolean; type?: string; maxLength?: number; autoComplete?: string; placeholder?: string }) {
  return (
    <Field label={label} error={error} hint={hint} required={required}>
      {(id, describedBy) => (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${inputCls} ${error ? "border-red-400" : "border-gray-200"}`}
        />
      )}
    </Field>
  );
}

export function SelectInput({ label, value, onChange, options, error, required }: { label: string; value: string; onChange: (v: string) => void; options: { label: string; value: string }[]; error?: string; required?: boolean }) {
  return (
    <Field label={label} error={error} required={required}>
      {(id, describedBy) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={`${inputCls} ${error ? "border-red-400" : "border-gray-200"}`}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/** Pick an existing school (`GET /schools/search?q=`, 2–100 characters). */
export function SchoolPicker({ value, onChange, label = "School" }: { value: SchoolRef | null; onChange: (s: SchoolRef | null) => void; label?: string }) {
  const [q, setQ] = useState("");
  const term = q.trim();
  const results = useQuery({
    queryKey: ["schools", "search", term],
    queryFn: () => schoolsApi.search(term),
    enabled: term.length >= 2,
    staleTime: 60_000,
  });
  if (value) {
    return (
      <Field label={label}>
        {(id) => (
          <div id={id} className="flex items-center justify-between gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <span className="min-w-0 truncate">
              {value.name} <span className="text-gray-400">· {value.location}</span>
            </span>
            <button type="button" onClick={() => onChange(null)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 shrink-0">
              Change
            </button>
          </div>
        )}
      </Field>
    );
  }
  return (
    <Field label={label} hint="Type at least 2 letters to search existing schools.">
      {(id, describedBy) => (
        <div>
          <input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} placeholder="Search schools…" aria-describedby={describedBy} className={`${inputCls} border-gray-200`} />
          {term.length >= 2 && (
            <div className="mt-1 border border-gray-100 rounded-lg max-h-40 overflow-y-auto">
              {results.isPending ? (
                <p className="px-3 py-2 text-xs text-gray-400">Searching…</p>
              ) : results.isError ? (
                <p className="px-3 py-2 text-xs text-red-600">{errorMessage(results.error)}</p>
              ) : results.data.length === 0 ? (
                <p className="px-3 py-2 text-xs text-gray-400">No school matches “{term}”.</p>
              ) : (
                results.data.map((s) => (
                  <button key={s.id} type="button" onClick={() => onChange(s)} className="block w-full text-left px-3 py-2 text-xs hover:bg-indigo-50">
                    {s.name} <span className="text-gray-400">· {s.location}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </Field>
  );
}

// ─── Create / invite / edit form ────────────────────────────────────────────

/** Backend account-management refusals that need a plain explanation. */
const USER_ERRORS: Readonly<Record<string, string>> = {
  ROLE_NOT_ASSIGNABLE: "You can't give this role, or not to this account.",
  TEACHERS_DISABLED: "Teacher accounts are switched off on this server.",
  HEAD_COACHES_DISABLED: "Head Coach accounts are switched off on this server.",
  CANNOT_CHANGE_OWN_ROLE: "You can't change your own role.",
  LAST_SUPER_ADMIN: "This is the last active Super Administrator; another one must exist first.",
  GRADE_REQUIRED: "Students need a grade.",
  IDENTITY_TAKEN: "That username or e-mail is already in use.",
  USERNAME_UNAVAILABLE: "No username could be made from this e-mail address; enter one.",
  SCHOOL_REFERENCE_REQUIRED: "Choose an existing school from the list.",
  SCHOOL_NAME_MISMATCH: "The school name doesn't match the school chosen.",
  SCHOOL_REFERENCE_MISMATCH: "The school reference doesn't match; choose the school again.",
  SCHOOL_INACTIVE: "That school is no longer active.",
  NO_CURRENT_ACADEMIC_YEAR: "There is no current academic year, so students can't be enrolled yet.",
  USER_CHANGED_CONCURRENTLY: "Someone else changed this account at the same time. Reload it and try again.",
};

export type UserFormMode = "create" | "invite" | "edit";

interface FormState {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  role: Role;
  gradeLevel: GradeLevel | "";
  school: SchoolRef | null;
  newSchoolName: string;
  newSchoolLocation: string;
  homeLocation: string;
  /** The editor's own password, for a role change to or from Administrator / Super Administrator. */
  currentPassword: string;
}

const FIELDS = ["firstName", "lastName", "username", "email", "password", "role", "gradeLevel", "schoolId", "schoolName", "schoolLocation", "homeLocation", "currentPassword"] as const;

export function UserForm({
  mode,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  lockRole,
}: {
  mode: UserFormMode;
  initial?: AdminUser;
  submitLabel: string;
  /** Resolves on success; a thrown ApiError is shown on the form. */
  onSubmit: (input: CreateUserInput | InviteUserInput | UpdateUserInput) => Promise<unknown>;
  onCancel: () => void;
  /** The admin's own account: the backend refuses role changes. */
  lockRole?: boolean;
}) {
  const session = useSession();
  const { detection } = useBackendCapabilities();
  const [f, setF] = useState<FormState>(() => ({
    firstName: initial?.firstName ?? "",
    lastName: initial?.lastName ?? "",
    username: initial?.username ?? "",
    email: initial?.email ?? "",
    password: "",
    role: initial?.role ?? "STUDENT",
    gradeLevel: initial?.gradeLevel ?? "",
    school: initial?.school ?? null,
    newSchoolName: "",
    newSchoolLocation: "",
    homeLocation: initial?.homeLocation ?? "",
    currentPassword: "",
  }));
  const [errors, setErrors] = useState<Partial<Record<(typeof FIELDS)[number], string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const isStudent = f.role === "STUDENT";
  // New backends (schoolReferenceRequired): an invitation must name an existing school, and
  // an edit may remove the school (schoolId: null). Older backends keep the earlier behaviour.
  const schoolReference = hasFeature(detection, "schoolReferenceRequired");
  const stepUp = mode === "edit" && !lockRole && roleChangeNeedsPassword(initial?.role, f.role);

  function validate() {
    const e: typeof errors = {};
    const len = (v: string, min: number, max: number) => v.trim().length >= min && v.trim().length <= max;
    if (!len(f.firstName, 1, 100)) e.firstName = "First name is required (up to 100 characters).";
    if (!len(f.lastName, 1, 100)) e.lastName = "Last name is required (up to 100 characters).";
    const u = f.username.trim().toLowerCase();
    if ((mode !== "invite" || u) && (!len(u, USER_RULES.username.min, USER_RULES.username.max) || !USER_RULES.username.pattern.test(u)))
      e.username = "3–30 characters: lowercase letters, digits, “.”, “_” and “-”.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = "Enter a valid e-mail address.";
    if (mode === "create" && !PASSWORD_RULE.test(f.password)) e.password = PASSWORD_RULE.hint;
    if (isStudent && !f.gradeLevel) e.gradeLevel = "Students need a grade (it sets the division).";
    if (f.homeLocation.trim() && !len(f.homeLocation, 2, 200)) e.homeLocation = "2–200 characters.";
    if (stepUp && !f.currentPassword) e.currentPassword = "Enter your own password to confirm this role change.";
    if (mode === "invite" && !schoolReference && !f.school && (f.newSchoolName.trim() || f.newSchoolLocation.trim())) {
      if (!len(f.newSchoolName, 2, 200)) e.schoolName = "2–200 characters.";
      if (!len(f.newSchoolLocation, 2, 200)) e.schoolLocation = "2–200 characters.";
    }
    return e;
  }

  function buildInput(): CreateUserInput | InviteUserInput | UpdateUserInput {
    const base = {
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
      email: f.email.trim().toLowerCase(),
      role: f.role,
      gradeLevel: isStudent ? (f.gradeLevel as GradeLevel) : undefined,
      schoolId: f.school?.id,
      homeLocation: f.homeLocation.trim() || undefined,
    };
    const username = f.username.trim().toLowerCase();
    if (mode === "create") return { ...base, username, password: f.password } as CreateUserInput;
    if (mode === "invite")
      return {
        ...base,
        username: username || undefined,
        schoolName: !schoolReference && !f.school && f.newSchoolName.trim() ? f.newSchoolName.trim() : undefined,
        schoolLocation: !schoolReference && !f.school && f.newSchoolName.trim() ? f.newSchoolLocation.trim() : undefined,
      } as InviteUserInput;
    // Edit: send only what changed.
    const changes: UpdateUserInput = {};
    if (!initial) return changes;
    if (base.firstName !== initial.firstName) changes.firstName = base.firstName;
    if (base.lastName !== initial.lastName) changes.lastName = base.lastName;
    if (username !== initial.username) changes.username = username;
    if (base.email !== initial.email) changes.email = base.email;
    if (!lockRole && base.role !== initial.role) changes.role = base.role;
    if (base.gradeLevel && base.gradeLevel !== initial.gradeLevel) changes.gradeLevel = base.gradeLevel;
    if (f.school && f.school.id !== initial.school?.id) changes.schoolId = f.school.id;
    if (!f.school && initial.school && schoolReference) changes.schoolId = null;
    if (base.homeLocation && base.homeLocation !== (initial.homeLocation ?? "")) changes.homeLocation = base.homeLocation;
    if (changes.role && roleChangeNeedsPassword(initial.role, changes.role)) changes.currentPassword = f.currentPassword;
    return changes;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) return;
    const input = buildInput();
    if (mode === "edit" && Object.keys(input).length === 0) {
      setFormError("Nothing has changed.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit(input);
    } catch (err) {
      const fe = fieldErrors(err, FIELDS);
      if (isApiError(err) && err.code === "STEP_UP_REQUIRED") fe.currentPassword = "That password isn't correct. Enter your own current password.";
      setErrors(fe);
      setFormError(Object.keys(fe).length ? "Please correct the highlighted fields." : (isApiError(err) && err.code ? USER_ERRORS[err.code] : undefined) ?? errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Roles that can be given here: Student, Coach and Administrator on every backend;
  // Teacher / Head Coach only when the backend advertises it (GET /api/v1) and the
  // caller holds the matching permission (lib/auth/role-rules.ts). An account that
  // already holds another role keeps it listed, so the form shows the real role and
  // saves no change unless another one is chosen.
  const roleOptions: { label: string; value: string }[] = assignableRoles({
    teacherAccounts: hasFeature(detection, "teacherAccounts"),
    headCoachAccounts: hasFeature(detection, "headCoachAccounts"),
    can: (p) => session.can(p as Permission),
  }).map((r) => ({ label: roleLabel(r), value: r }));
  if (initial?.role && !roleOptions.some((o) => o.value === initial.role)) {
    roleOptions.push({ label: roleLabel(initial.role), value: initial.role });
  }
  if (mode === "edit" && initial && canPromoteToSuperAdmin(session.role, initial) && !roleOptions.some((o) => o.value === "SUPER_ADMIN")) {
    roleOptions.push({ label: roleLabel("SUPER_ADMIN"), value: "SUPER_ADMIN" });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput label="First name" required value={f.firstName} onChange={(v) => set("firstName", v)} error={errors.firstName} maxLength={100} autoComplete="off" />
        <TextInput label="Last name" required value={f.lastName} onChange={(v) => set("lastName", v)} error={errors.lastName} maxLength={100} autoComplete="off" />
        <TextInput label="E-mail" required type="email" value={f.email} onChange={(v) => set("email", v)} error={errors.email} autoComplete="off" />
        <TextInput
          label="Username"
          required={mode !== "invite"}
          value={f.username}
          onChange={(v) => set("username", v)}
          error={errors.username}
          maxLength={30}
          autoComplete="off"
          hint={mode === "invite" ? "Optional — generated from the e-mail address when empty." : "Lowercase letters, digits, “.”, “_”, “-”."}
        />
        {mode === "create" && (
          <TextInput label="Password" required type="password" value={f.password} onChange={(v) => set("password", v)} error={errors.password} maxLength={PASSWORD_RULE.max} autoComplete="new-password" hint={PASSWORD_RULE.hint} />
        )}
        <SelectInput label="Role" required value={f.role} onChange={(v) => set("role", v as Role)} options={lockRole ? roleOptions.filter((o) => o.value === f.role) : roleOptions} error={errors.role} />
        {isStudent && (
          <SelectInput
            label="Grade"
            required
            value={f.gradeLevel}
            onChange={(v) => set("gradeLevel", v as GradeLevel)}
            options={[{ label: "Choose a grade", value: "" }, ...GRADES.map((g) => ({ label: `${g} · ${gradeDivision(g)}`, value: g }))]}
            error={errors.gradeLevel}
          />
        )}
        <TextInput label="Home location" value={f.homeLocation} onChange={(v) => set("homeLocation", v)} error={errors.homeLocation} maxLength={200} placeholder="District or city" />
      </div>
      {stepUp && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2" data-testid="role-step-up">
          <p className="text-xs text-amber-800">
            Changing a role to or from {roleLabel("ADMIN")} or {roleLabel("SUPER_ADMIN")} needs your own password. The account&apos;s sessions end when its role changes.
          </p>
          <TextInput label="Your current password" required type="password" value={f.currentPassword} onChange={(v) => set("currentPassword", v)} error={errors.currentPassword} maxLength={200} autoComplete="current-password" />
        </div>
      )}
      <SchoolPicker value={f.school} onChange={(s) => set("school", s)} />
      {mode === "invite" && schoolReference && !f.school && <p className="text-[11px] text-gray-400">An invitation can only name a school that already exists.</p>}
      {mode === "invite" && !schoolReference && !f.school && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextInput label="…or a new school name" value={f.newSchoolName} onChange={(v) => set("newSchoolName", v)} error={errors.schoolName} maxLength={200} />
          <TextInput label="New school location" value={f.newSchoolLocation} onChange={(v) => set("newSchoolLocation", v)} error={errors.schoolLocation} maxLength={200} />
        </div>
      )}
      {mode === "edit" && initial?.role === "STUDENT" && <p className="text-[11px] text-gray-400">Changing the grade moves the student to the matching division.</p>}
      {formError && <Alert tone="error">{formError}</Alert>}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} disabled={busy} className="px-5 py-2 text-sm text-gray-600 disabled:opacity-50">
          Cancel
        </button>
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy && <Spinner className="h-3.5 w-3.5 !text-white" />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
