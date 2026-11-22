"use client";

/** The rows of a report (preview or run): a scrolling table with its own pagination. */
import type { FieldType, ReportPage } from "@/lib/reports/custom-reports";
import { cellText } from "@/lib/reports/custom-reports";
import Pagination from "@/app/components/ui/Pagination";

export default function ReportTable({ data, types, page, onPage, busy }: { data: ReportPage; types?: Record<string, FieldType>; page: number; onPage: (p: number) => void; busy?: boolean }) {
  return (
    <div data-testid="report-table">
      <p className="mb-2 text-xs text-gray-600">{data.meta.total.toLocaleString("en")} row{data.meta.total === 1 ? "" : "s"}</p>
      <div className={`overflow-x-auto rounded-xl border border-gray-200 bg-white ${busy ? "opacity-60" : ""}`}>
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50">
            <tr>
              {data.columns.map((c) => (
                <th key={c.key} scope="col" className="whitespace-nowrap px-3 py-2 font-bold uppercase tracking-wider text-gray-600">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.rows.length === 0 ? (
              <tr><td colSpan={data.columns.length} className="px-3 py-6 text-center text-gray-600">No row matches.</td></tr>
            ) : (
              data.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td key={j} className="px-3 py-2 text-gray-800">{cellText(v, types?.[data.columns[j].key])}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {data.meta.totalPages > 1 && <div className="mt-3"><Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={onPage} disabled={busy} /></div>}
    </div>
  );
}
