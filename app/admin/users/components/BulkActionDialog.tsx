"use client";

/**
 * Bulk action on many accounts (capability bulkUserOperations): choose the action and its parameters, preview it
 * (the server counts the accounts, shows a sample, warnings and consequences, and returns a selectionToken), then
 * confirm. The confirmation is bound to exactly the previewed accounts; if they changed the server answers 409
 * SELECTION_CHANGED and the dialog asks for a new preview. Rules: lib/admin/bulk-users.ts.
 */
import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "@/lib/api/admin";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { hasFeature } from "@/lib/api/capabilities";
import { useDivisions } from "@/lib/queries/divisions";
import { activeDivisions, divisionOptionLabel } from "@/lib/divisions/divisions";
import { bulkUsersApi, type BulkAction, type BulkPreview, type BulkSelection } from "@/lib/api/bulk-users";
import { errorMessage, isApiError } from "@/lib/api/errors";
import type { Permission } from "@/lib/api/types";
import { roleLabel } from "@/lib/auth/roles";
import { queryKeys } from "@/lib/query/keys";
import {
  BULK_ACTIONS,
  EMPTY_PARAMS,
  REASON_MAX,
  allowedActions,
  willApplySummary,
  teacherStudentBulkSupported,
  TEACHER_STUDENT_ACTIONS,
  TEACHER_DELEGATION_OPTIONS,
  bulkErrorMessage,
  delegationLabel,
  buildParams,
  confirmProblems,
  executeBody,
  newIdempotencyKey,
  selectionSummary,
  type ConfirmDraft,
  type ParamsDraft,
} from "@/lib/admin/bulk-users";
import { Alert } from "@/app/components/ui/feedback";
import { Button } from "@/app/components/ui/form";
import { Modal } from "../../components/adminUi";

const GRADES = ["S1", "S2", "S3", "S4", "S5", "S6"] as const;
const inputCls =
  "w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500";
const labelCls = "block text-sm font-semibold text-slate-700 mb-1";

/** The chosen teacher, kept with its name so it stays visible after a new search and on the confirmation step. */
type ChosenTeacher = { id: string; firstName: string; lastName: string; username: string };

export default function BulkActionDialog({
  selection,
  can,
  roleOptions,
  onClose,
  onStarted,
}: {
  selection: BulkSelection;
  can: (p: Permission) => boolean;
  /** Roles the caller may give (the single-user form's list); Super Administrator is removed. */
  roleOptions: readonly string[];
  onClose: () => void;
  onStarted: (operationId: string, total: number) => void;
}) {
  const qc = useQueryClient();
  const { detection } = useBackendCapabilities();
  const teacherActions = teacherStudentBulkSupported(detection);
  const levelActions = hasFeature(detection, "olympiadLevels");
  const activateNowAction = hasFeature(detection, "adminActivateNow");
  const actions = useMemo(() => allowedActions(can, teacherActions, levelActions, activateNowAction), [can, teacherActions, levelActions, activateNowAction]);
  const divisions = useDivisions();
  const [action, setAction] = useState<BulkAction | "">(actions[0] ?? "");
  const [params, setParams] = useState<ParamsDraft>(EMPTY_PARAMS);
  const [teacher, setTeacher] = useState<ChosenTeacher | null>(null);
  const [preview, setPreview] = useState<BulkPreview | null>(null);
  const [confirm, setConfirm] = useState<ConfirmDraft>({ reason: "", currentPassword: "", acknowledged: false });
  // One key per confirmed preview: retrying the same confirmation never starts a second operation.
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [problem, setProblem] = useState<string | null>(null);

  const built = action ? buildParams(action, params) : { problem: "Choose an action." };
  const resetPreview = () => {
    setPreview(null);
    setConfirm({ reason: "", currentPassword: "", acknowledged: false });
    setIdempotencyKey(newIdempotencyKey());
  };

  const runPreview = useMutation({
    mutationFn: () => bulkUsersApi.preview({ action: action as BulkAction, ...(built.params && { params: built.params }), selection }),
    onSuccess: (p) => {
      setProblem(null);
      setPreview(p);
      setConfirm({ reason: "", currentPassword: "", acknowledged: false });
      setIdempotencyKey(newIdempotencyKey());
    },
    onError: (e) => setProblem((isApiError(e) ? bulkErrorMessage(e)?.text : null) ?? errorMessage(e)),
  });

  const execute = useMutation({
    mutationFn: (p: BulkPreview) => bulkUsersApi.execute(executeBody(p, confirm, idempotencyKey)),
    onSuccess: (r, p) => {
      void qc.invalidateQueries({ queryKey: queryKeys.bulkUsers.all });
      void qc.invalidateQueries({ queryKey: queryKeys.admin.usersAll });
      onStarted(r.operation.id, p.total);
    },
    onError: (e) => {
      const known = isApiError(e) ? bulkErrorMessage(e) : null;
      setProblem(known?.text ?? errorMessage(e));
      if (known?.previewAgain) resetPreview();
    },
  });

  const submitPreview = (e: FormEvent) => {
    e.preventDefault();
    if (built.problem) {
      setProblem(built.problem);
      return;
    }
    runPreview.mutate();
  };

  const confirmIssues = preview ? confirmProblems(preview, confirm) : [];
  const submitExecute = (e: FormEvent) => {
    e.preventDefault();
    if (!preview || confirmIssues.length) return;
    setProblem(null);
    execute.mutate(preview);
  };

  if (actions.length === 0) {
    return (
      <Modal title="Bulk action" onClose={onClose}>
        <Alert tone="info">You don&apos;t hold the permissions any bulk action needs.</Alert>
      </Modal>
    );
  }

  return (
    <Modal title="Bulk action" onClose={onClose} wide>
      <p className="text-sm text-slate-600 mb-4">
        Applies to <strong>{selectionSummary(selection)}</strong>. The server checks every account against the usual rules and reports each result.
      </p>

      {!preview ? (
        <form onSubmit={submitPreview} className="space-y-4" noValidate>
          <div>
            <label htmlFor="bulk-action" className={labelCls}>
              Action
            </label>
            <select
              id="bulk-action"
              className={inputCls}
              value={action}
              onChange={(e) => {
                setAction(e.target.value as BulkAction);
                setProblem(null);
              }}
            >
              {actions.map((a) => (
                <option key={a} value={a}>
                  {BULK_ACTIONS[a].label}
                </option>
              ))}
            </select>
          </div>
          {action === "assignRole" && (
            <div>
              <label htmlFor="bulk-role" className={labelCls}>
                New role
              </label>
              <select id="bulk-role" className={inputCls} value={params.role} onChange={(e) => setParams((p) => ({ ...p, role: e.target.value }))}>
                <option value="">Choose…</option>
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {action === "changeClassification" && (
            <div>
              <label htmlFor="bulk-grade" className={labelCls}>
                New grade (students only; a level that follows the grade follows it)
              </label>
              <select id="bulk-grade" className={inputCls} value={params.gradeLevel} onChange={(e) => setParams((p) => ({ ...p, gradeLevel: e.target.value }))}>
                <option value="">Choose…</option>
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          )}
          {action === "setOlympiadLevel" && (
            <div>
              <label htmlFor="bulk-level" className={labelCls}>
                Olympiad level (students only)
              </label>
              <select id="bulk-level" className={inputCls} value={params.olympiadLevel} onChange={(e) => setParams((p) => ({ ...p, olympiadLevel: e.target.value }))} data-testid="bulk-level">
                <option value="">Choose…</option>
                {activeDivisions(divisions.data).map((d) => (
                  <option key={d.code} value={d.code}>
                    {divisionOptionLabel(d)}
                  </option>
                ))}
                <option value="AUTOMATIC">Automatic — follow the grade</option>
              </select>
              <p className="mt-1 text-xs text-slate-600">A level chosen here is kept when the grade changes. Automatic returns each student to the level of their grade. A reason is required.</p>
            </div>
          )}
          {action !== "" && TEACHER_STUDENT_ACTIONS.includes(action) && (
            <TeacherParams params={params} setParams={setParams} teacher={teacher} setTeacher={setTeacher} withPermission={action === "grantDelegation" || action === "revokeDelegation"} />
          )}
          {action === "message" && (
            <>
              <div>
                <label htmlFor="bulk-subject" className={labelCls}>
                  Subject
                </label>
                <input id="bulk-subject" className={inputCls} maxLength={200} value={params.subject} onChange={(e) => setParams((p) => ({ ...p, subject: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="bulk-body" className={labelCls}>
                  Message
                </label>
                <textarea id="bulk-body" className={inputCls} rows={6} maxLength={10_000} value={params.body} onChange={(e) => setParams((p) => ({ ...p, body: e.target.value }))} />
                <p className="mt-1 text-xs text-slate-500">Sent once to each active account in the selection.</p>
              </div>
            </>
          )}
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
            <p className="text-sm text-slate-800">
              <strong>{BULK_ACTIONS[preview.action]?.label ?? preview.action}</strong> — {preview.total} account{preview.total === 1 ? "" : "s"}
            </p>
            {TEACHER_STUDENT_ACTIONS.includes(preview.action) && (
              <dl className="mt-2 text-sm text-slate-700 space-y-0.5" data-testid="bulk-preview-teacher">
                <div>
                  <dt className="inline font-semibold">Teacher: </dt>
                  <dd className="inline">
                    {teacher && teacher.id === preview.params.teacherId ? (
                      <>
                        {teacher.firstName} {teacher.lastName} <span className="text-slate-600">@{teacher.username}</span>
                      </>
                    ) : (
                      preview.params.teacherId
                    )}
                  </dd>
                </div>
                {preview.params.permission && (
                  <div>
                    <dt className="inline font-semibold">Permission: </dt>
                    <dd className="inline">{delegationLabel(preview.params.permission)}</dd>
                  </div>
                )}
              </dl>
            )}
            {willApplySummary(preview) && (
              <p className="mt-1 text-sm font-medium text-slate-800" data-testid="bulk-will-apply">
                {willApplySummary(preview)}
              </p>
            )}
            {preview.consequences.map((c) => (
              <p key={c} className="mt-1 text-xs text-slate-600">
                {c}
              </p>
            ))}
            {preview.sample.length > 0 && (
              <ul className="mt-3 text-xs text-slate-600 space-y-0.5">
                {preview.sample.map((u) => (
                  <li key={u.id}>
                    {u.firstName} {u.lastName} <span className="text-slate-500">@{u.username}</span> · {roleLabel(u.role)} · {u.accountStatus.toLowerCase()}
                  </li>
                ))}
                {preview.total > preview.sample.length && <li className="text-slate-500">…and {preview.total - preview.sample.length} more</li>}
              </ul>
            )}
          </div>
          {preview.warnings.map((w) => (
            <Alert key={w.code} tone="info">
              {w.message} ({w.count})
            </Alert>
          ))}
          <div>
            <label htmlFor="bulk-reason" className={labelCls}>
              Reason{preview.requiresReason ? <span className="text-amber-600"> *</span> : " (optional)"}
            </label>
            <textarea
              id="bulk-reason"
              className={inputCls}
              rows={2}
              maxLength={REASON_MAX}
              value={confirm.reason}
              onChange={(e) => setConfirm((c) => ({ ...c, reason: e.target.value }))}
            />
          </div>
          {preview.requiresStepUp && (
            <div>
              <label htmlFor="bulk-password" className={labelCls}>
                Your current password <span className="text-amber-600">*</span>
              </label>
              <input
                id="bulk-password"
                type="password"
                autoComplete="current-password"
                className={inputCls}
                value={confirm.currentPassword}
                onChange={(e) => setConfirm((c) => ({ ...c, currentPassword: e.target.value }))}
              />
              <p className="mt-1 text-xs text-slate-500">Needed because the change involves Administrator roles. It is checked once and never stored.</p>
            </div>
          )}
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-1" checked={confirm.acknowledged} onChange={(e) => setConfirm((c) => ({ ...c, acknowledged: e.target.checked }))} />
            <span>
              I want to apply <strong>{BULK_ACTIONS[preview.action]?.label.toLowerCase() ?? preview.action}</strong> to these {preview.total} account
              {preview.total === 1 ? "" : "s"}.
            </span>
          </label>
          {problem && <Alert tone="error">{problem}</Alert>}
          {confirmIssues.length > 0 && confirm.acknowledged && (
            <Alert tone="info">
              {confirmIssues.map((i) => (
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
              <Button type="submit" loading={execute.isPending} disabled={confirmIssues.length > 0}>
                Apply to {preview.total} account{preview.total === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Progress and per-account results appear under <Link href="/admin/users/bulk" className="underline">Bulk operations</Link>.
          </p>
        </form>
      )}
    </Modal>
  );
}


/** The teacher (search by name or username) and, for permissions, which permission. */
function TeacherParams({ params, setParams, teacher, setTeacher, withPermission }: {
  params: ParamsDraft;
  setParams: (fn: (p: ParamsDraft) => ParamsDraft) => void;
  teacher: ChosenTeacher | null;
  setTeacher: (t: ChosenTeacher | null) => void;
  withPermission: boolean;
}) {
  const [search, setSearch] = useState("");
  const teachers = useQuery({
    queryKey: ["bulk-teacher-search", search],
    queryFn: () => usersApi.list({ role: "TEACHER", search: search.trim() || undefined, limit: 20 }),
  });
  const found = teachers.data?.data ?? [];
  // The chosen teacher stays an option even when a new search no longer returns it.
  const chosen = teacher && teacher.id === params.teacherId ? teacher : null;
  const options = chosen && !found.some((t) => t.id === chosen.id) ? [chosen, ...found] : found;
  return (
    <>
      <div>
        <label htmlFor="bulk-teacher-search" className={labelCls}>
          Teacher
        </label>
        <input id="bulk-teacher-search" className={inputCls} placeholder="Search by name or username…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Teacher" className={`${inputCls} mt-2`} value={params.teacherId}
          onChange={(e) => {
            const id = e.target.value;
            const t = options.find((o) => o.id === id);
            setTeacher(t ? { id: t.id, firstName: t.firstName, lastName: t.lastName, username: t.username } : null);
            setParams((p) => ({ ...p, teacherId: id }));
          }}
        >
          <option value="">Choose…</option>
          {options.map((t) => (
            <option key={t.id} value={t.id}>
              {t.firstName} {t.lastName} (@{t.username})
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">Only students in the selection are affected; other accounts are skipped.</p>
      </div>
      {withPermission && (
        <div>
          <label htmlFor="bulk-permission" className={labelCls}>
            Permission
          </label>
          <select id="bulk-permission" className={inputCls} value={params.permission} onChange={(e) => setParams((p) => ({ ...p, permission: e.target.value }))}>
            <option value="">Choose…</option>
            {TEACHER_DELEGATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}
