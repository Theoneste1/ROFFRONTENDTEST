"use client";

/**
 * Extensions tab of a test (tests.extensions: Administrators; Head Coaches of the subject). Lists the test's extensions
 * (active, expired, cancelled — with who granted, edited or cancelled them, and why); grants a new one for the whole test,
 * one student or one teacher (a new deadline after the test's own, a mandatory reason); edits or cancels one before it
 * expires (reason mandatory). The test's own deadline never changes. The server checks every rule against its own clock.
 */
import { useId, useState, type FormEvent } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { testExtensionsApi, type ExtensionKind, type TestExtension } from "@/lib/api/test-submissions";
import type { TestDetail } from "@/lib/api/tests";
import { errorMessage } from "@/lib/api/errors";
import { queryKeys } from "@/lib/query/keys";
import { formatDateTime, personName } from "@/lib/format";
import { fromLocalInput, toLocalInput } from "@/lib/test-management/rules";
import { CANCEL_REASON, EXTENSION_KIND_LABEL, EXTENSION_STATE_BADGE, extensionProblems, type ExtensionDraft } from "@/lib/test-management/submissions";
import { Alert, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { FilterPills } from "@/app/components/ui/PageFrame";
import { ConfirmDialog, Modal, Notice, SearchInput, TableCard, TableMessage, btnPrimary, btnSecondary, linkBtn, td, th } from "@/app/admin/components/adminUi";
import { inputBad, inputCls, inputOk, labelCls } from "./shared";

const STATES: { label: string; value: "active" | "cancelled" | "all" }[] = [
  { label: "Not cancelled", value: "active" },
  { label: "Cancelled", value: "cancelled" },
  { label: "All", value: "all" },
];

export default function ExtensionsPanel({ test }: { test: TestDetail }) {
  const qc = useQueryClient();
  const [state, setState] = useState<"active" | "cancelled" | "all">("active");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<TestExtension | "new" | null>(null);
  const [cancelling, setCancelling] = useState<TestExtension | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const filters = { state, page, limit: 20 };
  const list = useQuery({ queryKey: queryKeys.tests.extensions(test.id, filters), queryFn: () => testExtensionsApi.list(test.id, filters), placeholderData: keepPreviousData });
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.tests.all });

  return (
    <div className="space-y-5" data-testid="extensions-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">Deadline extensions</h3>
          <p className="mt-0.5 text-xs text-slate-700">
            The test&apos;s own deadline stays {formatDateTime(test.closesAt)}. An extension gives a later one to the whole test, one student, or one teacher&apos;s
            submissions for their students; with a student and a teacher extension, the later applies. Students and teachers see their new deadline, never an &quot;extended&quot; mark.
          </p>
        </div>
        <button type="button" className={btnPrimary} onClick={() => setEditing("new")} data-testid="new-extension">Give an extension</button>
      </div>
      {notice && <Notice tone="success" onClose={() => setNotice(null)}>{notice}</Notice>}
      <FilterPills label="Extensions" options={STATES} value={state} onChange={(v) => { setState(v); setPage(1); }} />
      {list.isPending ? <LoadingBlock /> : list.isError ? <ErrorState error={list.error} title="Couldn't load the extensions" onRetry={() => list.refetch()} /> : (
        <>
          <TableCard>
            <thead>
              <tr className="border-b border-gray-100">
                <th className={th}>For</th>
                <th className={th}>New deadline</th>
                <th className={th}>Reason</th>
                <th className={th}>State</th>
                <th className={th}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/80" data-testid="extension-rows">
              {list.data.data.length === 0 ? <TableMessage colSpan={5}>No extension.</TableMessage> : list.data.data.map((e) => {
                const b = EXTENSION_STATE_BADGE[e.state];
                const who = e.kind === "TEST" ? "Every student" : e.kind === "STUDENT" ? `${personName(e.student)} @${e.student?.username}` : `${personName(e.teacher)} @${e.teacher?.username} (teacher)`;
                return (
                  <tr key={e.id} className="text-xs" data-testid={`extension-${e.id}`}>
                    <td className={td}><span className="font-semibold text-gray-900">{who}</span><span className="block text-gray-700">{EXTENSION_KIND_LABEL[e.kind]}</span></td>
                    <td className={`${td} text-gray-800`}>{formatDateTime(e.newDeadline)}</td>
                    <td className={`${td} text-gray-800`}>
                      “{e.reason}”
                      <span className="block text-gray-600">Given {formatDateTime(e.grantedAt)}{e.grantedBy && ` by ${personName(e.grantedBy)}`}{e.editedAt && ` · edited ${formatDateTime(e.editedAt)}${e.editedBy ? ` by ${personName(e.editedBy)}` : ""}`}</span>
                    </td>
                    <td className={td}>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${b.className}`}>{b.label}</span>
                      {e.cancelledAt && <span className="block text-gray-600">{formatDateTime(e.cancelledAt)}{e.cancelledBy && ` by ${personName(e.cancelledBy)}`}: “{e.cancelReason}”</span>}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      {e.state === "ACTIVE" && (
                        <span className="flex gap-3">
                          <button type="button" className={linkBtn} onClick={() => setEditing(e)} aria-label={`Edit the extension for ${who}`}>Edit</button>
                          <button type="button" className={linkBtn} onClick={() => setCancelling(e)} aria-label={`Cancel the extension for ${who}`}>Cancel</button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableCard>
          <Pagination page={list.data.meta.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} disabled={list.isFetching} />
        </>
      )}
      {editing && (
        <ExtensionDialog test={test} extension={editing === "new" ? null : editing} onClose={() => setEditing(null)}
          onSaved={async (msg) => { setEditing(null); setNotice(msg); await refresh(); }} />
      )}
      {cancelling && (
        <ConfirmDialog
          title="Cancel this extension?"
          body="The deadline goes back to what applies without it. Submissions already made are kept. The reason is recorded in the audit log."
          confirmLabel="Cancel the extension"
          tone="danger"
          note={CANCEL_REASON}
          onConfirm={async (reason) => {
            await testExtensionsApi.cancel(test.id, cancelling.id, reason);
            setNotice("The extension was cancelled.");
            await refresh();
          }}
          onClose={() => setCancelling(null)}
        />
      )}
    </div>
  );
}

function ExtensionDialog({ test, extension, onClose, onSaved }: { test: TestDetail; extension: TestExtension | null; onClose: () => void; onSaved: (msg: string) => Promise<void> }) {
  const ids = useId();
  const editing = extension !== null;
  const [d, setD] = useState<ExtensionDraft>({
    kind: extension?.kind ?? "STUDENT", targetId: "", newDeadline: extension ? toLocalInput(extension.newDeadline) : "", reason: extension?.reason ?? "",
  });
  const [targetName, setTargetName] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [errors, setErrors] = useState<Partial<Record<keyof ExtensionDraft, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const individual = !editing && d.kind !== "TEST";
  const targets = useQuery({
    queryKey: queryKeys.tests.extensionTargets(test.id, d.kind, q),
    queryFn: () => testExtensionsApi.targets(test.id, d.kind as "STUDENT" | "TEACHER", q || undefined),
    enabled: individual,
    placeholderData: keepPreviousData,
  });
  const save = useMutation({
    mutationFn: () => {
      const newDeadline = fromLocalInput(d.newDeadline)!;
      return editing
        ? testExtensionsApi.update(test.id, extension.id, { newDeadline, reason: d.reason.trim() })
        : testExtensionsApi.create(test.id, {
          kind: d.kind, newDeadline, reason: d.reason.trim(),
          ...(d.kind === "STUDENT" && { studentId: d.targetId }), ...(d.kind === "TEACHER" && { teacherId: d.targetId }),
        });
    },
    onSuccess: () => onSaved(editing ? "The extension was changed." : "The extension was given."),
    onError: (e) => setError(errorMessage(e)),
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    const p = extensionProblems(d, test.closesAt, Date.now(), { editing });
    setErrors(p);
    if (Object.keys(p).length) return;
    setError(null);
    save.mutate();
  }
  const setKind = (kind: ExtensionKind) => { setD((s) => ({ ...s, kind, targetId: "" })); setTargetName(null); setQ(""); };
  return (
    <Modal title={editing ? "Change the extension" : "Give an extension"} onClose={onClose} wide>
      <form onSubmit={submit} noValidate className="space-y-4" data-testid="extension-form">
        {error && <Alert tone="error">{error}</Alert>}
        {!editing && (
          <fieldset>
            <legend className={labelCls}>For</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              {(["STUDENT", "TEACHER", "TEST"] as const).map((k) => (
                <label key={k} className="inline-flex items-center gap-2">
                  <input type="radio" name="kind" value={k} checked={d.kind === k} onChange={() => setKind(k)} /> {EXTENSION_KIND_LABEL[k]}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {individual && (
          <div>
            <p className={labelCls}>{d.kind === "STUDENT" ? "Student" : "Teacher"}</p>
            {targetName ? (
              <p className="flex items-center gap-3 text-sm text-slate-900" data-testid="extension-target">
                {targetName} <button type="button" className={linkBtn} onClick={() => { setTargetName(null); setD((s) => ({ ...s, targetId: "" })); }}>Change</button>
              </p>
            ) : (
              <>
                <SearchInput value={q} onChange={setQ} placeholder={d.kind === "STUDENT" ? "Search students of the test's division" : "Search teachers"} label={d.kind === "STUDENT" ? "Search students" : "Search teachers"} />
                {targets.isPending ? <LoadingBlock /> : targets.isError ? <Alert tone="error">{errorMessage(targets.error)}</Alert> : (
                  <ul className="mt-2 max-h-56 divide-y divide-slate-200 overflow-y-auto rounded-xl border border-slate-200" data-testid="extension-targets">
                    {targets.data.data.length === 0 ? <li className="px-3 py-2 text-sm text-slate-700">Nobody found.</li> : targets.data.data.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span>
                          <span className="font-semibold text-slate-900">{personName(t)}</span> <span className="text-slate-600">@{t.username}</span>
                          {t.school && <span className="block text-xs text-slate-600">{t.gradeLevel ? `${t.gradeLevel} · ` : ""}{t.school.name}</span>}
                        </span>
                        {t.activeExtensionId ? <span className="text-xs font-semibold text-slate-700">Has one</span> : (
                          <button type="button" className={btnSecondary} onClick={() => { setD((s) => ({ ...s, targetId: t.id })); setTargetName(`${personName(t)} @${t.username}`); }}
                            aria-label={`Choose ${personName(t)}`}>Choose</button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {errors.targetId && <p className="mt-1 text-xs text-red-700">{errors.targetId}</p>}
          </div>
        )}
        <div className="max-w-xs">
          <label htmlFor={`${ids}-deadline`} className={labelCls}>New deadline</label>
          <input id={`${ids}-deadline`} type="datetime-local" className={`${inputCls} ${errors.newDeadline ? inputBad : inputOk}`} value={d.newDeadline}
            onChange={(e) => setD((s) => ({ ...s, newDeadline: e.target.value }))} aria-invalid={!!errors.newDeadline} aria-describedby={`${ids}-deadline-d`} />
          <p id={`${ids}-deadline-d`} className={`mt-1 text-xs ${errors.newDeadline ? "text-red-700" : "text-slate-600"}`}>
            {errors.newDeadline ?? `Your local time; after the test's own deadline (${formatDateTime(test.closesAt)}).`}
          </p>
        </div>
        <div>
          <label htmlFor={`${ids}-reason`} className={labelCls}>{editing ? "Reason for the change" : "Reason"}</label>
          <textarea id={`${ids}-reason`} rows={3} maxLength={500} className={`${inputCls} ${errors.reason ? inputBad : inputOk}`} value={d.reason}
            onChange={(e) => setD((s) => ({ ...s, reason: e.target.value }))} aria-invalid={!!errors.reason} aria-describedby={errors.reason ? `${ids}-reason-e` : undefined} />
          {errors.reason && <p id={`${ids}-reason-e`} className="mt-1 text-xs text-red-700">{errors.reason}</p>}
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnPrimary} disabled={save.isPending} data-testid="save-extension">{save.isPending ? "Saving…" : editing ? "Save" : "Give the extension"}</button>
        </div>
      </form>
    </Modal>
  );
}
