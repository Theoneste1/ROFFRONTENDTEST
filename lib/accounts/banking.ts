/**
 * Banking information (owner 2026-11-25): Teachers, Coaches and Head Coaches give their personal and their school's
 * bank details before using the platform. These rules mirror the backend's (src/banking/banking-rules.ts), which
 * decides: the form checks the same things first so mistakes show at once, and shows the backend's answer per field.
 * Only the agreed rules: every field required; teachers' personal number exactly 12 digits; coaches' personal bank
 * from the list; Umwalimu SACCO fixed where agreed. A conflicting saved bank is replaced only with the user's
 * explicit confirmation.
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

export const FIELD_LABELS: Record<BankingField, string> = {
  personalAccountName: "Bank account name",
  personalBankName: "Bank name",
  personalAccountNumber: "Bank account number",
  schoolAccountName: "School bank account name",
  schoolBankName: "School bank name",
  schoolAccountNumber: "School bank account number",
};

export const TEACHER_NUMBER_MESSAGE = "Your Umwalimu SACCO account number must contain exactly 12 digits.";

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
  };
}

/** The saved banks this role may not use (the backend's `conflicts`, or computed from the saved details). */
export function conflictsOf(view: Pick<BankingView, "details" | "rules" | "conflicts">): BankingConflict[] {
  if (view.conflicts) return view.conflicts;
  const out: BankingConflict[] = [];
  const d = view.details ?? {};
  const personal = d.personalBankName;
  if (view.rules?.personalBank === "FIXED" && personal && personal !== UMWALIMU_SACCO) out.push({ field: "personalBankName", saved: personal });
  const school = d.schoolBankName;
  if (school && school !== UMWALIMU_SACCO) out.push({ field: "schoolBankName", saved: school });
  return out;
}

/** The form's starting values: what is saved (kept as it is), the fixed banks filled in. */
export function initialValues(view: Pick<BankingView, "details" | "rules">): BankingValues {
  const d = view.details ?? {};
  const v = Object.fromEntries(BANKING_FIELDS.map((f) => [f, d[f] ?? ""])) as BankingValues;
  if (view.rules?.personalBank === "FIXED") v.personalBankName = UMWALIMU_SACCO;
  v.schoolBankName = UMWALIMU_SACCO;
  return v;
}

/**
 * The problem of each field, as the backend would answer (empty: ready to submit). The agreed rules only: every field
 * required; a teacher's personal number exactly 12 digits; a coach's personal bank from the list; a conflicting saved
 * bank replaced only when confirmed. Nothing is changed or cut.
 */
export function validateBanking(
  rules: BankRules,
  v: BankingValues,
  conflicts: readonly BankingConflict[] = [],
  confirmed: ReadonlySet<string> = new Set(),
): Partial<Record<BankingField, string>> {
  const errors: Partial<Record<BankingField, string>> = {};
  for (const f of ["personalAccountName", "schoolAccountName", "schoolAccountNumber"] as const) {
    if (!v[f].trim()) errors[f] = `${FIELD_LABELS[f]} is required.`;
  }
  if (rules.personalBank === "LIST") {
    if (!v.personalBankName) errors.personalBankName = "Bank name is required.";
    else if (!rules.banks.includes(v.personalBankName)) errors.personalBankName = "Choose your bank from the list.";
  }
  if (rules.personalNumberDigits) {
    if (!/^\d{12}$/.test(v.personalAccountNumber)) errors.personalAccountNumber = TEACHER_NUMBER_MESSAGE;
  } else if (!v.personalAccountNumber.trim()) errors.personalAccountNumber = `${FIELD_LABELS.personalAccountNumber} is required.`;
  for (const c of conflicts) if (!confirmed.has(c.field)) errors[c.field] = confirmReplaceMessage(c.saved);
  return errors;
}

/** The body of PUT /me/banking: the fixed banks as Umwalimu SACCO, and the replacements the user confirmed. */
export function submissionOf(rules: BankRules, v: BankingValues, confirmed: ReadonlySet<string> = new Set()): BankingValues & { confirmReplace?: FixableBankField[] } {
  const confirmReplace = (["personalBankName", "schoolBankName"] as const).filter((f) => confirmed.has(f));
  return {
    ...v,
    personalAccountName: v.personalAccountName.trim(),
    schoolAccountName: v.schoolAccountName.trim(),
    personalBankName: rules.personalBank === "FIXED" ? UMWALIMU_SACCO : v.personalBankName,
    schoolBankName: UMWALIMU_SACCO,
    ...(confirmReplace.length ? { confirmReplace } : {}),
  };
}
