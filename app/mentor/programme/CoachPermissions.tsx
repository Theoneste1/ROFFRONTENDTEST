"use client";

/**
 * Head Coach: what each coach of the programme may do across it (owner 2026-11-23) — students, courses, marking, published
 * results, all on by default at every level. Choose a coach, then turn a part off (with a reason) or back on.
 */
import { useState } from "react";
import { personName } from "@/lib/format";
import { useProgrammeMembers } from "@/lib/queries/programmes";
import CoachAccessPanel from "@/app/components/coaches/CoachAccessPanel";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { SelectFilter } from "@/app/admin/components/adminUi";

export default function CoachPermissions({ programmeId }: { programmeId: string }) {
  const coaches = useProgrammeMembers(programmeId, { role: "MENTOR", limit: 100 });
  const [coachId, setCoachId] = useState("");
  if (coaches.isPending) return <LoadingBlock />;
  if (coaches.isError) return <ErrorState error={coaches.error} title="Couldn't load the programme's coaches" onRetry={() => coaches.refetch()} />;
  const rows = coaches.data.data;
  if (rows.length === 0) return <p className="text-sm text-gray-600">This programme has no coach yet.</p>;
  const chosen = rows.find((r) => r.id === coachId) ?? rows[0];
  return (
    <div className="space-y-4" data-testid="coach-permissions">
      <SelectFilter label="Coach" value={chosen.id} onChange={setCoachId} options={rows.map((r) => ({ label: personName(r), value: r.id }))} />
      <CoachAccessPanel key={chosen.id} coachId={chosen.id} programmeId={programmeId} />
    </div>
  );
}
