/**
 * "View as" (owner decision 2026-11-23): an administrator sees the platform exactly as a lower-ranked user does, in a
 * separate tab, READ ONLY. The backend enforces everything (it refuses every change with 403 VIEW_AS_READ_ONLY and ends
 * the session with 401 VIEW_AS_ENDED); this module holds the frontend's rules and the viewing tab's storage.
 *
 * The viewing token lives in sessionStorage of the viewing tab only — so a reload keeps it within its 30 minutes — never
 * in localStorage or a cookie, and never in another tab. The tab never refreshes a session and never touches the
 * sign-in / sign-out markers other tabs listen to, so the administrator's own tabs are unaffected.
 */
import { roleLabel } from "./role-rules";

export interface ViewAsPerson {
  id: string;
  name: string;
  role: string;
}

export interface ViewAsInfo {
  sessionId: string;
  actor: ViewAsPerson;
  target: ViewAsPerson;
  /** ISO instant: when the viewing token stops working. */
  expiresAt: string;
}

/** The viewing tab's session: the bearer token and who is viewing whom. */
export interface ViewingSession {
  accessToken: string;
  expiresAt: string;
  viewAs: ViewAsInfo;
}

export const VIEW_AS_STORAGE_KEY = "rof-view-as";
export const VIEW_AS_PATH = "/view-as";
export const VIEW_AS_ENDED_PATH = "/view-as?ended=1";

export const VIEW_AS_ENDED_TEXT = "This viewing session has ended (it lasts 30 minutes, or your permission changed). Close this tab.";
export const VIEW_AS_EXPLANATION = (name: string) =>
  `Opens a new tab where you see the platform exactly as ${name} does. Nothing can be changed there. Your own session stays open in this tab.`;

/** The roles each role may view (lower roles only; the backend decides again). Nobody views a Super Administrator. */
export const VIEWABLE_ROLES: Readonly<Record<string, readonly string[]>> = {
  SUPER_ADMIN: ["STUDENT", "TEACHER", "MENTOR", "HEAD_COACH", "ADMIN"],
  ADMIN: ["STUDENT", "TEACHER", "MENTOR", "HEAD_COACH"],
  HEAD_COACH: ["STUDENT", "TEACHER", "MENTOR"],
};

/** Whether the rank rule lets `actor` view the platform as `target` (never themselves). */
export function canViewAs(actor: { id: string; role: string } | null | undefined, target: { id: string; role: string }): boolean {
  if (!actor || actor.id === target.id) return false;
  const allowed = Object.hasOwn(VIEWABLE_ROLES, actor.role) ? VIEWABLE_ROLES[actor.role] : [];
  return allowed.includes(target.role);
}

/** "View as this user" is offered only on a backend with the feature, to a holder of users.impersonate, for a lower role. */
export function viewAsButtonVisible(opts: {
  featureOn: boolean;
  canImpersonate: boolean;
  viewing: boolean;
  actor: { id: string; role: string } | null | undefined;
  target: { id: string; role: string };
}): boolean {
  return opts.featureOn && opts.canImpersonate && !opts.viewing && canViewAs(opts.actor, opts.target);
}

/** The banner: "Viewing as Amina Uwase (Student) — read only." */
export function viewAsBannerText(viewAs: Pick<ViewAsInfo, "target">): string {
  return `Viewing as ${viewAs.target.name} (${roleLabel(viewAs.target.role)}) — read only.`;
}

/** The viewing tab's address for a ticket (single use, about 60 seconds: never a token). */
export function viewAsTicketUrl(ticket: string): string {
  return `${VIEW_AS_PATH}?ticket=${encodeURIComponent(ticket)}`;
}

export interface SessionStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function tabStorage(): SessionStore | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function isPerson(v: unknown): v is ViewAsPerson {
  const p = v as ViewAsPerson | null;
  return !!p && typeof p.id === "string" && typeof p.name === "string" && typeof p.role === "string";
}

/** The parsed viewing session, or null when absent, malformed or expired (an expired one is removed). */
export function readViewingSession(storage: SessionStore | null = tabStorage(), now: number = Date.now()): ViewingSession | null {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(VIEW_AS_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as ViewingSession;
    const valid = typeof s?.accessToken === "string" && s.accessToken.length > 0 && typeof s.expiresAt === "string"
      && !!s.viewAs && typeof s.viewAs.sessionId === "string" && isPerson(s.viewAs.actor) && isPerson(s.viewAs.target);
    const expiry = valid ? Date.parse(s.expiresAt) : NaN;
    if (valid && Number.isFinite(expiry) && expiry > now) return s;
  } catch {
    /* malformed: removed below */
  }
  clearViewingSession(storage);
  return null;
}

export function saveViewingSession(session: ViewingSession, storage: SessionStore | null = tabStorage()): void {
  try {
    storage?.setItem(VIEW_AS_STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* storage blocked: the tab still works until it is reloaded */
  }
}

export function clearViewingSession(storage: SessionStore | null = tabStorage()): void {
  try {
    storage?.removeItem(VIEW_AS_STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}
