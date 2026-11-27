/**
 * The bank list (owner 2026-11-27): the banks Teachers, Coaches and Head Coaches choose, each with its account-number
 * rule, managed by the Super Administrator (GET / PUT /admin/banking/banks, capability managedBanks). Umwalimu SACCO
 * always stays, available and exactly 12 digits. Pure helpers (tests/banks-admin.test.mjs) and the API calls.
 */
import { api } from "@/lib/api/client";
import { hasFeature, type BackendDetection } from "@/lib/api/capabilities";
import { UMWALIMU_SACCO } from "@/lib/accounts/banking";

export interface AdminBank {
  name: string;
  active: boolean;
  minDigits: number | null;
  maxDigits: number | null;
  instruction: string;
  /** Saved bank details that use this bank (personal or school). */
  accounts: number;
  /** Of those, saved numbers that do not follow the bank's rule (asked when they next change their number). */
  accountsNotFollowingRule: number;
}
export interface AdminBanksView { banks: AdminBank[]; fixedBank: string }

/** How a bank's account numbers are checked, as the page edits it. */
export type RuleKind = "GENERAL" | "EXACT" | "RANGE";
export interface BankDraft { name: string; active: boolean; kind: RuleKind; min: string; max: string; accounts: number; accountsNotFollowingRule: number; isNew: boolean }

export const banksApi = {
  list: () => api<AdminBanksView>("/admin/banking/banks"),
  save: (banks: Array<{ name: string; active: boolean; minDigits: number | null; maxDigits: number | null }>, reason: string) =>
    api<AdminBanksView>("/admin/banking/banks", { method: "PUT", body: { banks, reason } }),
};

/** The menu entry: Super Administrators only, with a backend advertising managedBanks. */
export function banksNavVisible(detection: BackendDetection | null | undefined, role: string | null | undefined): boolean {
  return role === "SUPER_ADMIN" && hasFeature(detection, "managedBanks");
}

export const isSaccoName = (name: string) => name.trim().toLowerCase() === UMWALIMU_SACCO.toLowerCase();

export function draftOf(b: AdminBank): BankDraft {
  const kind: RuleKind = b.minDigits === null ? "GENERAL" : b.minDigits === b.maxDigits ? "EXACT" : "RANGE";
  return { name: b.name, active: b.active, kind, min: b.minDigits === null ? "" : String(b.minDigits), max: b.maxDigits === null ? "" : String(b.maxDigits), accounts: b.accounts, accountsNotFollowingRule: b.accountsNotFollowingRule, isNew: false };
}

const digits = (v: string) => (/^\d{1,2}$/.test(v.trim()) && Number(v) >= 1 && Number(v) <= 40 ? Number(v) : null);

/** The problems of the edited list (empty: ready to save), per row index, in plain words. */
export function draftProblems(rows: readonly BankDraft[]): Record<number, string> {
  const out: Record<number, string> = {};
  const seen = new Map<string, number>();
  rows.forEach((r, i) => {
    const name = r.name.trim().replace(/\s+/g, " ");
    if (name.length < 2) { out[i] = "Give the bank's name (at least 2 characters)."; return; }
    const key = name.toLowerCase();
    if (seen.has(key)) { out[i] = "This bank is already in the list."; return; }
    seen.set(key, i);
    if (isSaccoName(name)) return;
    if (r.kind === "EXACT" && digits(r.min) === null) out[i] = "Give the number of digits (1 to 40).";
    if (r.kind === "RANGE") {
      const a = digits(r.min); const b = digits(r.max);
      if (a === null || b === null) out[i] = "Give the smallest and the largest number of digits (1 to 40).";
      else if (a > b) out[i] = "The smallest number of digits cannot be larger than the largest.";
    }
  });
  return out;
}

/** The list as PUT /admin/banking/banks receives it. */
export function bodyOf(rows: readonly BankDraft[]) {
  return rows.map((r) => {
    const name = r.name.trim().replace(/\s+/g, " ");
    if (isSaccoName(name)) return { name, active: true, minDigits: 12, maxDigits: 12 };
    const min = r.kind === "GENERAL" ? null : Number(r.min);
    const max = r.kind === "EXACT" ? min : r.kind === "RANGE" ? Number(r.max) : null;
    return { name, active: r.active, minDigits: min, maxDigits: max };
  });
}

/** The instruction people will see for a draft row (as the backend words it). */
export function draftInstruction(r: BankDraft): string {
  const name = r.name.trim() || "This bank";
  if (isSaccoName(name)) return "Umwalimu SACCO account numbers must contain exactly 12 digits.";
  if (r.kind === "EXACT" && digits(r.min) !== null) return `${name} account numbers must contain exactly ${Number(r.min)} digits.`;
  if (r.kind === "RANGE" && digits(r.min) !== null && digits(r.max) !== null) return `${name} account numbers must contain between ${Number(r.min)} and ${Number(r.max)} digits.`;
  return "An account number has 5 to 40 characters: digits, letters, spaces or hyphens, with at least one digit.";
}
