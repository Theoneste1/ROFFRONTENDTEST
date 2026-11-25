import { api } from "./client";
import type { AdminBankingView, BankingValues, BankingView, FixableBankField } from "@/lib/accounts/banking";

/** Banking information (owner 2026-11-25, capability bankingDetails). */
export const bankingApi = {
  /** The signed-in Teacher's, Coach's or Head Coach's own details, what is missing, and how their banks are given. */
  mine: () => api<BankingView>("/me/banking"),
  /** All six fields; 400 BANKING_INVALID with `details.fields` (the problem of each field). */
  save: (values: BankingValues & { confirmReplace?: FixableBankField[] }) => api<BankingView>("/me/banking", { method: "PUT", body: values }),
  /** An administrator's view of one person (users.manage): numbers masked; `reveal` shows them in full (audited). */
  ofUser: (id: string, reveal = false) => api<AdminBankingView>(`/admin/users/${encodeURIComponent(id)}/banking`, { query: { reveal: reveal ? "true" : undefined } }),
};
