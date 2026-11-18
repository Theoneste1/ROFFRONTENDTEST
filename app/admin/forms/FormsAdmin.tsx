"use client";

/**
 * Forms (`/admin/forms`, capability formAvailability): student registration, teacher registration, coach
 * applications and the contact form. Each can be opened, closed or scheduled (forms.manageAvailability), and its
 * closed message, instructions, contact e-mail and support link edited (forms.editMessages). Every change is
 * audited and listed under History. Rules: lib/admin/form-availability.ts.
 */
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminFormsApi, type AdminFormView } from "@/lib/api/admin-forms";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { useSession } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query/keys";
import { formatDateTime, personName } from "@/lib/format";
import { kigaliTime } from "@/lib/forms/closed-form";
import {
  FORMS_MANAGE_PERMISSION,
  FORMS_MESSAGES_PERMISSION,
  FORM_MODE_OPTIONS,
  FORM_STATE_META,
  MESSAGE_LIMITS,
  availabilityChange,
  availabilityDraft,
  availabilityProblems,
  formStateLabel,
  formsErrorMessage,
  formsPageMode,
  historyLines,
  historySource,
  messagesChange,
  messagesDraft,
  messagesProblems,
  neverChanged,
  scheduleSummary,
  teacherRoleNote,
  type AvailabilityDraft,
  type MessagesDraft,
} from "@/lib/admin/form-availability";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { Alert, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { Button } from "@/app/components/ui/form";
import { AdminPage, Badge, Card, Modal, Notice, linkBtn } from "../components/adminUi";

type Dialog = { kind: "availability" | "messages" | "history"; form: AdminFormView } | null;

const inputCls =
  "w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500";
const labelCls = "block text-sm font-semibold text-slate-700 mb-1";

function useFriendlyError() {
  return (e: unknown) => (isApiError(e) ? formsErrorMessage(e) : null) ?? errorMessage(e);
}

export default function FormsAdmin() {
  const { permissionsStatus, can, retry: retrySession } = useSession();
  const caps = useBackendCapabilities();
  const mode = formsPageMode({ detection: caps.detection, detectionLoading: caps.loading, permissionsStatus, can });
  const visible = mode === "visible";
  const list = useQuery({ queryKey: queryKeys.adminForms.list(), queryFn: adminFormsApi.list, enabled: visible });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  if (!visible) {
    return (
      <AdminPage title="Forms">
        {mode === "loading" && <LoadingBlock />}
        {mode === "error" && <ErrorState error={null} title="Couldn't load your permissions" onRetry={retrySession} />}
        {mode === "unsupported" && <Notice tone="info">This server does not provide form management yet.</Notice>}
        {mode === "forbidden" && <Notice tone="info">Form management needs the forms.view permission.</Notice>}
      </AdminPage>
    );
  }

  const mayManage = can(FORMS_MANAGE_PERMISSION);
  const mayEditMessages = can(FORMS_MESSAGES_PERMISSION);
  return (
    <AdminPage
      title="Forms"
      description="Open, close or schedule the registration and website forms, and set what people see while a form is closed. Times are in Kigali time."
    >
      {notice && (
        <Notice tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}
      {list.isPending ? (
        <LoadingBlock />
      ) : list.isError ? (
        <ErrorState error={list.error} title="Couldn't load the forms" onRetry={() => list.refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2" data-testid="admin-forms">
          {list.data.map((f) => {
            const meta = FORM_STATE_META[f.state];
            const roleNote = teacherRoleNote(f);
            return (
              <Card key={f.key} className="p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">{f.label}</h2>
                    <p className="text-xs text-gray-500 font-mono">{f.key}</p>
                  </div>
                  <Badge className={meta?.badge ?? "bg-slate-100 text-slate-700"}>{formStateLabel(f.state)}</Badge>
                </div>
                <p className="text-sm text-gray-700">{scheduleSummary(f)}</p>
                {roleNote && <Alert tone="info">{roleNote}</Alert>}
                <div className="text-xs text-gray-600 space-y-1">
                  <p>
                    <span className="font-semibold text-gray-600">Closed message: </span>
                    {f.closedMessageCustom ? f.closedMessageCustom : <span className="italic">built-in — {f.closedMessageDefault}</span>}
                  </p>
                  {f.instructions && (
                    <p className="whitespace-pre-line">
                      <span className="font-semibold text-gray-600">Instructions: </span>
                      {f.instructions}
                    </p>
                  )}
                  {(f.contactEmail || f.supportUrl) && (
                    <p>
                      <span className="font-semibold text-gray-600">Contact: </span>
                      {[f.contactEmail, f.supportUrl].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <p className="text-gray-500">
                    {neverChanged(f) ? "Never changed (initial setting)." : `Last changed ${formatDateTime(f.updatedAt)}${f.updatedBy ? ` by ${personName(f.updatedBy)}` : ""}.`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-4 pt-1">
                  {mayManage && (
                    <button type="button" className={linkBtn} onClick={() => setDialog({ kind: "availability", form: f })}>
                      Change availability
                    </button>
                  )}
                  {mayEditMessages && (
                    <button type="button" className={linkBtn} onClick={() => setDialog({ kind: "messages", form: f })}>
                      Edit messages
                    </button>
                  )}
                  <button type="button" className={linkBtn} onClick={() => setDialog({ kind: "history", form: f })}>
                    History
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {dialog?.kind === "availability" && (
        <AvailabilityDialog
          form={dialog.form}
          onClose={() => setDialog(null)}
          onSaved={(f) => {
            setDialog(null);
            setNotice({ tone: "success", text: `${f.label}: ${formStateLabel(f.state).toLowerCase()} — ${scheduleSummary(f)}.` });
          }}
        />
      )}
      {dialog?.kind === "messages" && (
        <MessagesDialog
          form={dialog.form}
          onClose={() => setDialog(null)}
          onSaved={(f) => {
            setDialog(null);
            setNotice({ tone: "success", text: `${f.label}: messages saved.` });
          }}
        />
      )}
      {dialog?.kind === "history" && <HistoryDialog form={dialog.form} onClose={() => setDialog(null)} />}
    </AdminPage>
  );
}

function AvailabilityDialog({ form, onClose, onSaved }: { form: AdminFormView; onClose: () => void; onSaved: (f: AdminFormView) => void }) {
  const qc = useQueryClient();
  const friendly = useFriendlyError();
  const [draft, setDraft] = useState<AvailabilityDraft>(() => availabilityDraft(form));
  const [submitted, setSubmitted] = useState(false);
  const problems = availabilityProblems(draft);
  const change = availabilityChange(form, draft);
  const save = useMutation({
    mutationFn: () => adminFormsApi.updateAvailability(form.key, change ?? {}),
    onSuccess: (f) => {
      void qc.invalidateQueries({ queryKey: queryKeys.adminForms.all });
      void qc.invalidateQueries({ queryKey: queryKeys.forms.public(form.key) });
      onSaved(f);
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (problems.length || !change) return;
    save.mutate();
  };
  const set = (k: keyof AvailabilityDraft) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));
  return (
    <Modal title={`${form.label}: availability`} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <fieldset>
          <legend className={labelCls}>Mode</legend>
          <div className="space-y-2">
            {FORM_MODE_OPTIONS.map((o) => (
              <label key={o.value} className="flex items-start gap-2 text-sm text-slate-700">
                <input type="radio" name="mode" value={o.value} checked={draft.mode === o.value} onChange={() => set("mode")(o.value)} className="mt-1" />
                <span>
                  <span className="font-semibold">{o.label}</span>
                  <span className="block text-xs text-slate-600">{o.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="form-opens" className={labelCls}>
              Opening time (Kigali){draft.mode === "SCHEDULED" && <span className="text-red-500"> *</span>}
            </label>
            <input id="form-opens" type="datetime-local" className={inputCls} value={draft.opensAt} onChange={(e) => set("opensAt")(e.target.value)} disabled={draft.mode !== "SCHEDULED"} />
            {draft.mode !== "SCHEDULED" && <p className="mt-1 text-xs text-slate-500">Used only by a scheduled form (kept).</p>}
          </div>
          <div>
            <label htmlFor="form-closes" className={labelCls}>
              Closing time (Kigali, optional)
            </label>
            <input id="form-closes" type="datetime-local" className={inputCls} value={draft.closesAt} onChange={(e) => set("closesAt")(e.target.value)} disabled={draft.mode === "CLOSED"} />
            {draft.closesAt && draft.mode !== "CLOSED" && (
              <button type="button" className={`${linkBtn} mt-1`} onClick={() => set("closesAt")("")}>
                Remove the closing time
              </button>
            )}
          </div>
        </div>
        {draft.mode === "SCHEDULED" && draft.opensAt && !problems.length && (
          <p className="text-xs text-slate-600">Opens {kigaliTime(`${draft.opensAt}:00+02:00`)}.</p>
        )}
        {submitted && problems.length > 0 && (
          <Alert tone="error">
            {problems.map((p) => (
              <span key={p} className="block">
                {p}
              </span>
            ))}
          </Alert>
        )}
        {submitted && !problems.length && !change && <Alert tone="info">Nothing changed.</Alert>}
        {save.isError && <Alert tone="error">{friendly(save.error)}</Alert>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const MESSAGE_FIELDS: readonly { key: keyof MessagesDraft; label: string; hint: string; multiline?: boolean; type?: string }[] = [
  { key: "closedMessage", label: "Closed message", hint: "Shown while the form is closed. Leave empty to use the built-in message.", multiline: true },
  { key: "instructions", label: "Instructions", hint: "Extra guidance shown with the form, open or closed. Optional.", multiline: true },
  { key: "contactEmail", label: "Contact e-mail", hint: "Optional.", type: "email" },
  { key: "supportUrl", label: "Support link", hint: "Optional; must start with https://.", type: "url" },
];

function MessagesDialog({ form, onClose, onSaved }: { form: AdminFormView; onClose: () => void; onSaved: (f: AdminFormView) => void }) {
  const qc = useQueryClient();
  const friendly = useFriendlyError();
  const [draft, setDraft] = useState<MessagesDraft>(() => messagesDraft(form));
  const [submitted, setSubmitted] = useState(false);
  const problems = messagesProblems(draft);
  const change = messagesChange(form, draft);
  const save = useMutation({
    mutationFn: () => adminFormsApi.updateMessages(form.key, change ?? {}),
    onSuccess: (f) => {
      void qc.invalidateQueries({ queryKey: queryKeys.adminForms.all });
      void qc.invalidateQueries({ queryKey: queryKeys.forms.public(form.key) });
      onSaved(f);
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(problems).length || !change) return;
    save.mutate();
  };
  return (
    <Modal title={`${form.label}: messages`} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {MESSAGE_FIELDS.map((fld) => {
          const id = `form-msg-${fld.key}`;
          const err = submitted ? problems[fld.key] : undefined;
          const common = {
            id,
            value: draft[fld.key],
            maxLength: MESSAGE_LIMITS[fld.key],
            className: `${inputCls} ${err ? "border-red-400" : ""}`,
            "aria-invalid": err ? true : undefined,
          };
          return (
            <div key={fld.key}>
              <label htmlFor={id} className={labelCls}>
                {fld.label}
              </label>
              {fld.multiline ? (
                <textarea
                  {...common}
                  rows={fld.key === "closedMessage" ? 3 : 4}
                  placeholder={fld.key === "closedMessage" ? form.closedMessageDefault : undefined}
                  onChange={(e) => setDraft((d) => ({ ...d, [fld.key]: e.target.value }))}
                />
              ) : (
                <input {...common} type={fld.type ?? "text"} onChange={(e) => setDraft((d) => ({ ...d, [fld.key]: e.target.value }))} />
              )}
              <p className={`mt-1 text-xs ${err ? "text-red-600" : "text-slate-500"}`}>{err ?? fld.hint}</p>
            </div>
          );
        })}
        {submitted && !Object.keys(problems).length && !change && <Alert tone="info">Nothing changed.</Alert>}
        {save.isError && <Alert tone="error">{friendly(save.error)}</Alert>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function HistoryDialog({ form, onClose }: { form: AdminFormView; onClose: () => void }) {
  const history = useQuery({ queryKey: queryKeys.adminForms.history(form.key), queryFn: () => adminFormsApi.history(form.key, 50) });
  return (
    <Modal title={`${form.label}: history`} onClose={onClose} wide>
      {history.isPending ? (
        <LoadingBlock />
      ) : history.isError ? (
        <ErrorState error={history.error} title="Couldn't load the history" onRetry={() => history.refetch()} />
      ) : history.data.length === 0 ? (
        <p className="text-sm text-slate-600">No changes yet.</p>
      ) : (
        <ol className="space-y-3" data-testid="form-history">
          {history.data.map((row) => (
            <li key={row.id} className="border border-slate-100 rounded-lg p-3">
              <p className="text-xs text-slate-600">
                {formatDateTime(row.createdAt)} · {historySource(row)} · {row.actorUsername ?? "deleted account"}
                {row.actorRole ? ` (${row.actorRole})` : ""}
              </p>
              <ul className="mt-1 text-sm text-slate-700">
                {historyLines(row).map((l) => (
                  <li key={l} className="break-words">
                    {l}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
