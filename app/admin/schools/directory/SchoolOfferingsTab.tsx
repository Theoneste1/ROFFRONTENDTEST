"use client";

/**
 * The school's education levels and programmes (`/admin/schools/:id/offerings`, schools.manage),
 * edited against the reference data (`/admin/schools/reference-data`). Programmes that still need
 * review are marked and never presented as verified offerings.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminSchoolsApi, type SchoolOfferings } from "@/lib/api/school-directory";
import { REASON, contactsErrorMessage, draftFromOfferings, offeringsPayload, offeringsProblem, reasonProblem, type OfferingsDraft } from "@/lib/admin/school-contacts";
import { useSchoolOfferings, useSchoolReferenceData } from "@/lib/queries/school-directory";
import { queryKeys } from "@/lib/query/keys";
import { Alert, ErrorState, LoadingBlock, Spinner } from "@/app/components/ui/feedback";
import { Badge, Card, Modal, Notice, btnPrimary, btnSecondary } from "../../components/adminUi";

const CATEGORY_LABEL: Record<string, string> = { A_LEVEL_COMBINATION: "A-level combinations", TVET_TRADE: "TVET trades", OTHER: "Other programmes" };

export default function SchoolOfferingsTab({ schoolId }: { schoolId: string }) {
  const offerings = useSchoolOfferings(schoolId);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const qc = useQueryClient();
  if (offerings.isPending) return <LoadingBlock />;
  if (offerings.isError) return <ErrorState error={offerings.error} title="Couldn't load the offerings" onRetry={() => offerings.refetch()} />;
  const o = offerings.data;
  return (
    <div className="space-y-3" data-testid="school-offerings">
      {notice && <Notice onClose={() => setNotice(null)}>{notice}</Notice>}
      <div className="flex justify-end">
        <button type="button" className={btnSecondary} onClick={() => setEditing(true)}>
          Edit offerings
        </button>
      </div>
      <Card>
        <div className="p-5 text-xs space-y-3">
          <div>
            <h2 className="text-sm font-bold text-gray-800 mb-1">Education levels</h2>
            {o.levels.length ? (
              <p className="text-gray-700">{o.levels.map((l) => `${l.name}${l.qualifier ? ` (${l.qualifier})` : ""}`).join(" · ")}</p>
            ) : (
              <p className="text-gray-600">None recorded.</p>
            )}
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-800 mb-1">Programmes</h2>
            {o.programmes.length ? (
              <ul className="space-y-0.5">
                {o.programmes.map((p) => (
                  <li key={p.id} className="text-gray-700">
                    {p.name}
                    {p.code ? ` (${p.code})` : ""} <span className="text-gray-500">· {CATEGORY_LABEL[p.category] ?? p.category}</span>
                    {p.needsReview && <Badge className="ml-1 bg-amber-50 text-amber-700">Needs review</Badge>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-600">None recorded.</p>
            )}
          </div>
        </div>
      </Card>
      {editing && (
        <OfferingsDialog
          schoolId={schoolId}
          offerings={o}
          onClose={() => setEditing(false)}
          onSaved={(changed) => {
            setEditing(false);
            setNotice(changed ? "The offerings were saved." : "Nothing changed.");
            void qc.invalidateQueries({ queryKey: queryKeys.schoolDirectory.offerings(schoolId) });
          }}
        />
      )}
    </div>
  );
}

function OfferingsDialog({ schoolId, offerings, onClose, onSaved }: { schoolId: string; offerings: SchoolOfferings; onClose: () => void; onSaved: (changed: boolean) => void }) {
  const ref = useSchoolReferenceData();
  const [draft, setDraft] = useState<OfferingsDraft>(() => draftFromOfferings(offerings));
  const [reason, setReason] = useState("");
  const levelOrder = (ref.data?.educationLevels ?? []).map((l) => l.code);
  const save = useMutation({ mutationFn: () => adminSchoolsApi.putOfferings(schoolId, offeringsPayload(draft, levelOrder, reason)), onSuccess: (r) => onSaved(r.changed) });
  const problem = offeringsProblem(draft) ?? reasonProblem(reason);
  return (
    <Modal wide title="Edit offerings" onClose={() => !save.isPending && onClose()}>
      {ref.isPending ? (
        <LoadingBlock />
      ) : ref.isError ? (
        <ErrorState error={ref.error} title="Couldn't load the reference data" onRetry={() => ref.refetch()} />
      ) : (
        <div className="space-y-3 text-xs">
          <fieldset>
            <legend className="font-semibold text-gray-600 mb-1">Education levels</legend>
            <div className="grid grid-cols-2 gap-1">
              {ref.data.educationLevels.map((l) => {
                const on = l.code in draft.levels;
                return (
                  <label key={l.code} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) =>
                        setDraft((d) => {
                          const levels = { ...d.levels };
                          if (e.target.checked) levels[l.code] = "";
                          else delete levels[l.code];
                          return { ...d, levels };
                        })
                      }
                    />
                    {l.name}
                    {on && (
                      <input
                        aria-label={`${l.name} qualifier`}
                        value={draft.levels[l.code]}
                        maxLength={20}
                        placeholder="variant"
                        onChange={(e) => setDraft((d) => ({ ...d, levels: { ...d.levels, [l.code]: e.target.value } }))}
                        className="w-20 border border-gray-200 rounded px-1 py-0.5"
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <fieldset>
            <legend className="font-semibold text-gray-600 mb-1">Programmes</legend>
            <div className="max-h-56 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1 border border-gray-100 rounded-lg p-2">
              {ref.data.programmes.map((p) => (
                <label key={p.id} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={draft.programmeIds.includes(p.id)}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, programmeIds: e.target.checked ? [...d.programmeIds, p.id] : d.programmeIds.filter((x) => x !== p.id) }))
                    }
                  />
                  {p.name}
                  {p.needsReview && <span className="text-amber-700">(needs review)</span>}
                </label>
              ))}
              {ref.data.programmes.length === 0 && <p className="text-gray-600">No programmes in the reference data.</p>}
            </div>
          </fieldset>
          <label className="block">
            <span className="block font-semibold text-gray-600 mb-1">Reason (optional)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={REASON.max} className="w-full border border-gray-200 rounded-lg px-2 py-1.5" />
          </label>
          {problem && <p className="text-red-600">{problem}</p>}
          {save.isError && <Alert tone="error">{contactsErrorMessage(save.error)}</Alert>}
          <div className="flex justify-end gap-3">
            <button type="button" className={btnSecondary} onClick={onClose} disabled={save.isPending}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} onClick={() => !problem && save.mutate()} disabled={save.isPending || !!problem}>
              {save.isPending && <Spinner className="h-3.5 w-3.5 !text-white" />} Save offerings
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
