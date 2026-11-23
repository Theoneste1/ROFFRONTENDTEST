/** "View as" (read only): start (administrator's tab), exchange and end (the viewing tab). */
import { api, API_BASE } from "./client";
import type { ViewAsInfo } from "../auth/view-as";

export interface ViewAsTicket {
  ticket: string;
  expiresAt: string;
}

export interface ViewAsExchange {
  accessToken: string;
  tokenType: "Bearer";
  expiresAt: string;
  viewAs: ViewAsInfo;
}

export const viewAsApi = {
  /** A single-use ticket (about 60 seconds) to view the platform as this user (users.impersonate; lower roles only). */
  start: (userId: string, reason?: string) =>
    api<ViewAsTicket>(`/admin/users/${encodeURIComponent(userId)}/view-as`, {
      method: "POST",
      body: reason?.trim() ? { reason: reason.trim() } : {},
    }),

  /** The viewing tab exchanges its ticket for a 30-minute viewing token (no cookie, no refresh). */
  exchange: (ticket: string) =>
    api<ViewAsExchange>("/auth/view-as/exchange", { method: "POST", body: { ticket }, auth: false }),

  /**
   * End the viewing session of `token` (also after it expired). Sent with that token only — never the cookie — so the
   * administrator's own session is never touched. Best effort: never throws.
   */
  async end(token: string): Promise<void> {
    try {
      await fetch(`${API_BASE}/auth/view-as/end`, {
        method: "POST",
        credentials: "omit",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        keepalive: true,
      });
    } catch {
      /* the session still ends at its 30 minutes */
    }
  },
};
