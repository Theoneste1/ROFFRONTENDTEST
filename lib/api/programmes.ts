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

export const programmesApi = {
  list: () => api<Programme[]>("/programmes"),
  members: (programmeId: string, filters: ProgrammeMemberFilters = {}) =>
    api<Page<ProgrammeMember>>(`/admin/programmes/${programmeId}/members`, { query: filters }),
};
