"use client";

/**
 * /admin/schools/sync: upload an official-directory export as a dry run (nothing is written to
 * the directory; the comparison is staged for 24 hours) and list the runs. Needs the
 * `schoolDirectorySync` capability and schools.manage; approving and applying a run is on the
 * run's page, for Super Admins only.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileUp } from "lucide-react";
import { SYNC_DATASETS, schoolSyncApi, type SyncDatasetKey } from "@/lib/api/school-sync";
import { RUN_STATUS_LABEL, labelProblem, outcomeLines, OUTCOME_LABEL, syncErrorMessage, syncFileProblem } from "@/lib/admin/school-sync";
import { invalidateSyncRun, useSyncAccess, useSyncRuns } from "@/lib/queries/school-directory";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Alert, ErrorState, LoadingBlock, Spinner } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { BackLink, STATUS_BADGE } from "./shared";
import { AdminPage, Badge, Card, Notice, TableCard, TableMessage, btnPrimary, linkBtn, td, th } from "../../components/adminUi";

export default function SyncRuns() {
  const access = useSyncAccess();
  if (access.loading) return <AdminPage title="Directory sync"><LoadingBlock /></AdminPage>;
  if (!access.visible) {
    return (
      <AdminPage title="Directory sync">
        <BackLink href="/admin/schools" label="All schools" />
        <Notice tone="info">The official-directory sync needs schools.manage on a backend that supports it.</Notice>
      </AdminPage>
    );
  }
  return <RunsPage canApprove={access.canApprove} />;
}

function RunsPage({ canApprove }: { canApprove: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const runs = useSyncRuns(page);
  const [file, setFile] = useState<File | null>(null);
  const [dataset, setDataset] = useState<SyncDatasetKey>(SYNC_DATASETS[0].key);
  const [label, setLabel] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => schoolSyncApi.createRun(file!, dataset, label.trim() || undefined),
    onSuccess: (run) => {
      void invalidateSyncRun(qc);
      router.push(`/admin/schools/sync/${run.id}`);
    },
  });

  function submit() {
    const p = syncFileProblem(file) ?? labelProblem(label);
    setProblem(p);
    if (p || create.isPending) return;
    create.mutate();
  }

  return (
    <AdminPage
      title="Directory sync"
      description="Compare an official directory export with the school directory. A run is always a dry run: it changes nothing until it is reviewed, approved and applied."
    >
      <BackLink href="/admin/schools" label="All schools" />
      <Card>
        <div className="p-5 space-y-3" data-testid="sync-upload">
          <h2 className="text-sm font-bold text-gray-800">New dry run</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-gray-600">
              <span className="block font-semibold mb-1">Dataset</span>
              <select value={dataset} onChange={(e) => setDataset(e.target.value as SyncDatasetKey)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs">
                {SYNC_DATASETS.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-600">
              <span className="block font-semibold mb-1">Export (.xlsx or .csv)</span>
              <input type="file" accept=".xlsx,.csv" data-testid="sync-file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-xs" />
            </label>
            <label className="text-xs text-gray-600">
              <span className="block font-semibold mb-1">Label (optional)</span>
              <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={200} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-56" />
            </label>
            <button type="button" className={btnPrimary} onClick={submit} disabled={create.isPending} data-testid="sync-start">
              {create.isPending ? <Spinner className="h-3.5 w-3.5 !text-white" /> : <FileUp className="h-3.5 w-3.5" aria-hidden="true" />}
              Start dry run
            </button>
          </div>
          {problem && <p className="text-xs text-red-600">{problem}</p>}
          {create.isError && <Alert tone="error">{syncErrorMessage(create.error)}</Alert>}
          <p className="text-[11px] text-gray-600">
            At most 10 MB / 10,000 rows. Contact values are never shown in full here or in the report.
            {canApprove ? " As a Super Admin you can approve and apply a reviewed run." : " A Super Admin approves and applies a reviewed run."}
          </p>
        </div>
      </Card>

      <div className="h-4" />
      {runs.isError ? (
        <ErrorState error={runs.error} title="Couldn't load the runs" onRetry={() => runs.refetch()} />
      ) : (
        <TableCard
          footer={
            runs.data && (
              <div className="px-4 pb-4">
                <Pagination page={page} totalPages={runs.data.meta.totalPages} total={runs.data.meta.total} onPage={setPage} disabled={runs.isFetching} />
              </div>
            )
          }
        >
          <thead>
            <tr className="border-b border-gray-100">
              <th className={th}>Run</th>
              <th className={th}>Status</th>
              <th className={th}>Rows</th>
              <th className={th}>Outcomes</th>
              <th className={th}>Uploaded</th>
              <th className={th}>
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/80" data-testid="sync-runs">
            {runs.isPending ? (
              <TableMessage colSpan={6}>Loading runs…</TableMessage>
            ) : runs.data.data.length === 0 ? (
              <TableMessage colSpan={6}>No sync runs yet.</TableMessage>
            ) : (
              runs.data.data.map((r) => (
                <tr key={r.id} className="text-xs">
                  <td className={`${td} font-semibold text-gray-800`}>
                    {r.datasetLabel}
                    <span className="block text-[11px] font-normal text-gray-500">{r.fileName}</span>
                  </td>
                  <td className={td}>
                    <Badge className={STATUS_BADGE[r.expired ? "EXPIRED" : r.status]}>{r.expired ? "Expired" : RUN_STATUS_LABEL[r.status]}</Badge>
                  </td>
                  <td className={td}>{formatNumber(r.rowCount)}</td>
                  <td className={`${td} text-gray-600`}>
                    {outcomeLines(r.counts?.outcomes).map(([k, n]) => `${OUTCOME_LABEL[k]} ${formatNumber(n)}`).join(" · ") || "—"}
                  </td>
                  <td className={`${td} text-gray-600 whitespace-nowrap`}>
                    {formatDateTime(r.createdAt)}
                    {r.createdBy ? ` · @${r.createdBy.username}` : ""}
                  </td>
                  <td className={td}>
                    <Link href={`/admin/schools/sync/${r.id}`} className={linkBtn}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableCard>
      )}
    </AdminPage>
  );
}
