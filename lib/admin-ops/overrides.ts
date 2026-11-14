/**
 * Individual permission overrides (Super Administrator only; pure, unit-tested
 * in tests/admin-ops.test.mjs). The backend (src/auth/override-policy.ts) is the
 * authority: these helpers only narrow what the form offers to what the
 * catalogue's override policy allows for the target's role, and turn the
 * backend's refusals into clear messages.
 */
import { isApiError } from "../api/errors";

export type OverrideEffect = "GRANT" | "DENY";

export interface PermissionCatalogue {
  permissions: string[];
  roles: Record<string, { label: string; grants: Record<string, string> }>;
  overridePolicy: { grantable: Record<string, string[]>; deniableRoles: string[]; neverGrantable: string[] };
}

export interface OverrideRow {
  id: string;
  permission: string;
  effect: OverrideEffect;
  courseId: string | null;
  divisionId: string | null;
  reason: string;
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  revokeReason?: string | null;
  createdBy: { id: string; username: string } | null;
  revokedBy: { id: string; username: string } | null;
  active: boolean;
}

export const OVERRIDE_RULES = { reason: { min: 3, max: 500 } } as const;

/** Teacher delegations apply to the teacher's schools: a GRANT of these takes no course × division. */
export const SCHOOL_SCOPED_GRANTS: readonly string[] = ["students.viewProfile", "students.viewProgress", "submissions.submitOnBehalf"];

export type OverrideState = "ACTIVE" | "EXPIRED" | "REVOKED";

export function overrideState(o: Pick<OverrideRow, "revokedAt" | "expiresAt">, now: number = Date.now()): OverrideState {
  if (o.revokedAt) return "REVOKED";
  if (o.expiresAt && new Date(o.expiresAt).getTime() <= now) return "EXPIRED";
  return "ACTIVE";
}

/**
 * Why no override can be set on this account, or null when some can.
 * Mirrors the backend: never on yourself, never on a Super Administrator.
 */
export function overrideTargetRefusal(target: { id: string; role: string }, actorId: string | undefined): string | null {
  if (target.id === actorId) return "You cannot change the permissions of your own account.";
  if (target.role === "SUPER_ADMIN") return "Overrides never apply to a Super Administrator.";
  return null;
}

/** The permissions the policy lets a Super Admin GRANT or DENY for a role. */
export function overrideOptions(catalogue: PermissionCatalogue, role: string, effect: OverrideEffect): string[] {
  const policy = catalogue.overridePolicy;
  if (role === "SUPER_ADMIN" || !catalogue.roles[role]) return [];
  if (effect === "GRANT") {
    const never = new Set(policy.neverGrantable);
    return (policy.grantable[role] ?? []).filter((p) => !never.has(p) && catalogue.permissions.includes(p));
  }
  if (!policy.deniableRoles.includes(role)) return [];
  return Object.keys(catalogue.roles[role].grants).filter((p) => catalogue.permissions.includes(p)).sort();
}

/** Whether a GRANT of this permission needs a course × division (anything but a teacher delegation). */
export function grantNeedsCourseDivision(effect: OverrideEffect, permission: string): boolean {
  return effect === "GRANT" && !!permission && !SCHOOL_SCOPED_GRANTS.includes(permission);
}

export interface OverrideForm {
  effect: OverrideEffect;
  permission: string;
  reason: string;
  /** `YYYY-MM-DD` from a date input (end of that day, local time), or "". */
  expiresOn: string;
  courseId: string;
  divisionId: string;
}

export interface CreateOverridePayload {
  permission: string;
  effect: OverrideEffect;
  reason: string;
  expiresAt?: string;
  courseId?: string;
  divisionId?: string;
}

/** Validate the form and build the POST body, or return the first problem. */
export function buildOverridePayload(f: OverrideForm, now: number = Date.now()): { ok: true; payload: CreateOverridePayload } | { ok: false; error: string } {
  if (!f.permission) return { ok: false, error: "Choose a permission." };
  const reason = f.reason.trim();
  if (reason.length < OVERRIDE_RULES.reason.min || reason.length > OVERRIDE_RULES.reason.max) {
    return { ok: false, error: `Give a reason (${OVERRIDE_RULES.reason.min}–${OVERRIDE_RULES.reason.max} characters).` };
  }
  const payload: CreateOverridePayload = { permission: f.permission, effect: f.effect, reason };
  if (f.expiresOn) {
    const expires = new Date(`${f.expiresOn}T23:59:59`);
    if (Number.isNaN(expires.getTime())) return { ok: false, error: "The end date is not a valid date." };
    if (expires.getTime() <= now) return { ok: false, error: "The end date must be in the future." };
    payload.expiresAt = expires.toISOString();
  }
  if (grantNeedsCourseDivision(f.effect, f.permission)) {
    if (!f.courseId || !f.divisionId) return { ok: false, error: "A GRANT of this permission applies to one course and division: choose both." };
    payload.courseId = f.courseId;
    payload.divisionId = f.divisionId;
  }
  return { ok: true, payload };
}

const REASONS: Record<string, string> = {
  self: "You cannot change the permissions of your own account.",
  "no override applies to a Super Administrator": "Overrides never apply to a Super Administrator.",
  "never grantable": "This permission can never be granted by an override.",
  "not on the approved GRANT list for this role": "This permission is not on the approved list of grants for this role.",
  "DENY not allowed for this role": "Permissions of this role cannot be denied.",
  "not a default permission of this role": "This role does not have this permission by default, so there is nothing to deny.",
  "expiresAt must be in the future": "The end date must be in the future.",
  "unknown permission": "This permission is not in the catalogue.",
};

/** A clear message for a refused override change (create or revoke). */
export function overrideErrorMessage(error: unknown): string | null {
  if (!isApiError(error)) return null;
  if (error.code === "OVERRIDE_NOT_ALLOWED") {
    const reason = typeof error.details === "object" && error.details !== null ? (error.details as { reason?: unknown }).reason : undefined;
    if (typeof reason === "string") {
      if (REASONS[reason]) return REASONS[reason];
      if (reason.startsWith("outside the user")) return "This is outside the user's existing scope: a GRANT applies only where the user already works.";
    }
    return error.message || "This override is not allowed.";
  }
  if (error.code === "OVERRIDE_EXISTS") return "An identical active override already exists.";
  if (error.code === "OVERRIDE_ALREADY_REVOKED") return "This override has already been revoked.";
  if (error.status === 403) return "Only a Super Administrator can change permission overrides.";
  if (error.status === 404) return "This user or override no longer exists.";
  return null;
}
