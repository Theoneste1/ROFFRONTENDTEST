"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { useAdminSubmissions, usePublishAll, useResultReleases } from "@/lib/queries/admin";
import { formatDateTime } from "@/lib/format";
import { ConfirmDialog, Notice, btnPrimary } from "../../components/adminUi";

/** Publish every approved result of the assignment in one release, and the release history. */
export default function PublishPanel({ assignmentId }: { assignmentId: string }) {
  const approved = useAdminSubmissions({ assignmentId, status: "APPROVED", limit: 1 });
  const releases = useResultReleases(assignmentId);
  const publish = usePublishAll(assignmentId);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const count = approved.data?.meta.total ?? 0;

  return (
    <div className="mb-6">
      {notice && <Notice onClose={() => setNotice(null)}>{notice}</Notice>}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-gray-900">Publication</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {count > 0 ? `${count} approved result${count === 1 ? " is" : "s are"} ready to publish. Students are notified and their points update.` : "No approved results are waiting to be published."}
          </p>
          {releases.data && releases.data.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[11px] text-gray-400">
              {releases.data.slice(0, 5).map((r) => (
                <li key={r.id}>
                  {formatDateTime(r.publishedAt)} · {r.resultCount} result{r.resultCount === 1 ? "" : "s"} · by @{r.publishedBy?.username ?? "—"}
                  {r.note && ` — ${r.note}`}
                </li>
              ))}
            </ul>
          )}
        </div>
        {count > 0 && (
          <button type="button" onClick={() => setConfirm(true)} className={btnPrimary}>
            <Send className="h-3.5 w-3.5" aria-hidden="true" /> Publish {count} result{count === 1 ? "" : "s"}
          </button>
        )}
      </div>
      {confirm && (
        <ConfirmDialog
          title={`Publish ${count} result${count === 1 ? "" : "s"}?`}
          body="Every approved result of this assignment is released to its student now (score, feedback and files). Results still with mentors or awaiting approval stay unpublished."
          confirmLabel="Publish results"
          note={{ label: "Release note (internal)", required: false, min: 1, max: 1000 }}
          onClose={() => setConfirm(false)}
          onConfirm={async (note) => {
            const r = await publish.mutateAsync(note || undefined);
            const left = Object.values(r.notYetPublished).reduce((n, v) => n + (v ?? 0), 0);
            setNotice(`${r.published} result${r.published === 1 ? "" : "s"} published.${left ? ` ${left} submission${left === 1 ? " is" : "s are"} not yet ready.` : ""}`);
          }}
        />
      )}
    </div>
  );
}
