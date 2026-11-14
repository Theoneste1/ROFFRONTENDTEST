"use client";

/**
 * /admin/schools/import: import schools from the template (`POST /admin/schools/import`).
 * 1. download the template; 2. choose a file and check it (dry run: nothing is created);
 * 3. review the per-row results (errors block the import; possible duplicates need confirming
 * with the dry run's review token); 4. import — all rows or none. An import only creates
 * schools: existing schools are never changed. Shown only in the directory's "manage" mode.
 */
import { useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, FileUp } from "lucide-react";
import { adminSchoolsApi, type SchoolImportDone, type SchoolImportDryRun } from "@/lib/api/school-directory";
import { errorMessage } from "@/lib/api/errors";
import {
  IMPORT_COLUMNS,
  IMPORT_MAX_ROWS,
  importDoneSummary,
  importFileProblem,
  importQuery,
  importReadiness,
  interpretImportError,
  previewFromDryRun,
  type ImportPreview,
} from "@/lib/admin/school-import";
import { invalidateAfterSchoolChange, useSchoolDirectoryMode } from "@/lib/queries/school-directory";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Alert, LoadingBlock, Spinner } from "@/app/components/ui/feedback";
import { AdminPage, Badge, Card, MetricCard, Notice, TableCard, TableMessage, btnPrimary, btnSecondary, linkBtn, td, th } from "../../components/adminUi";

const back = (
  <Link href="/admin/schools" className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 mb-4">
    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> All schools
  </Link>
);

export default function SchoolImport() {
  const mode = useSchoolDirectoryMode();
  if (mode === "loading") return <AdminPage title="Import schools"><LoadingBlock /></AdminPage>;
  if (mode !== "manage") {
    return (
      <AdminPage title="Import schools">
        {back}
        <Notice tone="info">Importing schools needs the school directory (schools.manage) on a backend that supports it.</Notice>
      </AdminPage>
    );
  }
  return <ImportWorkflow />;
}

function ImportWorkflow() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [done, setDone] = useState<SchoolImportDone | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const dryRun = useMutation({
    mutationFn: (f: File) => adminSchoolsApi.importSchools(f, { dryRun: true }) as Promise<SchoolImportDryRun>,
    onSuccess: (r) => {
      setPreview(previewFromDryRun(r));
      setConfirmed(false);
      setMessage(null);
    },
    onError: (err) => {
      const refusal = interpretImportError(err);
      setPreview(refusal.preview);
      setMessage({ tone: "error", text: refusal.message });
    },
  });
  const run = useMutation({
    mutationFn: ({ f, p }: { f: File; p: ImportPreview }) => adminSchoolsApi.importSchools(f, importQuery(p, confirmed)) as Promise<SchoolImportDone>,
    onSuccess: (r) => {
      setDone(r);
      setPreview(null);
      setMessage(null);
      void invalidateAfterSchoolChange(qc);
    },
    onError: (err, { p }) => {
      const refusal = interpretImportError(err, p.totalRows);
      if (refusal.preview) setPreview(refusal.preview);
      setConfirmed(false);
      setMessage({ tone: "error", text: refusal.message });
    },
  });
  const busy = dryRun.isPending || run.isPending;

  function choose(f: File | null) {
    setFile(f);
    setPreview(null);
    setConfirmed(false);
    setMessage(null);
    setDone(null);
    setFileError(f ? importFileProblem(f) : null);
  }
  function check() {
    const p = importFileProblem(file);
    setFileError(p);
    if (p || !file || busy) return;
    dryRun.mutate(file);
  }
  async function template(format: "csv" | "xlsx") {
    setTemplateError(null);
    try {
      await adminSchoolsApi.downloadImportTemplate(format);
    } catch (e) {
      setTemplateError(errorMessage(e, "Couldn't download the template."));
    }
  }

  const readiness = importReadiness(preview, confirmed);

  return (
    <AdminPage
      title="Import schools"
      description="Create schools from a file. Every row must be valid or nothing is imported; existing schools are never changed."
    >
      {back}
      <Card>
        <div className="p-5 space-y-3 text-sm" data-testid="import-template">
          <h2 className="text-sm font-bold text-gray-800">1. Download the template</h2>
          <p className="text-xs text-gray-600">
            Columns: <code className="text-[11px]">{IMPORT_COLUMNS.join(", ")}</code>. At most {formatNumber(IMPORT_MAX_ROWS)} schools and 1 MB per file. Schools in Rwanda need
            province, district and sector exactly as in the official directory; elsewhere a location.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} onClick={() => template("csv")}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" /> CSV template
            </button>
            <button type="button" className={btnSecondary} onClick={() => template("xlsx")}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" /> Excel template (with instructions)
            </button>
          </div>
          {templateError && <Alert tone="error">{templateError}</Alert>}
        </div>
      </Card>

      <div className="h-4" />
      <Card>
        <div className="p-5 space-y-3" data-testid="import-upload">
          <h2 className="text-sm font-bold text-gray-800">2. Check the file (dry run)</h2>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-label="School import file"
              data-testid="import-file"
              onChange={(e) => choose(e.target.files?.[0] ?? null)}
              className="text-xs"
            />
            <button type="button" className={btnPrimary} onClick={check} disabled={!file || busy} data-testid="import-dry-run">
              {dryRun.isPending ? <Spinner className="h-3.5 w-3.5 !text-white" /> : <FileUp className="h-3.5 w-3.5" aria-hidden="true" />}
              Check file
            </button>
          </div>
          {fileError && <p className="text-xs text-red-600">{fileError}</p>}
          <p className="text-[11px] text-gray-500">A check creates nothing. It lists every row with an error and every row that may duplicate an existing school.</p>
        </div>
      </Card>

      {message && (
        <div className="mt-4">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}

      {done && (
        <div className="mt-4 space-y-3" data-testid="import-done">
          <Notice onClose={() => setDone(null)}>{importDoneSummary(done)}</Notice>
          <TableCard>
            <thead>
              <tr className="border-b border-gray-100">
                <th className={th}>Row</th>
                <th className={th}>School</th>
                <th className={th}>Code</th>
                <th className={th}>
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/80">
              {done.schools.map((s) => (
                <tr key={s.id} className="text-xs">
                  <td className={td}>{s.row}</td>
                  <td className={`${td} font-semibold text-gray-800`}>{s.name}</td>
                  <td className={td}>{s.code ?? "—"}</td>
                  <td className={td}>
                    <Link href={`/admin/schools/${s.id}`} className={linkBtn}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableCard>
        </div>
      )}

      {preview && <PreviewSection preview={preview} confirmed={confirmed} setConfirmed={setConfirmed} />}

      {preview && (
        <Card>
          <div className="p-5 mt-4 space-y-3" data-testid="import-confirm">
            <h2 className="text-sm font-bold text-gray-800">3. Import</h2>
            {readiness.reason && <p className="text-xs text-gray-600">{readiness.reason}</p>}
            <button
              type="button"
              className={btnPrimary}
              disabled={!readiness.ready || busy || !file}
              onClick={() => file && preview && run.mutate({ f: file, p: preview })}
              data-testid="import-run"
            >
              {run.isPending && <Spinner className="h-3.5 w-3.5 !text-white" />}
              Import {formatNumber(preview.totalRows)} school{preview.totalRows === 1 ? "" : "s"}
            </button>
          </div>
        </Card>
      )}
    </AdminPage>
  );
}

function PreviewSection({ preview, confirmed, setConfirmed }: { preview: ImportPreview; confirmed: boolean; setConfirmed: (v: boolean) => void }) {
  return (
    <div className="mt-4 space-y-4" data-testid="import-preview">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Rows" value={formatNumber(preview.totalRows)} />
        <MetricCard label="Valid" value={formatNumber(preview.valid)} />
        <MetricCard label="Errors" value={formatNumber(preview.failed)} subtext={preview.failed ? "nothing is imported" : undefined} />
        <MetricCard label="Possible duplicates" value={formatNumber(preview.possibleDuplicateRows)} subtext={preview.possibleDuplicateRows ? "need confirming" : undefined} />
      </div>
      {preview.rows.length === 0 ? (
        <Notice tone="info">Every row is valid and none looks like an existing school.</Notice>
      ) : (
        <TableCard>
          <thead>
            <tr className="border-b border-gray-100">
              <th className={th}>Row</th>
              <th className={th}>Result</th>
              <th className={th}>Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/80" data-testid="import-rows">
            {preview.rows.length === 0 ? (
              <TableMessage colSpan={3}>Nothing to review.</TableMessage>
            ) : (
              preview.rows.map((r) => (
                <tr key={`${r.row}-${r.status}`} className="text-xs align-top">
                  <td className={td}>{r.row}</td>
                  <td className={td}>
                    <Badge className={r.status === "error" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}>
                      {r.status === "error" ? "Error" : "Possible duplicate"}
                    </Badge>
                  </td>
                  <td className={td}>
                    {r.name && <p className="font-semibold text-gray-800">{r.name}</p>}
                    <ul className="text-gray-600 space-y-0.5">
                      {r.messages.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                    {r.candidates.length > 0 && (
                      <ul className="mt-1 text-gray-500 list-disc pl-4">
                        {r.candidates.map((c) => (
                          <li key={c.id}>
                            <Link href={`/admin/schools/${c.id}`} className={linkBtn} target="_blank">
                              {c.name}
                            </Link>
                            {c.code ? ` (${c.code})` : ""} · {c.district ?? c.countryCode}
                            {c.isActive ? "" : " · inactive"}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableCard>
      )}
      {preview.possibleDuplicateRows > 0 && preview.failed === 0 && (
        <label className="flex items-start gap-2 text-xs text-gray-700" data-testid="import-confirm-duplicates">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
          <span>
            I reviewed the possible duplicates: these rows are different schools and should be created.
            {preview.reviewExpiresAt && <span className="text-gray-500"> (Review valid until {formatDateTime(preview.reviewExpiresAt)}.)</span>}
          </span>
        </label>
      )}
    </div>
  );
}
