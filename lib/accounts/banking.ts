/**
 * Banking information (owner 2026-11-25, final requirements): Teachers give their personal and their school's bank
 * details (six fields); Coaches and Head Coaches give their personal details only (three fields) — school details are
 * never asked of them, never block them, and any saved earlier are kept as they are. These rules mirror the backend's
 * (src/banking/banking-rules.ts), which decides: the form checks the same things first so mistakes show at once, and
 * shows the backend's answer per field. Only the agreed rules: every required field required; teachers' personal
 * number exactly 12 digits; coaches' personal bank from the list; Umwalimu SACCO fixed for teachers. A conflicting
 * saved bank is replaced only with the user's explicit confirmation.
 * Tested in tests/banking.test.mjs.
 */

export const BANKING_REQUIRED = "BANKING_DETAILS_REQUIRED";
export const UMWALIMU_SACCO = "Umwalimu SACCO";

/** The banks a Coach or Head Coach may choose (owner's list). The backend sends the same list (rules.banks). */
export const BANKS = [
  "Access Bank Rwanda Plc",
  "Bank of Kigali Plc",
  "Bank of Africa Rwanda Plc",
  "BPR Bank Rwanda Plc",
  "Ecobank Rwanda Plc",
  "Equity Bank Rwanda Plc",
  "Guaranty Trust Bank Rwanda Plc (GT Bank)",
  "I&M Bank Rwanda Plc",
  "NCBA Bank Rwanda Plc",
  "Rwanda Development Bank (BRD)",
  "Zigama Credit and Savings Bank",
  UMWALIMU_SACCO,
] as const;

export const BANKING_ROLES = ["TEACHER", "MENTOR", "HEAD_COACH"] as const;

export const BANKING_FIELDS = [
  "personalAccountName", "personalBankName", "personalAccountNumber",
  "schoolAccountName", "schoolBankName", "schoolAccountNumber",
] as const;
export type BankingField = (typeof BANKING_FIELDS)[number];
export type BankingValues = Record<BankingField, string>;

/** The three personal fields: all a Coach or Head Coach gives. */
export const PERSONAL_FIELDS = ["personalAccountName", "personalBankName", "personalAccountNumber"] as const;

export const FIELD_LABELS: Record<BankingField, string> = {
  personalAccountName: "Bank account name",
  personalBankName: "Bank name",
  personalAccountNumber: "Bank account number",
  schoolAccountName: "School bank account name",
  schoolBankName: "School bank name",
  schoolAccountNumber: "School bank account number",
};

export const TEACHER_NUMBER_MESSAGE = "Your Umwalimu SACCO account number must contain exactly 12 digits.";
export const SCHOOL_NUMBER_MESSAGE = "The school's Umwalimu SACCO account number must contain exactly 12 digits.";
/** An account name with a digit (owner 2026-11-25: names contain no digit). The backend's exact words. */
export const NAME_DIGIT_MESSAGES = {
  personalAccountName: "The bank account name must not contain numbers. Write the name exactly as on the account.",
  schoolAccountName: "The school's bank account name must not contain numbers. Write the name exactly as on the account.",
} as const;

/** The bank fields that may be fixed to Umwalimu SACCO (and so may hold a conflicting saved bank). */
export type FixableBankField = "personalBankName" | "schoolBankName";

/** A saved bank this role may not use: shown, replaced only when the user confirms it. */
export interface BankingConflict {
  field: FixableBankField;
  saved: string;
}

export const confirmReplaceMessage = (saved: string) =>
  `Your saved bank “${saved}” cannot be used here. Confirm that ${UMWALIMU_SACCO} replaces it.`;

export type BankingStatus = "COMPLETE" | "PARTIAL" | "NOT_STARTED" | "NEEDS_CORRECTION";

export const STATUS_LABEL: Record<BankingStatus, string> = {
  COMPLETE: "Complete",
  PARTIAL: "Partially completed",
  NOT_STARTED: "Incomplete",
  NEEDS_CORRECTION: "Needs correction",
};

export interface BankRules {
  personalBank: "FIXED" | "LIST";
  schoolBank: "FIXED";
  fixedBank: string;
  banks: string[];
  personalNumberDigits: number | null;
  /** Exactly this many digits for the school account number (Teachers: Umwalimu SACCO; newer backends). */
  schoolNumberDigits?: number | null;
  /** Whether the school's bank details are asked (Teachers only). Older backends omit it: they asked everyone. */
  schoolRequired?: boolean;
  /** The fields this role gives, in form order (newer backends). */
  fields?: BankingField[];
}

/** Whether these rules ask the school's bank details (Teachers only; an older backend asked everyone). */
export function asksSchool(rules: Pick<BankRules, "schoolRequired">): boolean {
  return rules.schoolRequired !== false;
}

/** The fields these rules require: six for Teachers, the three personal ones for Coaches and Head Coaches. */
export function requiredFieldsOf(rules: Pick<BankRules, "schoolRequired" | "fields">): readonly BankingField[] {
  return rules.fields ?? (asksSchool(rules) ? BANKING_FIELDS : PERSONAL_FIELDS);
}

/** GET /me/banking. */
export interface BankingView {
  required: boolean;
  status: BankingStatus | null;
  missing: BankingField[];
  invalid: BankingField[];
  rules: BankRules | null;
  details: Partial<Record<BankingField, string | null>> | null;
  /** Saved banks this role may not use (newer backends): replaced only with the user's confirmation. */
  conflicts?: BankingConflict[];
}

/** GET /admin/users/:id/banking: numbers masked unless revealed. */
export interface AdminBankingView extends Omit<BankingView, "rules" | "details" | "conflicts"> {
  /** The fields this person's role gives (newer backends): six for a Teacher, three personal for a Coach or Head Coach. */
  requiredFields?: BankingField[];
  missingLabels: string[];
  invalidLabels: string[];
  details: (Partial<Record<BankingField, string | null>> & { revealed: boolean }) | null;
}

/** A Users list row's banking status (Teachers, Coaches and Head Coaches only). */
export interface BankingRowStatus {
  status: BankingStatus;
  missing: BankingField[];
  invalid: BankingField[];
}

/** The signed-in user must complete their banking information before using the portal (the backend's `bankingRequired`). */
export function needsBanking(user: { role?: string | null; bankingRequired?: boolean } | null | undefined): boolean {
  return !!user && (BANKING_ROLES as readonly string[]).includes(user.role ?? "") && user.bankingRequired === true;
}

/** The rules of a role (the same as the backend's bankRules; used before GET /me/banking answers and in tests). */
export function rulesFor(role: string): BankRules {
  const teacher = role === "TEACHER";
  return {
    personalBank: teacher ? "FIXED" : "LIST",
    schoolBank: "FIXED",
    fixedBank: UMWALIMU_SACCO,
    banks: teacher ? [UMWALIMU_SACCO] : [...BANKS],
    personalNumberDigits: teacher ? 12 : null,
    schoolNumberDigits: teacher ? 12 : null,
    schoolRequired: teacher,
    fields: teacher ? [...BANKING_FIELDS] : [...PERSONAL_FIELDS],
  };
}

/** The saved banks this role may not use (the backend's `conflicts`, or computed from the saved details). */
export function conflictsOf(view: Pick<BankingView, "details" | "rules" | "conflicts">): BankingConflict[] {
  if (view.conflicts) return view.conflicts;
  const out: BankingConflict[] = [];
  const d = view.details ?? {};
  const personal = d.personalBankName;
  if (view.rules?.personalBank === "FIXED" && personal && personal !== UMWALIMU_SACCO) out.push({ field: "personalBankName", saved: personal });
  // A school bank conflicts only where school details are asked (Teachers): a coach's saved school bank is kept as it is.
  const school = d.schoolBankName;
  if (view.rules && asksSchool(view.rules) && school && school !== UMWALIMU_SACCO) out.push({ field: "schoolBankName", saved: school });
  return out;
}

/** The form's starting values: what is saved (kept as it is), the fixed banks filled in. */
export function initialValues(view: Pick<BankingView, "details" | "rules">): BankingValues {
  const d = view.details ?? {};
  const v = Object.fromEntries(BANKING_FIELDS.map((f) => [f, d[f] ?? ""])) as BankingValues;
  if (view.rules?.personalBank === "FIXED") v.personalBankName = UMWALIMU_SACCO;
  if (!view.rules || asksSchool(view.rules)) v.schoolBankName = UMWALIMU_SACCO;
  return v;
}

/**
 * The problem of each field, as the backend would answer (empty: ready to submit). The agreed rules only: every
 * required field required (school fields for Teachers only); a teacher's personal number exactly 12 digits; a coach's
 * personal bank from the list; a conflicting saved bank replaced only when confirmed. Nothing is changed or cut.
 */
export function validateBanking(
  rules: BankRules,
  v: BankingValues,
  conflicts: readonly BankingConflict[] = [],
  confirmed: ReadonlySet<string> = new Set(),
): Partial<Record<BankingField, string>> {
  const errors: Partial<Record<BankingField, string>> = {};
  const names = asksSchool(rules) ? (["personalAccountName", "schoolAccountName", "schoolAccountNumber"] as const) : (["personalAccountName"] as const);
  for (const f of names) {
    if (!v[f].trim()) errors[f] = `${FIELD_LABELS[f]} is required.`;
    else if ((f === "personalAccountName" || f === "schoolAccountName") && /\d/.test(v[f])) errors[f] = NAME_DIGIT_MESSAGES[f];
  }
  if (rules.personalBank === "LIST") {
    if (!v.personalBankName) errors.personalBankName = "Bank name is required.";
    else if (!rules.banks.includes(v.personalBankName)) errors.personalBankName = "Choose your bank from the list.";
  }
  if (rules.personalNumberDigits) {
    if (!/^\d{12}$/.test(v.personalAccountNumber)) errors.personalAccountNumber = TEACHER_NUMBER_MESSAGE;
  } else if (!v.personalAccountNumber.trim()) errors.personalAccountNumber = `${FIELD_LABELS.personalAccountNumber} is required.`;
  // The school's Umwalimu SACCO number: exactly 12 digits too (Teachers; owner 2026-11-25).
  if (asksSchool(rules) && rules.schoolNumberDigits && !/^\d{12}$/.test(v.schoolAccountNumber)) errors.schoolAccountNumber = SCHOOL_NUMBER_MESSAGE;
  for (const c of conflicts) if (!confirmed.has(c.field)) errors[c.field] = confirmReplaceMessage(c.saved);
  return errors;
}

/** What PUT /me/banking receives: the role's fields only, and the replacements the user confirmed. */
export type BankingSubmission = Partial<BankingValues> & { confirmReplace?: FixableBankField[] };

/**
 * The body of PUT /me/banking: the role's fields only (a coach sends no school fields, so school details saved earlier
 * stay as they are), the fixed banks as Umwalimu SACCO, and the replacements the user confirmed.
 */
export function submissionOf(rules: BankRules, v: BankingValues, confirmed: ReadonlySet<string> = new Set()): BankingSubmission {
  const school = asksSchool(rules);
  const confirmReplace = (["personalBankName", "schoolBankName"] as const).filter((f) => confirmed.has(f) && (f === "personalBankName" || school));
  return {
    personalAccountName: v.personalAccountName.trim(),
    personalBankName: rules.personalBank === "FIXED" ? UMWALIMU_SACCO : v.personalBankName,
    personalAccountNumber: v.personalAccountNumber,
    ...(school ? { schoolAccountName: v.schoolAccountName.trim(), schoolBankName: UMWALIMU_SACCO, schoolAccountNumber: v.schoolAccountNumber } : {}),
    ...(confirmReplace.length ? { confirmReplace } : {}),
  };
}
