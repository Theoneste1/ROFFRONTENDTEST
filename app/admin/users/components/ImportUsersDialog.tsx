"use client";

import { useState } from "react";
import { FileUp } from "lucide-react";
import { USER_RULES } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/errors";
import type { UserImportResult } from "@/lib/api/types";
import { useImportUsers } from "@/lib/queries/admin";
import { Alert, Spinner } from "@/app/components/ui/feedback";
import { Modal, btnPrimary, btnSecondary } from "../../components/adminUi";

const HEADER = "firstName,lastName,email,role,gradeLevel,schoolName,schoolLocation,homeLocation,username";

/**
 * Bulk invitation from a CSV file (`POST /admin/users/import`). The file is
 * always checked first with `?dryRun=true` (nothing is created); the import
 * button is offered only after a check with at least one valid row.
 */
export default function ImportUsersDialog({ onClose, onImported }: { onClose: () => void; onImported: (created: number) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [checked, setChecked] = useState<UserImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importUsers = useImportUsers();
  const busy = importUsers.isPending;

  function pick(f: File | null) {
    setChecked(null);
    setError(null);
    if (f && !/\.csv$/i.test(f.name)) return setError("Choose a .csv file.");
    if (f && f.size > USER_RULES.importMaxBytes) return setError("The file is larger than 1 MB.");
    setFile(f);
  }

  async function run(dryRun: boolean) {
    if (!file) return;
    setError(null);
    try {
      const r = await importUsers.mutateAsync({ file, dryRun });
      if (dryRun) setChecked(r);
      else {
        onImported(r.created);
        onClose();
      }
    } catch (e) {
      setError(errorMessage(e, "The file could not be processed."));
    }
  }

  return (
    <Modal wide title="Import users from CSV" onClose={busy ? () => undefined : onClose}>
      <div className="space-y-4 text-sm">
        <p className="text-xs text-gray-500">
          UTF-8 CSV, up to 1 MB and {USER_RULES.importMaxRows.toLocaleString()} rows. Every valid row receives an invitation e-mail. Header (first three columns required):
        </p>
        <code className="block text-[11px] bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 break-all">{HEADER}</code>
        <label className="flex items-center gap-3 border border-dashed border-gray-300 rounded-xl px-4 py-3 cursor-pointer hover:bg-gray-50">
          <FileUp className="h-5 w-5 text-indigo-600 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate text-xs">{file ? file.name : "Choose a CSV file…"}</span>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
        </label>

        {checked && (
          <div className="space-y-2" aria-live="polite">
            <Alert tone={checked.failed ? "info" : "success"}>
              Checked {checked.totalRows} row{checked.totalRows === 1 ? "" : "s"}: {checked.valid} valid, {checked.failed} with errors. Nothing has been created yet.
            </Alert>
            {checked.errors.length > 0 && (
              <div className="max-h-48 overflow-y-auto border border-red-100 rounded-lg">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-left text-gray-400 uppercase">
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">E-mail</th>
                      <th className="px-3 py-2">Problem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-50">
                    {checked.errors.map((e) => (
                      <tr key={`${e.row}-${e.email}`}>
                        <td className="px-3 py-1.5">{e.row}</td>
                        <td className="px-3 py-1.5 break-all">{e.email || "—"}</td>
                        <td className="px-3 py-1.5 text-red-700">{e.errors.join("; ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {error && <Alert tone="error">{error}</Alert>}

        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="px-5 py-2 text-sm text-gray-600 disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={() => run(true)} disabled={!file || busy} className={btnSecondary}>
            {busy && importUsers.variables?.dryRun && <Spinner className="h-3.5 w-3.5" />}
            Check file
          </button>
          <button type="button" onClick={() => run(false)} disabled={!file || busy || !checked || checked.valid === 0} className={btnPrimary}>
            {busy && importUsers.variables?.dryRun === false && <Spinner className="h-3.5 w-3.5 !text-white" />}
            Invite {checked?.valid ?? 0} user{checked?.valid === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
