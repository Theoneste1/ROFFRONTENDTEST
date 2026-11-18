/**
 * Administrators' form management (capability formAvailability):
 *
 *   GET   /admin/forms                         forms.view                every form: mode, schedule, messages, state
 *   GET   /admin/forms/:key/history?limit=     forms.view                the form's changes, newest first (audit rows)
 *   PATCH /admin/forms/:key/availability       forms.manageAvailability  { mode?, opensAt?, closesAt? } (null removes a date)
 *   PATCH /admin/forms/:key/messages           forms.editMessages        { closedMessage?, instructions?, contactEmail?, supportUrl? }
 *
 * Omitted fields are unchanged. 400 INVALID_FORM_SCHEDULE (SCHEDULED without opensAt, closesAt not after opensAt),
 * 400 NO_CHANGES (nothing sent). Times are ISO 8601 instants; administrators set and read them in Kigali time.
 */
import { api } from "./client";
import type { FormKey, PublicFormView } from "../forms/closed-form";

export type FormMode = "OPEN" | "CLOSED" | "SCHEDULED";

export interface AdminFormView extends PublicFormView {
  label: string;
  mode: FormMode;
  /** The administrator's own closed message; null = the built-in one (closedMessageDefault) is used. */
  closedMessageCustom: string | null;
  closedMessageDefault: string;
  /** TEACHER_REGISTRATION only: the form also needs the Teacher role enabled on the server. */
  requiresTeacherRole?: boolean;
  teacherRoleEnabled?: boolean;
  /** "1970-01-01T00:00:00.000Z" while the form has never been changed. */
  updatedAt: string;
  updatedBy: { id: string; username: string; firstName: string; lastName: string } | null;
}

export interface FormHistoryRow {
  id: string;
  action: "FORM_AVAILABILITY_CHANGED" | "FORM_MESSAGES_CHANGED" | string;
  actorId: string | null;
  actorUsername: string | null;
  actorRole: string | null;
  metadata: {
    form?: string;
    via?: "admin" | "setting" | string;
    changes?: Record<string, { from: unknown; to: unknown }>;
    stateBefore?: string;
    stateAfter?: string;
  } | null;
  createdAt: string;
}

export interface AvailabilityChange {
  mode?: FormMode;
  opensAt?: string | null;
  closesAt?: string | null;
}

export interface MessagesChange {
  closedMessage?: string | null;
  instructions?: string | null;
  contactEmail?: string | null;
  supportUrl?: string | null;
}

const path = (key: FormKey) => `/admin/forms/${encodeURIComponent(key)}`;

export const adminFormsApi = {
  list: () => api<AdminFormView[]>("/admin/forms"),
  history: (key: FormKey, limit = 50) => api<FormHistoryRow[]>(`${path(key)}/history`, { query: { limit } }),
  updateAvailability: (key: FormKey, body: AvailabilityChange) => api<AdminFormView>(`${path(key)}/availability`, { method: "PATCH", body }),
  updateMessages: (key: FormKey, body: MessagesChange) => api<AdminFormView>(`${path(key)}/messages`, { method: "PATCH", body }),
};
