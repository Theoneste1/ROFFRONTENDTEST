"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send, X } from "lucide-react";
import {
  EMAIL_ROLES,
  EMAIL_ROLE_LABEL,
  EMAIL_RULES,
  RECIPIENT_MODES,
  RECIPIENT_MODE_LABEL,
  buildSendPayload,
  emailErrorMessage,
  newIdempotencyKey,
  validateComposer,
  type ComposerErrors,
  type ComposerState,
  type EmailRole,
} from "@/lib/admin-ops/email";
import { errorMessage } from "@/lib/api/errors";
import type { EmailUser } from "@/lib/api/admin-ops";
import type { SchoolRef } from "@/lib/api/types";
import { useEmailUsers, useSendEmail } from "@/lib/queries/admin-ops";
import { useAdminDivisions } from "@/lib/queries/admin";
import { roleLabel } from "@/lib/auth/roles";
import { Alert } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { AdminPage, Card, ConfirmDialog, FilterPills, RequirePermission, SearchInput, SelectFilter, TableMessage, btnPrimary, td, th } from "../../components/adminUi";
import { Field, SchoolPicker, SelectInput, TextInput } from "../../users/components/userUi";

export default function ComposeEmailClient() {
  return (
    <RequirePermission permission="email.bulkSend" title="New e-mail">
      <Composer />
    </RequirePermission>
  );
}

const INITIAL: ComposerState = { subject: "", body: "", mode: "ROLE", role: "", divisionId: "", schoolId: "", userIds: [], confirmAll: false };

function Composer() {
  const router = useRouter();
  const send = useSendEmail();
  const divisions = useAdminDivisions();
  const [state, setState] = useState<ComposerState>(INITIAL);
  const [school, setSchool] = useState<SchoolRef | null>(null);
  const [picked, setPicked] = useState<Map<string, EmailUser>>(new Map());
  const [errors, setErrors] = useState<ComposerErrors>({});
  const [confirming, setConfirming] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // One key per composed e-mail: every attempt to send it (double click, retry after a lost
  // response) reuses it, and the backend returns the job already created instead of sending twice.
  const [idempotencyKey] = useState(() => newIdempotencyKey());
  const inFlight = useRef(false);

  const set = <K extends keyof ComposerState>(key: K, value: ComposerState[K]) => setState((s) => ({ ...s, [key]: value }));

  function recipientsSummary(): string {
    switch (state.mode) {
      case "ROLE":
        return `all active ${EMAIL_ROLE_LABEL[state.role as EmailRole]?.toLowerCase() ?? "users"}`;
      case "DIVISION":
        return `the students of the ${divisions.data?.find((d) => d.id === state.divisionId)?.name ?? "chosen"} division`;
      case "SCHOOL":
        return `the students of ${school?.name ?? "the chosen school"}`;
      case "EXPLICIT":
        return `${state.userIds.length} chosen ${state.userIds.length === 1 ? "person" : "people"}`;
      case "ALL":
        return "every active, approved user of the platform";
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validateComposer(state);
    setErrors(found);
    if (Object.keys(found).length === 0) setConfirming(true);
  }

  async function doSend() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSendError(null);
    try {
      const job = await send.mutateAsync(buildSendPayload(state, idempotencyKey));
      router.push(`/admin/email/jobs/${job.id}?sent=${job.alreadyExisted ? "existing" : "new"}${job.dryRun ? "&dry=1" : ""}`);
    } catch (err) {
      // Shown on the page (the dialog closes): nothing was queued unless the job page opens.
      setSendError(emailErrorMessage(err) ?? errorMessage(err, "Couldn't send the e-mail."));
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <AdminPage title="New e-mail" description="Send a plain-text e-mail to a group of users. Only active, approved accounts receive it.">
      <Link href="/admin/email" className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 mb-4">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> All e-mail
      </Link>
      <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 lg:grid-cols-3 gap-6" data-testid="email-composer">
        <Card className="p-6 lg:col-span-2 space-y-4">
          <TextInput label="Subject" required value={state.subject} onChange={(v) => set("subject", v)} maxLength={EMAIL_RULES.subject.max} error={errors.subject} />
          <Field label="Message" required error={errors.body} hint={`Plain text, ${EMAIL_RULES.body.min}–${EMAIL_RULES.body.max.toLocaleString("en-GB")} characters (${state.body.trim().length.toLocaleString("en-GB")} so far).`}>
            {(id, describedBy) => (
              <textarea
                id={id}
                value={state.body}
                onChange={(e) => set("body", e.target.value)}
                rows={12}
                maxLength={EMAIL_RULES.body.max}
                aria-invalid={errors.body ? true : undefined}
                aria-describedby={describedBy}
                className={`w-full border rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${errors.body ? "border-red-400" : "border-gray-200"}`}
              />
            )}
          </Field>
        </Card>

        <Card className="p-6 space-y-4 h-fit">
          <h2 className="text-base font-bold text-gray-900">Recipients</h2>
          <FilterPills
            label="Recipients"
            options={RECIPIENT_MODES.map((m) => ({ label: RECIPIENT_MODE_LABEL[m], value: m }))}
            value={state.mode}
            onChange={(m) => {
              setErrors((x) => ({ ...x, recipients: undefined }));
              set("mode", m);
            }}
          />
          {state.mode === "ROLE" && (
            <SelectInput
              label="Role"
              required
              value={state.role}
              onChange={(v) => set("role", v as EmailRole | "")}
              options={[{ label: "Choose a role", value: "" }, ...EMAIL_ROLES.map((r) => ({ label: EMAIL_ROLE_LABEL[r], value: r }))]}
            />
          )}
          {state.mode === "DIVISION" &&
            (divisions.isError ? (
              <Alert tone="error">{errorMessage(divisions.error, "Couldn't load the divisions.")}</Alert>
            ) : (
              <SelectInput
                label="Division"
                required
                value={state.divisionId}
                onChange={(v) => set("divisionId", v)}
                options={[{ label: divisions.isPending ? "Loading…" : "Choose a division", value: "" }, ...(divisions.data ?? []).map((d) => ({ label: d.name, value: d.id }))]}
              />
            ))}
          {state.mode === "SCHOOL" && (
            <SchoolPicker
              value={school}
              onChange={(s) => {
                setSchool(s);
                set("schoolId", s?.id ?? "");
              }}
            />
          )}
          {state.mode === "EXPLICIT" && (
            <p className="text-xs text-gray-600">
              {picked.size === 0 ? "Choose people in the list below." : `${picked.size} ${picked.size === 1 ? "person" : "people"} chosen (at most ${EMAIL_RULES.explicitMax}).`}
            </p>
          )}
          {state.mode === "ALL" && (
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input type="checkbox" className="mt-1" checked={state.confirmAll} onChange={(e) => set("confirmAll", e.target.checked)} />
              <span>I understand that every active, approved user of the platform — students, coaches and staff — will receive this e-mail.</span>
            </label>
          )}
          {state.mode !== "EXPLICIT" && state.mode !== "ALL" && <p className="text-xs text-gray-500">Division and school e-mails go to students only.</p>}
          {errors.recipients && <Alert tone="error">{errors.recipients}</Alert>}
          {sendError && (
            <div data-testid="send-error">
              <Alert tone="error">{sendError}</Alert>
            </div>
          )}
          <button type="submit" className={`${btnPrimary} w-full`}>
            <Send className="h-3.5 w-3.5" aria-hidden="true" /> Review and send
          </button>
        </Card>
      </form>

      {state.mode === "EXPLICIT" && (
        <RecipientPicker
          picked={picked}
          onChange={(next) => {
            setPicked(next);
            set("userIds", [...next.keys()]);
          }}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title="Send this e-mail?"
          confirmLabel="Send e-mail"
          body={
            <div className="space-y-2">
              <p>
                <span className="font-semibold">“{state.subject.trim()}”</span> will be sent to {recipientsSummary()}.
              </p>
              <p className="text-xs text-gray-600">It cannot be recalled once sent.</p>
            </div>
          }
          onConfirm={doSend}
          onClose={() => setConfirming(false)}
        />
      )}
    </AdminPage>
  );
}

/** Paged, filterable list from `GET /admin/email/users`; only active, approved accounts can be chosen. */
function RecipientPicker({ picked, onChange }: { picked: Map<string, EmailUser>; onChange: (next: Map<string, EmailUser>) => void }) {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<EmailRole | "">("");
  const [page, setPage] = useState(1);
  const users = useEmailUsers({ search: search || undefined, role: role || undefined, page, limit: 20 });

  function toggle(u: EmailUser) {
    const next = new Map(picked);
    if (next.has(u.id)) next.delete(u.id);
    else if (next.size < EMAIL_RULES.explicitMax) next.set(u.id, u);
    onChange(next);
  }

  return (
    <Card className="mt-6 p-6">
      <h2 className="text-base font-bold text-gray-900 mb-3">Choose people</h2>
      {picked.size > 0 && (
        <ul className="flex flex-wrap gap-2 mb-4" aria-label="Chosen people" data-testid="picked-recipients">
          {[...picked.values()].map((u) => (
            <li key={u.id} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 rounded-full pl-3 pr-1 py-0.5 text-xs">
              {u.firstName} {u.lastName}
              <button type="button" onClick={() => toggle(u)} className="p-0.5 hover:text-indigo-900" aria-label={`Remove ${u.firstName} ${u.lastName}`}>
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search name, username or e-mail…"
          label="Search people"
        />
        <SelectFilter
          label="Role"
          value={role}
          onChange={(v) => {
            setRole(v as EmailRole | "");
            setPage(1);
          }}
          options={[{ label: "Any", value: "" }, ...EMAIL_ROLES.map((r) => ({ label: EMAIL_ROLE_LABEL[r], value: r }))]}
        />
      </div>
      {users.isError ? (
        <Alert tone="error">{errorMessage(users.error, "Couldn't load the users.")}</Alert>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100">
                <th className={th}>
                  <span className="sr-only">Choose</span>
                </th>
                <th className={th}>Name</th>
                <th className={th}>E-mail</th>
                <th className={th}>Role</th>
                <th className={th}>School</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/80" data-testid="email-user-picker">
              {users.isPending ? (
                <TableMessage colSpan={5}>Loading users…</TableMessage>
              ) : users.data.data.length === 0 ? (
                <TableMessage colSpan={5}>No users match.</TableMessage>
              ) : (
                users.data.data.map((u) => {
                  const reachable = u.isActive && u.isApproved;
                  const name = `${u.firstName} ${u.lastName}`;
                  return (
                    <tr key={u.id} className={`text-xs ${reachable ? "" : "opacity-60"}`}>
                      <td className={td}>
                        <input
                          type="checkbox"
                          checked={picked.has(u.id)}
                          disabled={!reachable || (!picked.has(u.id) && picked.size >= EMAIL_RULES.explicitMax)}
                          onChange={() => toggle(u)}
                          aria-label={`Choose ${name}`}
                        />
                      </td>
                      <td className={`${td} font-semibold text-gray-800`}>
                        {name} <span className="font-normal text-gray-500">@{u.username}</span>
                        {!reachable && <span className="block font-normal text-gray-500">{u.isActive ? "Not approved" : "Suspended"} — cannot receive e-mail</span>}
                      </td>
                      <td className={`${td} break-all`}>{u.email}</td>
                      <td className={td}>{roleLabel(u.role)}</td>
                      <td className={`${td} text-gray-600`}>{u.school?.name ?? "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {users.data && (
            <div className="pt-3">
              <Pagination page={page} totalPages={users.data.meta.totalPages} total={users.data.meta.total} onPage={setPage} disabled={users.isFetching} />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
