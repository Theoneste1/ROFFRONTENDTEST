import { api } from "./client";
import type { AdminBankingView, BankingSubmission, BankingView } from "@/lib/accounts/banking";

/** Banking information (owner 2026-11-25, capability bankingDetails). */
export const bankingApi = {
  /** The signed-in Teacher's, Coach's or Head Coach's own details, what is missing, and how their banks are given. */
  mine: () => api<BankingView>("/me/banking"),
  /** The role's fields (six for Teachers, three personal for Coaches and Head Coaches); 400 BANKING_INVALID with `details.fields`. */
  save: (values: BankingSubmission) => api<BankingView>("/me/banking", { method: "PUT", body: values }),
  /** An administrator changes one person's details (users.manage; the person's role rules; audited). Answers the masked view. */
  updateForUser: (id: string, values: BankingSubmission) =>
    api<AdminBankingView>(`/admin/users/${encodeURIComponent(id)}/banking`, { method: "PUT", body: values }),
  /** An administrator's view of one person (users.manage): numbers masked; `reveal` shows them in full (audited). */
  ofUser: (id: string, reveal = false) => api<AdminBankingView>(`/admin/users/${encodeURIComponent(id)}/banking`, { query: { reveal: reveal ? "true" : undefined } }),
};
