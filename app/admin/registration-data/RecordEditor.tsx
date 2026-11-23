"use client";

/**
 * One account's registration record: every field of its category, grouped as the backend groups them. Editable fields
 * become inputs of their type; the others show their value and what to do instead (a dedicated action with a reason, or
 * kept by the system). Only what changed is sent; every problem comes back at once, in plain words.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { usersApi } from "@/lib/api/admin";
import type { SchoolRef } from "@/lib/api/types";
import { cellText, changedValues, editValue, groupFields, type RecordField, type RegistrationRecord } from "@/lib/admin/registration-data";
import { useRegistrationRecord, useUpdateRegistrationRecord } from "@/lib/queries/registration-data";
import { Alert, LoadingBlock } from "@/app/components/ui/feedback";
import { Modal, btnPrimary, btnSecondary } from "../components/adminUi";
import { SchoolPicker } from "../users/components/userUi";

const input = "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-gray-50";
const PRIVILEGED = ["ADMIN", "SUPER_ADMIN"];

export function RecordEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useRegistrationRecord(id);
  // Kept here: the form starts again from the saved record (new version), and the confirmation must stay visible.
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <Modal title={q.data ? `Registration record — ${q.data.name}` : "Registration record"} onClose={onClose} wide>
      {q.isLoading && <LoadingBlock />}
      {q.error && <Alert tone="error">{errorMessage(q.error)}</Alert>}
      {saved && <div className="mb-3"><Alert tone="success">{saved}</Alert></div>}
      {q.data && <RecordForm key={q.data.version} record={q.data} onClose={onClose} onSaved={setSaved} />}
    </Modal>
  );
}

function RecordForm({ record, onClose, onSaved }: { record: RegistrationRecord; onClose: () => void; onSaved: (text: string | null) => void }) {
  const save = useUpdateRegistrationRecord(record.id);
  const [edited, setEdited] = useState<Record<string, unknown>>({});
  const [school, setSchool] = useState<SchoolRef | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [problems, setProblems] = useState<Array<{ field: string; message: string }>>([]);
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const changes = useMemo(() => changedValues(record.fields, edited), [record.fields, edited]);
  const roleChange = typeof changes["user.role"] === "string" ? (changes["user.role"] as string) : null;
  const needsPassword = !!roleChange && (PRIVILEGED.includes(record.role) || PRIVILEGED.includes(roleChange));
  const problemFor = (key: string) => problems.filter((p) => p.field === key).map((p) => p.message);

  async function submit() {
    setProblems([]);
    setMessage(null);
    onSaved(null);
    if (!Object.keys(changes).length) {
      setMessage({ tone: "info", text: "Nothing was changed. Edit at least one field, then save." });
      return;
    }
    if (needsPassword && !currentPassword) {
      setMessage({ tone: "error", text: "Changing a role to or from Administrator needs your own password. Type it below, then save again." });
      return;
    }
    try {
      await save.mutateAsync({ changes, version: record.version, currentPassword: needsPassword ? currentPassword : undefined });
      setEdited({});
      onSaved(`Saved. ${Object.keys(changes).length} field${Object.keys(changes).length === 1 ? "" : "s"} changed; the change is in the audit log.`);
    } catch (err) {
      const details = isApiError(err) ? (err.details as { problems?: Array<{ field: string; message: string }> } | undefined) : undefined;
      if (details?.problems?.length) setProblems(details.problems);
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  }

  async function sendReset() {
    setMessage(null);
    try {
      await usersApi.sendPasswordReset(record.id);
      setResetSent(true);
      setMessage({ tone: "success", text: "A password-reset link was e-mailed to this account's address. Passwords are never shown." });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  }

  const set = (key: string, v: unknown) => setEdited((cur) => ({ ...cur, [key]: v }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-5" data-testid="record-form">
      <p className="text-xs text-gray-600">
        Changes are checked first and saved together; the audit log keeps who changed what and when (phone numbers, dates of
        birth and home places are logged as changed, without their values).
      </p>
      {groupFields(record.fields).map((g) => (
        <fieldset key={g.group} className="rounded-xl border border-gray-200 p-4">
          <legend className="px-1 text-xs font-bold uppercase tracking-wider text-gray-500">{g.group}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {g.fields.map((f) => (
              <FieldControl
                key={f.key}
                field={f}
                value={f.key in edited ? edited[f.key] : editValue(f.value, f)}
                onChange={(v) => set(f.key, v)}
                school={school}
                onSchool={(s) => { setSchool(s); set(f.key, s?.id ?? ""); }}
                problems={problemFor(f.key)}
              />
            ))}
          </div>
        </fieldset>
      ))}
      {problems.filter((p) => !record.fields.some((f) => f.key === p.field)).map((p, i) => <Alert key={i} tone="error">{p.message}</Alert>)}
      {needsPassword && (
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-gray-700">Your own password (needed to change a role to or from Administrator)</span>
          <input type="password" className={input} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" data-testid="current-password" />
        </label>
      )}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
        <button type="submit" className={btnPrimary} disabled={save.isPending} data-testid="save-record">
          {save.isPending ? "Saving…" : `Save changes${Object.keys(changes).length ? ` (${Object.keys(changes).length})` : ""}`}
        </button>
        <button type="button" className={btnSecondary} onClick={() => void sendReset()} disabled={resetSent} data-testid="send-password-reset">
          {resetSent ? "Reset link sent" : "Send password-reset link"}
        </button>
        <Link href={`/admin/users/${record.id}`} className={btnSecondary}>
          Open the account (status, date of birth, Olympiad level)
        </Link>
        <button type="button" className={`${btnSecondary} ml-auto`} onClick={onClose}>Close</button>
      </div>
    </form>
  );
}

function FieldControl({ field, value, onChange, school, onSchool, problems }: {
  field: RecordField; value: unknown; onChange: (v: unknown) => void; school: SchoolRef | null; onSchool: (s: SchoolRef | null) => void; problems: string[];
}) {
  const id = `rd-${field.key.replace(/\W/g, "-")}`;
  const labelEl = (
    <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-gray-700">
      {field.label}
      {field.personal && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">personal</span>}
    </span>
  );
  const errors = problems.length > 0 && (
    <span className="mt-1 block text-xs text-red-700" role="alert">{problems.join(" ")}</span>
  );
  if (!field.editable) {
    return (
      <div data-testid={`field-${field.key}`}>
        {labelEl}
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-800">{cellText(field.value, field)}</p>
        {field.note && <span className="mt-1 block text-[11px] text-gray-500">{field.note}</span>}
        {errors}
      </div>
    );
  }
  let control: React.ReactNode;
  if (field.reference === "school") {
    control = (
      <div className="space-y-1">
        <p className="text-xs text-gray-600">Now: {school?.name ?? cellText(field.value, field)}</p>
        <SchoolPicker value={school} onChange={onSchool} label="Choose another school" />
      </div>
    );
  } else if (field.type === "boolean") {
    control = <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
  } else if (field.type === "enum" && field.values) {
    control = (
      <select id={id} className={input} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)}>
        {(field.nullable || value === "") && <option value="">—</option>}
        {field.values.map((v) => <option key={v} value={v}>{field.valueLabels?.[v] ?? v}</option>)}
      </select>
    );
  } else if (field.type === "enumList" && field.values) {
    const chosen = Array.isArray(value) ? (value as string[]) : [];
    control = (
      <div className="flex flex-wrap gap-3">
        {field.values.map((v) => (
          <label key={v} className="flex items-center gap-1.5 text-sm text-gray-800">
            <input type="checkbox" checked={chosen.includes(v)} onChange={(e) => onChange(e.target.checked ? [...chosen, v] : chosen.filter((x) => x !== v))} />
            {field.valueLabels?.[v] ?? v}
          </label>
        ))}
      </div>
    );
  } else if (field.type === "textList") {
    control = (
      <input id={id} className={input} value={Array.isArray(value) ? (value as string[]).join(", ") : ""} placeholder="separated by commas"
        onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
    );
  } else {
    const type = field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "datetime" ? "datetime-local" : /email/i.test(field.key) ? "email" : /phone/i.test(field.key) ? "tel" : "text";
    const long = field.type === "text" && (field.maxLength === null || field.maxLength > 200) && /experience|expertise|note|reason|description/i.test(field.key);
    control = long ? (
      <textarea id={id} className={input} rows={3} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
    ) : (
      <input id={id} className={input} type={type} step={field.integer ? 1 : undefined} value={typeof value === "string" || typeof value === "number" ? value : ""}
        maxLength={field.maxLength ?? undefined} placeholder={type === "tel" ? "+250788123456" : undefined} onChange={(e) => onChange(e.target.value)} />
    );
  }
  return (
    <label htmlFor={id} className="block" data-testid={`field-${field.key}`}>
      {labelEl}
      {control}
      {errors}
    </label>
  );
}
