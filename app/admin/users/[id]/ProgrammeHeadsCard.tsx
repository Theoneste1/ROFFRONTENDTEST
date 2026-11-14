"use client";

/**
 * Which programmes a Head Coach heads (programmes.manageHeads: Administrators).
 * The backend has one route per programme that REPLACES its heads
 * (`PUT /admin/programmes/:id/heads { userIds }`), so each change re-reads the
 * programme's current heads first and sends that list with this person added
 * or removed — never a stale copy. A Head Coach sees and manages only the
 * programmes they head.
 */
import { useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { programmesApi } from "@/lib/api/programmes";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { queryKeys } from "@/lib/query/keys";
import { Alert, LoadingBlock } from "@/app/components/ui/feedback";
import { Card } from "../../components/adminUi";

export default function ProgrammeHeadsCard({ userId, name }: { userId: string; name: string }) {
  const qc = useQueryClient();
  const programmes = useQuery({ queryKey: queryKeys.programmes.list(), queryFn: programmesApi.list });
  const list = programmes.data ?? [];
  const heads = useQueries({
    queries: list.map((p) => ({ queryKey: queryKeys.accounts.programmeHeads(p.id), queryFn: () => programmesApi.heads(p.id) })),
  });
  const [error, setError] = useState<string | null>(null);
  const toggle = useMutation({
    mutationFn: async ({ programmeId, head }: { programmeId: string; head: boolean }) => {
      const current = (await programmesApi.heads(programmeId)).map((h) => h.id).filter((id) => id !== userId);
      return programmesApi.setHeads(programmeId, head ? [...current, userId] : current);
    },
    onSuccess: (data, { programmeId }) => {
      setError(null);
      qc.setQueryData(queryKeys.accounts.programmeHeads(programmeId), data);
    },
    onError: (e) => setError(isApiError(e) && e.code === "NOT_A_HEAD_COACH" ? "Only Head Coach accounts can head a programme." : errorMessage(e)),
  });

  return (
    <Card className="p-6 lg:col-span-3">
      <div data-testid="programme-heads">
        <h2 className="text-base font-bold text-gray-900 mb-1">Programmes headed</h2>
        <p className="text-xs text-gray-500 mb-4">
          {name} monitors the programmes ticked here: their students, coaches and reports. Preparing and grading work still needs course access on the Coaches page.
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        {programmes.isPending ? (
          <LoadingBlock />
        ) : programmes.isError ? (
          <Alert tone="error">{errorMessage(programmes.error)}</Alert>
        ) : list.length === 0 ? (
          <p className="text-sm text-gray-500">There are no programmes yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {list.map((p, i) => {
              const q = heads[i];
              const isHead = !!q?.data?.some((h) => h.id === userId);
              const others = (q?.data ?? []).filter((h) => h.id !== userId);
              return (
                <li key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <label className="flex items-start gap-3 min-w-0 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600"
                      checked={isHead}
                      disabled={!q?.data || toggle.isPending}
                      onChange={(e) => toggle.mutate({ programmeId: p.id, head: e.target.checked })}
                      aria-label={`Heads ${p.name}`}
                    />
                    <span className="min-w-0">
                      <span className="text-sm font-medium text-gray-800">
                        {p.name}
                        {!p.isActive && <span className="ml-1.5 text-[11px] text-gray-400">(inactive)</span>}
                      </span>
                      <span className="block text-xs text-gray-400">
                        {q?.isPending ? "Loading heads…" : q?.isError ? errorMessage(q.error) : others.length ? `Also headed by ${others.map((h) => `@${h.username}`).join(", ")}` : "No other head"}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
