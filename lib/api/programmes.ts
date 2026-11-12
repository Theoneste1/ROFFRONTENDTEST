/**
 * Programmes for Head Coaches (backend src/programmes/*). A Head Coach sees
 * only the programmes they head: `GET /me/permissions` → `scopes.programmes`
 * lists their ids, and every route below refuses any other programme.
 *
 * - list      GET /programmes (courses.view): every programme (filter by scopes.programmes)
 * - members   GET /admin/programmes/:id/members (programmes.manageMembers; Head Coach:
 *             own programmes, current members only): students and coaches, no contact
 *             details, grades, marks or feedback
 *
 * - heads     GET / PUT /admin/programmes/:id/heads (programmes.manageHeads: Administrators):
 *             PUT replaces the whole list with exactly these HEAD_COACH users
 * - end       DELETE /admin/programmes/:id/members/:userId (programmes.manageMembers;
 *             Head Coach: students only, own programmes)
 * - invite    POST /admin/programmes/:id/coach-invitations (users.manageCoaches): a new
 *             invited Coach in the programme; by a Head Coach it waits for an
 *             Administrator's approval (`pendingApproval`)
 *
 * Coach monitoring uses the scoped reports (lib/api/admin.ts mentorsApi.report,
 * coaches.monitor): for a Head Coach the backend limits them to their programmes and
 * removes contact details.
 */
import { api, type QueryValue } from "./client";
import type { DivisionRef, GradeLevel, Page } from "./types";

export interface Programme {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface ProgrammeMember {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  role: "STUDENT" | "MENTOR";
  gradeLevel: GradeLevel | null;
  isActive: boolean;
  division: DivisionRef | null;
  /** `verification`: an unverified school is never presented as fact. */
  school: { id: string; name: string; verification?: string } | null;
  membership: { source: string; isActive: boolean; createdAt: string; endedAt: string | null };
}

export interface ProgrammeMemberFilters {
  role?: "STUDENT" | "MENTOR";
  page?: number;
  limit?: number;
  [key: string]: QueryValue;
}

/** `GET /admin/programmes/:id/heads` row. */
export interface ProgrammeHead {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  since: string;
}

export interface CoachInvitationInput {
  firstName: string;
  lastName: string;
  email: string;
  username?: string;
}

export interface CoachInvitationResult {
  user: { id: string; username: string; email: string };
  invitation: { expiresAt: string; purpose: string };
  /** True when a Head Coach invited: an Administrator must approve the account. */
  pendingApproval: boolean;
}

export const programmesApi = {
  list: () => api<Programme[]>("/programmes"),
  members: (programmeId: string, filters: ProgrammeMemberFilters = {}) =>
    api<Page<ProgrammeMember>>(`/admin/programmes/${programmeId}/members`, { query: filters }),
  endMember: (programmeId: string, userId: string) =>
    api<unknown>(`/admin/programmes/${programmeId}/members/${userId}`, { method: "DELETE" }),
  heads: (programmeId: string) => api<ProgrammeHead[]>(`/admin/programmes/${programmeId}/heads`),
  setHeads: (programmeId: string, userIds: string[]) =>
    api<ProgrammeHead[]>(`/admin/programmes/${programmeId}/heads`, { method: "PUT", body: { userIds } }),
  inviteCoach: (programmeId: string, input: CoachInvitationInput) =>
    api<CoachInvitationResult>(`/admin/programmes/${programmeId}/coach-invitations`, {
      method: "POST",
      body: Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== "")),
    }),
};
