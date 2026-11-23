/**
 * Official-directory sync (backend src/schools/sync/**; capability `schoolDirectorySync`).
 *
 *   schools.manage (Administrators, Super Admins)
 *     POST /admin/school-sync/runs?dataset=…      upload a source export: ALWAYS a dry run (staged 24 h)
 *     GET  /admin/school-sync/runs                runs, newest first
 *     GET  /admin/school-sync/runs/:id            a run (counts, reconciliation, status)
 *     GET  …/runs/:id/items | /changes            rows and proposed changes (contact values masked)
 *     GET  …/runs/:id/report.csv                  the run as CSV (no contact column)
 *     GET  …/runs/:id/review | /categories        review summary (blockers); category digests
 *     POST …/runs/:id/decisions                   individual / category decisions
 *     POST …/runs/:id/items/:itemId/proposal      propose how a CONFLICT / POSSIBLE_DUPLICATE row is resolved
 *     POST …/runs/:id/recompare                   compare with the directory again
 *   schools.syncDirectory (Super Admins only; never grantable)
 *     POST …/runs/:id/approve                     returns the apply token (30 min)
 *     POST …/runs/:id/apply                       one locked, audited transaction
 *     POST …/runs/:id/items/:itemId/resolve       after apply: link an open row to a school
 *
 * Use only when the backend advertises `schoolDirectorySync` (lib/admin/school-sync.ts → syncAccess).
 */
import { api, apiBlob, saveFile } from "./client";
import type { Page } from "./types";

export const SYNC_DATASETS = [{ key: "NESA:ACCREDITED_SCHOOLS", name: "NESA accredited schools" }] as const;
export type SyncDatasetKey = (typeof SYNC_DATASETS)[number]["key"];

export type SyncRunStatus = "PREVIEW" | "APPLIED" | "EXPIRED" | "SUPERSEDED";
export type SyncItemOutcome = "MATCHED" | "NEW" | "DUPLICATE_ROW" | "CONFLICT" | "POSSIBLE_DUPLICATE" | "INVALID" | "MISSING_FROM_SOURCE";
export type SyncChangeKind =
  | "CREATE_SCHOOL"
  | "FILL_EMPTY"
  | "CHANGE"
  | "NAME_RESTORE"
  | "NEW_PLACE"
  | "ADD_CONTACT"
  | "ADD_LEVEL"
  | "ADD_PROGRAMME"
  | "RESOLVE_CONFLICT";
export type SyncDecision = "PENDING" | "APPROVED" | "REJECTED";
export type SyncConflictState = "OPEN" | "PROPOSED" | "RESOLVED";

type UserRef = { id: string; username: string } | null;

export type SyncMode = "FULL" | "NEW_ONLY";

export interface SyncRun {
  id: string;
  datasetKey: string;
  normaliserVersion: string;
  datasetLabel: string;
  fileName: string;
  fileSha256: string;
  format: string;
  rowCount: number;
  /** FULL: every difference with a matched school is proposed. NEW_ONLY: existing schools are left untouched. */
  mode?: SyncMode;
  sourceSummary: unknown;
  reconciliation: {
    summaryAvailable: boolean;
    rowsRead: number;
    checks: Array<{ label: string; source: number; read: number; matches: boolean }>;
    mismatches: number;
  } | null;
  counts: {
    sourceRows: number;
    /** total found = existing + new + needs attention (a repeated row counts with its school). */
    summary?: { totalFound: number; existing: number; new: number; needsAttention: number; newSchools: number; repeatedRows: number };
    outcomes: Partial<Record<SyncItemOutcome, number>>;
    changes: Partial<Record<SyncChangeKind, number>>;
    unchanged: number;
    issues: Record<string, number>;
  } | null;
  reportDigest: string;
  decisionsDigest: string;
  reviewGeneration: number;
  status: SyncRunStatus;
  comparedAt: string;
  createdAt: string;
  expiresAt: string;
  appliedAt: string | null;
  supersededAt: string | null;
  supersededByRunId: string | null;
  stagedPurgedAt: string | null;
  dataSource: { key: string; name: string };
  createdBy: UserRef;
  appliedBy: UserRef;
  /** PREVIEW and past its 24 hours (the daily job then marks it EXPIRED). */
  expired: boolean;
  stagedPurged: boolean;
}

export interface SyncDuplicateCandidate {
  id: string;
  name: string;
  code: string | null;
  district: string | null;
  sector: string | null;
  isActive: boolean;
  source: string;
}

export interface SyncItem {
  id: string;
  rowNumber: number | null;
  sourceRef: string | null;
  raw: unknown;
  normalized: {
    name?: string | null;
    province?: string | null;
    district?: string | null;
    sector?: string | null;
    rawCode?: string;
    code?: string | null;
    placeKnown?: boolean;
  } | null;
  outcome: SyncItemOutcome;
  schoolId: string | null;
  matchedBy: string | null;
  conflictGroup: string | null;
  details: { candidates?: SyncDuplicateCandidate[]; reasons?: string[]; resolvedFrom?: string; [key: string]: unknown } | null;
  issues: Array<{ code: string; field?: string; message?: string }>;
  issueCount: number;
  conflictState: SyncConflictState | null;
  sourceRecordId: string | null;
}

export interface SyncChange {
  id: string;
  kind: SyncChangeKind;
  field: string | null;
  schoolId: string | null;
  currentValue: unknown;
  publishedValue: unknown;
  decision: SyncDecision;
  decidedAt: string | null;
  decidedBy: UserRef;
  decisionNote: string | null;
  appliedAt: string | null;
  item: { id: string; rowNumber: number | null; sourceRef: string | null; outcome: SyncItemOutcome } | null;
}

export interface SyncBlocker {
  code: string;
  count: number;
  ids?: string[];
}

export interface SyncReviewSummary {
  run: {
    id: string;
    datasetKey: string;
    status: SyncRunStatus;
    expiresAt: string;
    reviewGeneration: number;
    approvedGeneration: number | null;
    createdAt: string;
    approvedAt: string | null;
    appliedAt: string | null;
    comparedAt: string;
    createdBy: UserRef;
    approvedBy: UserRef;
    appliedBy: UserRef;
    expired: boolean;
    /** An approval exists for exactly the current review generation. */
    approvalCurrent: boolean;
  };
  decidedBy: UserRef[];
  outcomes: Partial<Record<SyncItemOutcome, number>>;
  changes: Partial<Record<SyncChangeKind, Record<SyncDecision, number>>>;
  manualReview: { total: number; conflicts: number; possibleDuplicates: number; byState: Record<SyncConflictState, number> };
  blockers: SyncBlocker[];
}

export interface SyncCategory {
  kind: SyncChangeKind;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  listDigest: string;
}

export interface SyncDecisionsInput {
  decisions?: Array<{ changeId: string; decision: SyncDecision }>;
  categories?: Array<{ kind: SyncChangeKind; listDigest: string }>;
  note?: string;
}

export interface SyncDecisionsResult {
  changed: boolean;
  blocked: string[];
  reverted: string[];
  generation: number;
  resolutions: boolean;
  recompare?: SyncRecompareResult;
}

export interface SyncRecompareResult {
  reason: string;
  generation: number;
  kept: number;
  retired: number;
  added: number;
  reverted: number;
  attempt: number;
}

export interface SyncProposalInput {
  action: "LINK" | "CREATE";
  schoolId?: string;
  code?: string;
  note?: string;
}

export interface SyncApproval {
  runId: string;
  token: string;
  tokenId: string;
  expiresAt: string;
  reviewGeneration: number;
  approved: Partial<Record<SyncChangeKind, number>>;
}

export interface SyncApplyResult {
  runId: string;
  status: "APPLIED";
  appliedAt: string;
  counts: Record<string, number>;
}

const R = "/admin/school-sync/runs";

export const schoolSyncApi = {
  createRun: (file: File, dataset: SyncDatasetKey, label?: string, mode: SyncMode = "NEW_ONLY") => {
    const form = new FormData();
    form.append("file", file);
    return api<SyncRun>(R, { method: "POST", body: form, query: { dataset, label, mode } });
  },
  runs: (params: { page?: number; limit?: number; status?: SyncRunStatus } = {}) => api<Page<SyncRun>>(R, { query: { ...params } }),
  run: (id: string) => api<SyncRun>(`${R}/${id}`),
  items: (id: string, params: { page?: number; limit?: number; outcome?: SyncItemOutcome } = {}) =>
    api<Page<SyncItem>>(`${R}/${id}/items`, { query: { ...params } }),
  changes: (id: string, params: { page?: number; limit?: number; kind?: SyncChangeKind; decision?: SyncDecision } = {}) =>
    api<Page<SyncChange>>(`${R}/${id}/changes`, { query: { ...params } }),
  downloadReport: async (id: string) => saveFile(await apiBlob(`${R}/${id}/report.csv`, {}, `school-sync-${id}.csv`)),
  review: (id: string) => api<SyncReviewSummary>(`${R}/${id}/review`),
  categories: (id: string) => api<SyncCategory[]>(`${R}/${id}/categories`),
  decide: (id: string, input: SyncDecisionsInput) => api<SyncDecisionsResult>(`${R}/${id}/decisions`, { method: "POST", body: input }),
  propose: (id: string, itemId: string, input: SyncProposalInput) =>
    api<{ itemId: string; afterApply: boolean; generation: number }>(`${R}/${id}/items/${itemId}/proposal`, { method: "POST", body: input }),
  recompare: (id: string) => api<SyncRecompareResult>(`${R}/${id}/recompare`, { method: "POST" }),
  approve: (id: string) => api<SyncApproval>(`${R}/${id}/approve`, { method: "POST" }),
  apply: (id: string, token: string) => api<SyncApplyResult>(`${R}/${id}/apply`, { method: "POST", body: { token } }),
  resolve: (id: string, itemId: string, input: { schoolId: string; note?: string }) =>
    api<unknown>(`${R}/${id}/items/${itemId}/resolve`, { method: "POST", body: input }),
};
