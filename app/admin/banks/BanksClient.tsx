'use client';

/**
 * Banks (owner 2026-11-27, Super Administrators): the banks Teachers, Coaches and Head Coaches choose, and each bank's
 * account-number rule. Umwalimu SACCO always stays, available and exactly 12 digits. A bank someone uses can be
 * switched off (it is then no longer offered; whoever has it keeps it) but not removed. Every change needs a reason and
 * a confirmation; saved bank details are never changed (people whose saved number no longer fits a new rule are asked
 * only when they next change their number — nobody is locked out).
 */
import { useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, Trash2 } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { errorMessage } from "@/lib/api/errors";
import { banksApi, bodyOf, draftInstruction, draftOf, draftProblems, isSaccoName, type BankDraft, type RuleKind } from "@/lib/admin/banks";
import { PageFrame } from "@/app/components/ui/PageFrame";
import { Alert, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { ConfirmDialog, Notice, btnPrimary, btnSecondary } from "@/app/admin/components/adminUi";

const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-200";

export default function BanksClient() {
  const { role } = useSession();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin", "banking", "banks"], queryFn: banksApi.list, enabled: role === "SUPER_ADMIN" });
  // Kept here: the editor starts afresh from the saved list after a save, and the confirmation must survive that.
  const [notice, setNotice] = useState<string | null>(null);
  if (role && role !== "SUPER_ADMIN") {
    return <PageFrame title="Banks"><Alert tone="info">Only a Super Administrator manages the bank list.</Alert></PageFrame>;
  }
  if (list.isPending) return <PageFrame title="Banks"><LoadingBlock label="Loading the banks…" /></PageFrame>;
  if (list.isError) return <PageFrame title="Banks"><ErrorState error={list.error} title="Couldn't load the banks" onRetry={() => list.refetch()} /></PageFrame>;
  return (
    <BanksEditor
      key={JSON.stringify(list.data.banks)}
      initial={list.data.banks.map(draftOf)}
      notice={notice}
      setNotice={setNotice}
      onSaved={(v) => { qc.setQueryData(["admin", "banking", "banks"], v); setNotice("The bank list was saved. The forms use it at once."); }}
    />
  );
}

function BanksEditor({ initial, onSaved, notice, setNotice }: {
  initial: BankDraft[];
  onSaved: (v: Awaited<ReturnType<typeof banksApi.save>>) => void;
  notice: string | null;
  setNotice: (n: string | null) => void;
}) {
  const ids = useId();
  const [rows, setRows] = useState<BankDraft[]>(initial);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const problems = useMemo(() => draftProblems(rows), [rows]);
  const changed = JSON.stringify(bodyOf(rows)) !== JSON.stringify(bodyOf(initial));
  const set = (i: number, patch: Partial<BankDraft>) => { setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r))); setNotice(null); };
  const save = useMutation({
    mutationFn: () => banksApi.save(bodyOf(rows), reason.trim()),
    onSuccess: (v) => { setConfirming(false); setReason(""); onSaved(v); },
    onError: (e) => { setConfirming(false); setProblem(errorMessage(e)); },
  });

  function review() {
    setProblem(null);
    if (Object.keys(problems).length) return setProblem("Correct the banks marked in red first.");
    if (reason.trim().length < 3) return setProblem("Give the reason for the change (at least 3 characters). It is kept in the audit log.");
    setConfirming(true);
  }

  const summary = summarize(initial, rows);
  return (
    <PageFrame
      title="Banks"
      description="The banks Teachers, Coaches and Head Coaches choose, and the rule each bank's account numbers follow. Umwalimu SACCO always stays, with exactly 12 digits."
    >
      {notice && <Notice tone="success" onClose={() => setNotice(null)}>{notice}</Notice>}
      <div className="space-y-4">
        <Alert tone="info">
          Saved bank details are never changed here. A bank people already use can be switched off (it is no longer offered; whoever has it keeps it) but not removed.
          If a rule changes, people whose saved number does not fit it are asked only when they next change their number.
        </Alert>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-[760px] w-full text-sm" data-testid="banks-table">
            <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr><th className="px-4 py-3">Bank</th><th className="px-4 py-3">Offered</th><th className="px-4 py-3">Account number rule</th><th className="px-4 py-3">In use</th><th className="px-4 py-3"><span className="sr-only">Remove</span></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => {
                const sacco = isSaccoName(r.name) && !r.isNew;
                return (
                  <tr key={i} className="align-top" data-testid={`bank-row-${i}`}>
                    <td className="px-4 py-3">
                      {sacco ? (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900"><Lock className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />{r.name}</span>
                      ) : (
                        <>
                          <label htmlFor={`${ids}-n${i}`} className="sr-only">Bank name</label>
                          <input id={`${ids}-n${i}`} className={input} value={r.name} maxLength={120} onChange={(e) => set(i, { name: e.target.value })} aria-invalid={problems[i] ? true : undefined} />
                        </>
                      )}
                      <p className={`mt-1 text-xs ${problems[i] ? "text-red-700" : "text-slate-500"}`} data-testid={`bank-instruction-${i}`}>{problems[i] ?? draftInstruction(r)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <label className="inline-flex min-h-9 items-center gap-2">
                        <input type="checkbox" className="h-4 w-4 accent-[#00428C]" checked={sacco || r.active} disabled={sacco} onChange={(e) => set(i, { active: e.target.checked })} aria-label={`Offer ${r.name || "this bank"}`} />
                        <span className="text-slate-700">{sacco || r.active ? "Offered" : "Switched off"}</span>
                      </label>
                    </td>
                    <td className="px-4 py-3">
                      {sacco ? <span className="text-slate-700">Exactly 12 digits</span> : (
                        <div className="flex flex-wrap items-center gap-2">
                          <label htmlFor={`${ids}-k${i}`} className="sr-only">Rule</label>
                          <select id={`${ids}-k${i}`} className={`${input} w-auto`} value={r.kind} onChange={(e) => set(i, { kind: e.target.value as RuleKind })}>
                            <option value="GENERAL">General check</option>
                            <option value="EXACT">Exactly … digits</option>
                            <option value="RANGE">Between … digits</option>
                          </select>
                          {r.kind !== "GENERAL" && <input aria-label={r.kind === "EXACT" ? "Number of digits" : "Smallest number of digits"} className={`${input} w-20`} inputMode="numeric" value={r.min} onChange={(e) => set(i, { min: e.target.value })} />}
                          {r.kind === "RANGE" && <><span className="text-slate-500">to</span><input aria-label="Largest number of digits" className={`${input} w-20`} inputMode="numeric" value={r.max} onChange={(e) => set(i, { max: e.target.value })} /></>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {r.isNew ? "New" : `${r.accounts} ${r.accounts === 1 ? "account" : "accounts"}`}
                      {r.accountsNotFollowingRule > 0 && <p className="mt-1 text-xs text-amber-800">{r.accountsNotFollowingRule} saved {r.accountsNotFollowingRule === 1 ? "number does" : "numbers do"} not follow the rule.</p>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!sacco && (
                        <button type="button" className="rounded-lg p-1.5 text-red-700 hover:bg-red-50 disabled:opacity-40" disabled={r.accounts > 0}
                          title={r.accounts > 0 ? "In use: switch it off instead" : `Remove ${r.name || "this bank"}`} aria-label={`Remove ${r.name || "this bank"}`}
                          onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className={btnSecondary} data-testid="bank-add"
          onClick={() => setRows((rs) => [...rs, { name: "", active: true, kind: "GENERAL", min: "", max: "", accounts: 0, accountsNotFollowingRule: 0, isNew: true }])}>
          <Plus className="mr-1 inline h-4 w-4" aria-hidden="true" />Add a bank
        </button>
        <div>
          <label htmlFor={`${ids}-reason`} className="mb-1 block text-sm font-semibold text-slate-700">Reason for the change (kept in the audit log)</label>
          <textarea id={`${ids}-reason`} rows={2} maxLength={500} className={input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: a new partner bank for teachers' payments." />
        </div>
        {problem && <Alert tone="error">{problem}</Alert>}
        <div className="flex justify-end gap-3">
          <button type="button" className={btnSecondary} disabled={!changed} onClick={() => { setRows(initial); setProblem(null); }}>Discard changes</button>
          <button type="button" className={btnPrimary} disabled={!changed || save.isPending} onClick={review} data-testid="banks-save">Save the bank list</button>
        </div>
      </div>
      {confirming && (
        <ConfirmDialog
          title="Save the bank list?"
          body={summary.length ? summary.join(" ") : "Save the bank list."}
          confirmLabel="Save"
          onConfirm={async () => { await save.mutateAsync(); }}
          onClose={() => setConfirming(false)}
        />
      )}
    </PageFrame>
  );
}

/** What changes, in plain words, for the confirmation. */
function summarize(before: readonly BankDraft[], after: readonly BankDraft[]): string[] {
  const key = (n: string) => n.trim().toLowerCase();
  const old = new Map(before.map((b) => [key(b.name), b]));
  const next = new Map(after.map((b) => [key(b.name), b]));
  const out: string[] = [];
  const added = after.filter((b) => !old.has(key(b.name))).map((b) => b.name.trim());
  const removed = before.filter((b) => !next.has(key(b.name))).map((b) => b.name);
  const off = after.filter((b) => old.get(key(b.name))?.active && !b.active).map((b) => b.name);
  const on = after.filter((b) => old.has(key(b.name)) && !old.get(key(b.name))!.active && b.active).map((b) => b.name);
  const ruled = after.filter((b) => old.has(key(b.name)) && draftInstruction(old.get(key(b.name))!) !== draftInstruction(b)).map((b) => b.name);
  if (added.length) out.push(`Added: ${added.join(", ")}.`);
  if (removed.length) out.push(`Removed: ${removed.join(", ")}.`);
  if (off.length) out.push(`Switched off (no longer offered; whoever has it keeps it): ${off.join(", ")}.`);
  if (on.length) out.push(`Offered again: ${on.join(", ")}.`);
  if (ruled.length) out.push(`New account-number rule: ${ruled.join(", ")}. Nobody is locked out; people are asked only when they next change their number.`);
  return out;
}
