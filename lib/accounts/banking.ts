/**
 * Banking information (owner 2026-11-25): Teachers, Coaches and Head Coaches give their personal and their school's
 * bank details before using the platform. These rules mirror the backend's (src/banking/banking-rules.ts), which
 * decides: the form checks the same things first so mistakes show at once, and shows the backend's answer per field.
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
  "Zigama Credit and Savings Bank (Zigama CSS)",
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
export const ACCOUNT_NUMBER_MESSAGE = "Enter the account number with digits only (6 to 20 digits).";

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
}

/** GET /admin/users/:id/banking: numbers masked unless revealed. */
export interface AdminBankingView extends Omit<BankingView, "rules" | "details"> {
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

/** The form's starting values: what is saved (kept as it is), the fixed banks filled in. */
export function initialValues(view: Pick<BankingView, "details" | "rules">): BankingValues {
  const d = view.details ?? {};
  const v = Object.fromEntries(BANKING_FIELDS.map((f) => [f, d[f] ?? ""])) as BankingValues;
  if (view.rules?.personalBank === "FIXED") v.personalBankName = UMWALIMU_SACCO;
  v.schoolBankName = UMWALIMU_SACCO;
  return v;
}

/** The problem of each field, as the backend would answer (empty: ready to submit). Nothing is changed or cut. */
export function validateBanking(rules: BankRules, v: BankingValues): Partial<Record<BankingField, string>> {
  const errors: Partial<Record<BankingField, string>> = {};
  const name = (f: BankingField) => {
    const s = v[f].trim();
    if (!s) errors[f] = `${FIELD_LABELS[f]} is required.`;
    else if (s.length < 2 || s.length > 120) errors[f] = "Enter the account name as the bank shows it (2 to 120 characters).";
  };
  name("personalAccountName");
  name("schoolAccountName");
  if (rules.personalBank === "LIST") {
    if (!v.personalBankName) errors.personalBankName = "Bank name is required.";
    else if (!rules.banks.includes(v.personalBankName)) errors.personalBankName = "Choose your bank from the list.";
  }
  if (rules.personalNumberDigits) {
    if (!/^\d{12}$/.test(v.personalAccountNumber)) errors.personalAccountNumber = TEACHER_NUMBER_MESSAGE;
  } else if (!v.personalAccountNumber) errors.personalAccountNumber = `${FIELD_LABELS.personalAccountNumber} is required.`;
  else if (!/^\d{6,20}$/.test(v.personalAccountNumber)) errors.personalAccountNumber = ACCOUNT_NUMBER_MESSAGE;
  if (!v.schoolAccountNumber) errors.schoolAccountNumber = `${FIELD_LABELS.schoolAccountNumber} is required.`;
  else if (!/^\d{6,20}$/.test(v.schoolAccountNumber)) errors.schoolAccountNumber = ACCOUNT_NUMBER_MESSAGE;
  return errors;
}

/** The body of PUT /me/banking: the fixed banks are sent as Umwalimu SACCO (the backend enforces them anyway). */
export function submissionOf(rules: BankRules, v: BankingValues): BankingValues {
  return {
    ...v,
    personalAccountName: v.personalAccountName.trim(),
    schoolAccountName: v.schoolAccountName.trim(),
    personalBankName: rules.personalBank === "FIXED" ? UMWALIMU_SACCO : v.personalBankName,
    schoolBankName: UMWALIMU_SACCO,
  };
}
