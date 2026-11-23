"use client";

/**
 * A coach's access across their programmes (owner 2026-11-23): for each programme the caller manages (an Administrator:
 * every one; a Head Coach: the ones they head), four switches — students, courses, marking, published results — all on by
 * default. Turning one off asks for a reason; turning it back on gives it back at once. Everything is recorded.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { errorMessage } from "@/lib/api/errors";
import { formatDate } from "@/lib/format";
import {
  CAPABILITY_TEXT, coachAccessApi, removalReasonProblem, removedText, type CoachAccess, type CoachCapability,
} from "@/lib/coaches/coach-access";
import { Alert, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { Modal, btnDanger, btnSecondary } from "@/app/admin/components/adminUi";

export default function CoachAccessPanel({ coachId, programmeId }: { coachId: string; programmeId?: string }) {
  const qc = useQueryClient();
  const key = ["coach-programme-access", coachId];
  const q = useQuery({ queryKey: key, queryFn: () => coachAccessApi.get(coachId), retry: false });
  const [pending, setPending] = useState<{ programmeId: string; programmeName: string; capability: CoachCapability } | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const change = useMutation({
    mutationFn: (v: { programmeId: string; capability: CoachCapability; allowed: boolean; reason?: string }) => coachAccessApi.set(coachId, v),
    onSuccess: (data: CoachAccess) => qc.setQueryData(key, data),
  });

  async function giveBack(programmeId: string, programmeName: string, capability: CoachCapability) {
    setMessage(null);
    try {
      await change.mutateAsync({ programmeId, capability, allowed: true });
      setMessage({ tone: "success", text: `${CAPABILITY_TEXT[capability].label} — given back in ${programmeName}.` });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  }

  if (q.isPending) return <LoadingBlock />;
  if (q.isError) return <ErrorState error={q.error} title="Couldn't load the coach's access" onRetry={() => q.refetch()} />;
  const programmes = q.data.programmes.filter((p) => !programmeId || p.programme.id === programmeId);
  return (
    <div className="space-y-4" data-testid="coach-access-panel">
      <p className="text-xs text-gray-600">
        By default a coach has all of this in every programme they belong to, at every level. Turn a part off to take it away
        from this coach in that programme (a reason is required); turn it on to give it back.
      </p>
      {programmes.length === 0 && <Alert tone="info">This coach is not a member of a programme you manage.</Alert>}
      {programmes.map((p) => (
        <section key={p.programme.id} className="rounded-xl border border-gray-200" data-testid={`coach-access-${p.programme.code}`}>
          <h3 className="border-b border-gray-100 px-4 py-2 text-sm font-bold text-gray-900">{p.programme.name}</h3>
          <ul className="divide-y divide-gray-100">
            {p.access.map((a) => (
              <li key={a.capability} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3" data-testid={`access-${p.programme.code}-${a.capability}`}>
                <div className="min-w-[14rem] flex-1">
                  <p className="text-sm font-semibold text-gray-900">{CAPABILITY_TEXT[a.capability].label}</p>
                  <p className="text-xs text-gray-600">{CAPABILITY_TEXT[a.capability].hint}</p>
                  {a.removed && <p className="mt-1 text-xs text-red-700">{removedText(a.removed, formatDate)}</p>}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <span className={a.allowed ? "font-semibold text-emerald-800" : "font-semibold text-red-700"}>{a.allowed ? "On" : "Off"}</span>
                  <input
                    type="checkbox"
                    role="switch"
                    aria-checked={a.allowed}
                    aria-label={`${CAPABILITY_TEXT[a.capability].label} in ${p.programme.name}`}
                    checked={a.allowed}
                    disabled={change.isPending}
                    onChange={() => (a.allowed
                      ? setPending({ programmeId: p.programme.id, programmeName: p.programme.name, capability: a.capability })
                      : void giveBack(p.programme.id, p.programme.name, a.capability))}
                    data-testid={`switch-${p.programme.code}-${a.capability}`}
                  />
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {pending && (
        <RemoveDialog
          title={`Take away: ${CAPABILITY_TEXT[pending.capability].label}`}
          programmeName={pending.programmeName}
          onClose={() => setPending(null)}
          onConfirm={async (reason) => {
            await change.mutateAsync({ programmeId: pending.programmeId, capability: pending.capability, allowed: false, reason });
            setMessage({ tone: "success", text: `${CAPABILITY_TEXT[pending.capability].label} — taken away in ${pending.programmeName}.` });
            setPending(null);
          }}
        />
      )}
    </div>
  );
}

function RemoveDialog({ title, programmeName, onClose, onConfirm }: { title: string; programmeName: string; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const p = removalReasonProblem(reason);
          if (p) return setProblem(p);
          setBusy(true);
          setProblem(null);
          try {
            await onConfirm(reason.trim());
          } catch (err) {
            setProblem(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="text-sm text-gray-700">In {programmeName}. It applies at once and can be given back later.</p>
        <label className="block text-xs font-semibold text-gray-700">
          Reason
          <textarea className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="removal-reason" autoFocus />
        </label>
        {problem && <Alert tone="error">{problem}</Alert>}
        <div className="flex gap-2">
          <button type="submit" className={btnDanger} disabled={busy} data-testid="confirm-removal">{busy ? "Saving…" : "Take it away"}</button>
          <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

