"use client";

/** A saved report on live data: its rows (only those the viewer may see), export, edit, share and delete as allowed. */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Pencil, Share2, Trash2 } from "lucide-react";
import { saveFile } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { customReportsApi } from "@/lib/reports/custom-reports";
import { useDeleteReport, useReport, useReportRun } from "@/lib/queries/custom-reports";
import { formatDateTime } from "@/lib/format";
import { Alert, EmptyState, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { ConfirmDialog, btnDanger, btnPrimary, btnSecondary } from "@/app/admin/components/adminUi";
import ReportTable from "./ReportTable";
import ShareDialog from "./ShareDialog";

export default function ReportViewer({ id, base }: { id: string; base: string }) {
  const router = useRouter();
  const report = useReport(id);
  const [page, setPage] = useState(1);
  const run = useReportRun(id, page);
  const remove = useDeleteReport();
  const [sharing, setSharing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function exportAs(format: "csv" | "xlsx") {
    setExporting(format);
    setProblem(null);
    try {
      saveFile(await customReportsApi.export(id, format));
    } catch (err) {
      setProblem(isApiError(err) && err.code === "EXPORT_TOO_LARGE" ? "This report has more than 20 000 rows. Add a filter, then export again." : errorMessage(err));
    } finally {
      setExporting(null);
    }
  }

  const back = (
    <Link href={base} className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-[#00428C] hover:underline">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> All reports
    </Link>
  );
  if (report.isPending) return <>{back}<LoadingBlock /></>;
  if (report.isError) return <>{back}{isApiError(report.error) && report.error.status === 404 ? <EmptyState title="Report not found" description="It does not exist, was deleted, or is not shared with you." /> : <ErrorState error={report.error} onRetry={() => report.refetch()} />}</>;
  const r = report.data;

  return (
    <div data-testid="report-viewer">
      {back}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{r.name}</h1>
          {r.description && <p className="mt-1 text-sm text-gray-600">{r.description}</p>}
          <p className="mt-1 text-xs text-gray-500">Updated {formatDateTime(r.updatedAt)}{r.createdBy && ` · created by ${r.createdBy.firstName} ${r.createdBy.lastName}`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {r.myAccess.download && (
            <>
              <button type="button" className={btnSecondary} disabled={!!exporting} onClick={() => void exportAs("csv")} data-testid="export-csv"><Download className="h-3.5 w-3.5" aria-hidden="true" /> {exporting === "csv" ? "Exporting…" : "CSV"}</button>
              <button type="button" className={btnSecondary} disabled={!!exporting} onClick={() => void exportAs("xlsx")} data-testid="export-xlsx"><Download className="h-3.5 w-3.5" aria-hidden="true" /> {exporting === "xlsx" ? "Exporting…" : "Excel"}</button>
            </>
          )}
          {r.myAccess.edit && <Link href={`${base}/${id}/edit`} className={btnSecondary} data-testid="edit-report"><Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit</Link>}
          {r.myAccess.manage && <button type="button" className={btnPrimary} onClick={() => setSharing(true)} data-testid="share-report"><Share2 className="h-3.5 w-3.5" aria-hidden="true" /> Share</button>}
          {r.myAccess.manage && <button type="button" className={btnDanger} onClick={() => setDeleting(true)}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete</button>}
        </div>
      </div>
      {problem && <div className="mb-3"><Alert tone="error">{problem}</Alert></div>}
      {run.isPending ? <LoadingBlock /> : run.isError ? <ErrorState error={run.error} onRetry={() => run.refetch()} /> : <ReportTable data={run.data} page={page} onPage={setPage} busy={run.isFetching} />}
      {sharing && <ShareDialog reportId={id} onClose={() => setSharing(false)} />}
      {deleting && (
        <ConfirmDialog title="Delete this report?" body="It disappears for everyone it is shared with. Its history is kept." confirmLabel="Delete report" tone="danger"
          onClose={() => setDeleting(false)} onConfirm={async () => { await remove.mutateAsync(id); router.replace(base); }} />
      )}
    </div>
  );
}
