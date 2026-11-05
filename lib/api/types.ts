/**
 * Types for the ROF LMS API (ROFBACKENDTEST, base path /api/v1).
 *
 * Shapes follow the backend's recorded responses in
 * ROFBACKENDTEST/docs/api/response-schemas.json and its Prisma enums.
 * Add types here as modules are integrated; keep them in one place.
 */

// ─── Enums ──────────────────────────────────────────────────────────────────

export type Role = "STUDENT" | "MENTOR" | "ADMIN";
export type DivisionCode = "JUNIOR" | "SENIOR";
export type GradeLevel = "S1" | "S2" | "S3" | "S4" | "S5" | "S6";

/** Permission strings from `GET /me/permissions` (src/auth/permissions.ts). */
export type Permission =
  | "courses.view" | "courses.complete" | "resources.view" | "resources.manage"
  | "assignments.view" | "assignments.prepare" | "assignments.publish"
  | "submissions.submit" | "submissions.viewOwn" | "submissions.distribute"
  | "reviews.grade" | "results.approve" | "results.publish"
  | "discussions.participate" | "discussions.report" | "discussions.moderate"
  | "analytics.course" | "leaderboard.view" | "reports.export"
  | "users.manage" | "academicYears.manage" | "enrollments.manage"
  | "divisions.manage" | "courses.manage" | "mentorAssignments.manage"
  | "mentorRequests.decide" | "settings.manage" | "email.bulkSend"
  | "audit.view" | "activity.view";

// ─── Common shapes ──────────────────────────────────────────────────────────

/** Paginated list response: `?page=&limit=` (limit ≤ 100). */
export interface Page<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface PageParams {
  page?: number;
  limit?: number;
}

/** The single error shape every endpoint returns. */
export interface ApiErrorBody {
  statusCode: number;
  error?: string;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
  path?: string;
  timestamp?: string;
}

export interface DivisionRef {
  id: string;
  code: DivisionCode;
  name: string;
}

export interface SchoolRef {
  id: string;
  name: string;
  location: string;
}

// ─── Identity ───────────────────────────────────────────────────────────────

/** `GET /me` and the `user` of `POST /auth/login`. */
export interface CurrentUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  avatarUrl: string | null;
  division: DivisionRef | null;
  gradeLevel: GradeLevel | null;
  school: SchoolRef | null;
  homeLocation: string | null;
  points: number;
  problemsSolved: number;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface MePermissions {
  role: Role;
  permissions: Permission[];
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_at: string;
}

export interface LoginResponse extends TokenResponse {
  user: CurrentUser;
}

export interface MessageResponse {
  message: string;
}

/** `POST /auth/activation/inspect`. */
export interface ActivationInfo {
  purpose: string;
  requiresPassword: boolean;
  firstName: string;
  username: string;
  /** Masked by the backend. */
  email: string;
  expiresAt: string;
}

export interface ActivateResponse {
  message: string;
  username: string;
}

/** `GET /support` (public). */
export interface SupportInfo {
  platformName?: string | null;
  email?: string | null;
  phone?: string | null;
  hours?: string | null;
  helpUrl?: string | null;
  message?: string | null;
}
