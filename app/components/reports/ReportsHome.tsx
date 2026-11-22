"use client";

/**
 * Custom reports in every staff portal: builders (reports.build) see every report and create new ones; everyone else
 * sees the reports shared with them, with what they may do on each. Also the pages for one report, new and edit.
 */
import Link from "next/link";
import { Plus } from "lucide-react";
import { hasFeature } from "@/lib/api/capabilities";
import { useSession } from "@/lib/auth/session";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { levelsText } from "@/lib/reports/custom-reports";
import { useReport, useReports } from "@/lib/queries/custom-reports";
import { EmptyState, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { btnPrimary } from "@/app/admin/components/adminUi";
import ReportBuilder from "./ReportBuilder";
import ReportViewer from "./ReportViewer";

const SOURCE_TEXT: Record<string, string> = { STUDENTS: "Students", COACHES: "Coaches", TEACHERS: "Teachers", USERS: "All users" };

function Frame({ title, description, action, children }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#E6EBF2] p-4 sm:p-6 md:p-10 text-gray-800">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-gray-600">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function useAccess() {
  const { can } = useSession();
  const on = hasFeature(useBackendCapabilities().detection, "customReports");
  return { on, builder: on && can("reports.build") };
}

export function ReportsList({ base }: { base: string }) {
  const { on, builder } = useAccess();
  const reports = useReports(on);
  return (
    <Frame
      title={builder ? "Custom reports" : "Shared reports"}
      description={builder ? "Build reports on live data, save them, export them and share them with people or roles." : "Reports an administrator shared with you. Each shows only the rows you are allowed to see."}
      action={builder ? <Link href={`${base}/new`} className={btnPrimary} data-testid="new-report"><Plus className="h-4 w-4" aria-hidden="true" /> New report</Link> : undefined}
    >
      {!on ? (
        <EmptyState title="Custom reports are not available yet" />
      ) : reports.isPending ? (
        <LoadingBlock />
      ) : reports.isError ? (
        <ErrorState error={reports.error} onRetry={() => reports.refetch()} />
      ) : reports.data.length === 0 ? (
        <EmptyState title="No report yet" description={builder ? "Create one, or start from an example." : "No report has been shared with you."} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="reports-list">
          {reports.data.map((r) => (
            <li key={r.id}>
              <Link href={`${base}/${r.id}`} className="block h-full rounded-2xl border border-gray-100 bg-white p-5 shadow-sm hover:border-[#00428C]">
                <p className="font-bold text-gray-900">{r.name}</p>
                {r.description && <p className="mt-1 line-clamp-2 text-xs text-gray-600">{r.description}</p>}
                <p className="mt-3 text-[11px] text-gray-500">{SOURCE_TEXT[r.source] ?? r.source} · {r.columns.length} column{r.columns.length === 1 ? "" : "s"} · {r.myAccess.manage ? "Owner" : levelsText({ canView: r.myAccess.view, canDownload: r.myAccess.download, canEdit: r.myAccess.edit })}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

export function NewReport({ base }: { base: string }) {
  const { builder } = useAccess();
  return (
    <Frame title="New report">
      {builder ? <ReportBuilder base={base} builder /> : <EmptyState title="You cannot build reports" description="Only report builders create reports." />}
    </Frame>
  );
}

export function EditReport({ id, base }: { id: string; base: string }) {
  const { builder } = useAccess();
  const report = useReport(id);
  return (
    <Frame title="Edit report">
      {report.isPending ? <LoadingBlock /> : report.isError ? <ErrorState error={report.error} onRetry={() => report.refetch()} />
        : !report.data.myAccess.edit ? <EmptyState title="You cannot edit this report" />
          : <ReportBuilder report={report.data} base={base} builder={builder} />}
    </Frame>
  );
}

export function ViewReport({ id, base }: { id: string; base: string }) {
  return (
    <div className="min-h-screen bg-[#E6EBF2] p-4 sm:p-6 md:p-10 text-gray-800">
      <ReportViewer id={id} base={base} />
    </div>
  );
}
