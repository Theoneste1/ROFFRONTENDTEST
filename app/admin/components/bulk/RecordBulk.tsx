"use client";

/**
 * Bulk actions on any list (capability bulkOperationsGeneric + users.bulkManage): tick records (or the whole page),
 * or act on every record matching the list's filters; choose an action the server offers this administrator,
 * preview it (count, sample, warnings, consequence), give the reason when required and confirm. The confirmation is
 * bound to exactly the previewed records; progress and the result of every record are on /admin/bulk.
 * Rules: lib/admin/bulk-records.ts.
 *
 * Usage in a list page:
 *   const bulk = useRecordBulk("SCHOOL", { pageIds, filter: bulkFilterFrom(listFilters), total, onDone: refresh });
 *   {bulk.toolbar}                                  above the table
 *   {bulk.enabled && <th>{bulk.headerCheckbox}</th>} {bulk.enabled && <td>{bulk.rowCheckbox(id, name)}</td>}
 *   {bulk.dialog}                                   anywhere
 */
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import { bulkApi, type RecordPreview, type RecordSelection } from "@/lib/api/bulk";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { useSession } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query/keys";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { formatNumber } from "@/lib/format";
import { newIdempotencyKey } from "@/lib/admin/bulk-users";
import {
  DEFAULT_MAX_IDS,
  EMPTY_CONFIRM,
  REASON_MAX,
  countNoun,
  entityTypeInfo,
  genericBulkAvailable,
  idsSelection,
  recordActionDanger,
  recordActionLabel,
  recordBulkError,
  recordConfirmProblems,
  recordExecuteBody,
  recordSelectionSummary,
  recordSummary,
  recordTypeMeta,
  toggleRecord,
  toggleRecordPage,
  type RecordConfirmDraft,
} from "@/lib/admin/bulk-records";
import { Alert } from "@/app/components/ui/feedback";
import { Button } from "@/app/components/ui/form";
import { Modal, btnSecondary, linkBtn } from "../adminUi";

const inputCls =
  "w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500";
const labelCls = "block text-sm font-semibold text-slate-700 mb-1";
const EMPTY: Set<string> = new Set();

/** The actions this administrator may run, per record type (one request, shared by every list). */
export function useBulkActions() {
  const { detection } = useBackendCapabilities();
  const { can, permissionsStatus } = useSession();
  const available = permissionsStatus === "ready" && genericBulkAvailable(detection, can);
  const query = useQuery({ queryKey: queryKeys.bulk.actions(), queryFn: bulkApi.actions, enabled: available, staleTime: 60_000 });
  return { available, view: query.data ?? null };
}

export function useRecordBulk(
  entityType: string,
  opts: {
    /** The ids on the current page. */
    pageIds: readonly string[];
    /** The list's filters as a bulk filter (bulkFilterFrom); a change clears the selection. */
    filter: Record<string, unknown>;
    /** Records matching the filters (the list's total), for "Act on all N matching". */
    total: number | undefined;
    /** After an operation started (e.g. refresh the list). */
    onStarted?: () => void;
  },
) {
  const { available, view } = useBulkActions();
  const info = entityTypeInfo(view, entityType);
  const enabled = available && !!info;
  const max = info?.maxIds ?? DEFAULT_MAX_IDS;
  const m = recordTypeMeta(entityType);
  // The ticks belong to one filter: a new filter is a new list, so they no longer describe what is shown.
  const filterKey = JSON.stringify(opts.filter);
  const [ticks, setTicks] = useState<{ key: string; ids: Set<string> }>(() => ({ key: filterKey, ids: new Set() }));
  const selected = ticks.key === filterKey ? ticks.ids : EMPTY;
  const setSelected = (fn: Set<string> | ((cur: Set<string>) => Set<string>)) =>
    setTicks((t) => ({ key: filterKey, ids: typeof fn === "function" ? fn(t.key === filterKey ? t.ids : EMPTY) : fn }));
  const [selection, setSelection] = useState<RecordSelection | null>(null);
  const [started, setStarted] = useState<{ id: string; total: number } | null>(null);

  const pageAllOn = opts.pageIds.length > 0 && opts.pageIds.every((id) => selected.has(id));
  const total = opts.total ?? 0;

  const headerCheckbox = (
    <input
      type="checkbox"
      aria-label={`Select every ${m.singular} on this page`}
      checked={pageAllOn}
      disabled={opts.pageIds.length === 0}
      onChange={() => setSelected((cur) => toggleRecordPage(cur, opts.pageIds, max))}
      data-testid="bulk-select-page"
    />
  );
  const rowCheckbox = (id: string, name: string) => (
    <input
      type="checkbox"
      aria-label={`Select ${name}`}
      checked={selected.has(id)}
      onChange={() => setSelected((cur) => toggleRecord(cur, id, max))}
      data-testid="bulk-select-row"
    />
  );

  const toolbar: ReactNode = enabled ? (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-white border border-gray-100 px-4 py-3 text-xs text-gray-600" data-testid="bulk-toolbar">
      <span>
        {selected.size > 0
          ? `${formatNumber(selected.size)} selected${selected.size >= max ? ` (the maximum, ${formatNumber(max)})` : ""}`
          : `Tick ${m.plural} to act on them together, or act on every match.`}
      </span>
      {selected.size > 0 && (
        <button type="button" className={linkBtn} onClick={() => setSelected(new Set())}>
          Clear selection
        </button>
      )}
      <span className="flex-1" />
      {selected.size > 0 && (
        <button type="button" className={btnSecondary} onClick={() => setSelection(idsSelection(selected, max))} data-testid="bulk-act-selected">
          Act on {formatNumber(selected.size)} selected
        </button>
      )}
      {total > 0 && (
        <button type="button" className={btnSecondary} onClick={() => setSelection({ mode: "filter", filter: opts.filter })} data-testid="bulk-act-matching">
          Act on all {formatNumber(total)} matching
        </button>
      )}
      <Link href={`/admin/bulk?type=${encodeURIComponent(entityType)}`} className={`${linkBtn} inline-flex items-center gap-1`}>
        <Layers className="h-3.5 w-3.5" aria-hidden="true" /> Bulk operations
      </Link>
    </div>
  ) : null;

  const notice: ReactNode = started ? (
    <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status" data-testid="bulk-started">
      Bulk operation started on {countNoun(entityType, started.total)}.{" "}
      <Link href={`/admin/bulk?operation=${encodeURIComponent(started.id)}`} className="underline font-medium">
        See progress and results
      </Link>
      <button type="button" className="ml-3 text-xs text-emerald-700 underline" onClick={() => setStarted(null)}>
        Dismiss
      </button>
    </div>
  ) : null;

  const dialog: ReactNode =
    enabled && selection ? (
      <RecordBulkDialog
        entityType={entityType}
        actions={info!.actions}
        selection={selection}
        onClose={() => setSelection(null)}
        onStarted={(id, n) => {
          setSelection(null);
          setSelected(new Set());
          setStarted({ id, total: n });
          opts.onStarted?.();
        }}
      />
    ) : null;

  return { enabled, selected, headerCheckbox, rowCheckbox, toolbar: <>{notice}{toolbar}</>, dialog };
}

export function RecordBulkDialog({
  entityType,
  actions,
  selection,
  onClose,
  onStarted,
}: {
  entityType: string;
  actions: { action: string; requiresReason: boolean; consequence: string }[];
  selection: RecordSelection;
  onClose: () => void;
  onStarted: (operationId: string, total: number) => void;
}) {
  const qc = useQueryClient();
  const m = recordTypeMeta(entityType);
  const ordered = useMemo(() => actions.map((a) => a.action), [actions]);
  const [action, setAction] = useState(ordered[0] ?? "");
  const [preview, setPreview] = useState<RecordPreview | null>(null);
  const [confirm, setConfirm] = useState<RecordConfirmDraft>(EMPTY_CONFIRM);
  // One key per confirmed preview: retrying the same confirmation never starts a second operation.
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [problem, setProblem] = useState<string | null>(null);
  const chosen = actions.find((a) => a.action === action);

  const resetPreview = () => {
    setPreview(null);
    setConfirm(EMPTY_CONFIRM);
    setIdempotencyKey(newIdempotencyKey());
  };
  const explain = (e: unknown) => (isApiError(e) ? recordBulkError(entityType, e) : null);

  const runPreview = useMutation({
    mutationFn: () => bulkApi.preview(entityType, { action, selection }),
    onSuccess: (p) => {
      setProblem(null);
      setPreview({ ...p, entityType: p.entityType ?? entityType });
      setConfirm(EMPTY_CONFIRM);
      setIdempotencyKey(newIdempotencyKey());
    },
    onError: (e) => setProblem(explain(e)?.text ?? errorMessage(e)),
  });

  const execute = useMutation({
    mutationFn: (p: RecordPreview) => bulkApi.execute(entityType, recordExecuteBody(p, confirm, idempotencyKey)),
    onSuccess: (r, p) => {
      void qc.invalidateQueries({ queryKey: queryKeys.bulk.all });
      onStarted(r.operation.id, p.total);
    },
    onError: (e) => {
      const known = explain(e);
      setProblem(known?.text ?? errorMessage(e));
      if (known?.previewAgain) resetPreview();
    },
  });

  const submitPreview = (e: FormEvent) => {
    e.preventDefault();
    if (!action) {
      setProblem("Choose an action.");
      return;
    }
    runPreview.mutate();
  };
  const issues = preview ? recordConfirmProblems(preview, confirm) : [];
  const submitExecute = (e: FormEvent) => {
    e.preventDefault();
    if (!preview || issues.length) return;
    setProblem(null);
    execute.mutate(preview);
  };
  const label = recordActionLabel(entityType, preview?.action ?? action);

  return (
    <Modal title={`Bulk action on ${m.plural}`} onClose={onClose} wide>
      <p className="text-sm text-slate-600 mb-4">
        Applies to <strong>{recordSelectionSummary(entityType, selection)}</strong>. The server checks every {m.singular} with the same rules as a single
        change and reports each result.
      </p>

      {!preview ? (
        <form onSubmit={submitPreview} className="space-y-4" noValidate data-testid="bulk-choose">
          <div>
            <label htmlFor="bulk-record-action" className={labelCls}>
              Action
            </label>
            <select
              id="bulk-record-action"
              className={inputCls}
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setProblem(null);
              }}
            >
              {ordered.map((a) => (
                <option key={a} value={a}>
                  {recordActionLabel(entityType, a)}
                </option>
              ))}
            </select>
            {chosen && <p className="mt-2 text-xs text-slate-600">{chosen.consequence}</p>}
          </div>
          {problem && <Alert tone="error">{problem}</Alert>}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={runPreview.isPending}>
              Preview
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={submitExecute} className="space-y-4" noValidate data-testid="bulk-preview">
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm text-slate-800" data-testid="bulk-preview-total">
              <strong>{label}</strong> — {countNoun(entityType, preview.total)}
            </p>
            {preview.consequences.map((c) => (
              <p key={c} className="mt-1 text-xs text-slate-600">
                {c}
              </p>
            ))}
            {preview.sample.length > 0 && (
              <ul className="mt-3 text-xs text-slate-600 space-y-0.5" data-testid="bulk-preview-sample">
                {preview.sample.map((r, i) => {
                  const s = recordSummary(entityType, r);
                  return (
                    <li key={typeof r.id === "string" ? r.id : i}>
                      {s?.title}
                      {s?.detail && <span className="text-slate-500"> · {s.detail}</span>}
                    </li>
                  );
                })}
                {preview.total > preview.sample.length && <li className="text-slate-500">…and {formatNumber(preview.total - preview.sample.length)} more</li>}
              </ul>
            )}
          </div>
          {preview.warnings.map((w) => (
            <Alert key={w.code} tone="info">
              {w.message} ({formatNumber(w.count)})
            </Alert>
          ))}
          <div>
            <label htmlFor="bulk-record-reason" className={labelCls}>
              Reason{preview.requiresReason ? <span className="text-red-500"> *</span> : " (optional)"}
            </label>
            <textarea
              id="bulk-record-reason"
              className={inputCls}
              rows={2}
              maxLength={REASON_MAX}
              value={confirm.reason}
              onChange={(e) => setConfirm((c) => ({ ...c, reason: e.target.value }))}
            />
          </div>
          {preview.requiresStepUp && (
            <div>
              <label htmlFor="bulk-record-password" className={labelCls}>
                Your current password <span className="text-red-500">*</span>
              </label>
              <input
                id="bulk-record-password"
                type="password"
                autoComplete="current-password"
                className={inputCls}
                value={confirm.currentPassword}
                onChange={(e) => setConfirm((c) => ({ ...c, currentPassword: e.target.value }))}
              />
            </div>
          )}
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-1"
              checked={confirm.acknowledged}
              onChange={(e) => setConfirm((c) => ({ ...c, acknowledged: e.target.checked }))}
              data-testid="bulk-acknowledge"
            />
            <span>
              I want to apply <strong>{label.toLowerCase()}</strong> to these {countNoun(entityType, preview.total)}.
            </span>
          </label>
          {problem && <Alert tone="error">{problem}</Alert>}
          {issues.length > 0 && confirm.acknowledged && (
            <Alert tone="info">
              {issues.map((i) => (
                <span key={i} className="block">
                  {i}
                </span>
              ))}
            </Alert>
          )}
          <div className="flex flex-wrap justify-between gap-3">
            <Button type="button" variant="secondary" onClick={resetPreview} disabled={execute.isPending}>
              Back
            </Button>
            <div className="flex gap-3">
              <Button type="button" variant="secondary" onClick={onClose} disabled={execute.isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                className={recordActionDanger(entityType, preview.action) ? "!bg-red-600 hover:!bg-red-700" : ""}
                loading={execute.isPending}
                disabled={issues.length > 0}
                data-testid="bulk-apply"
              >
                {label} {countNoun(entityType, preview.total)}
              </Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
