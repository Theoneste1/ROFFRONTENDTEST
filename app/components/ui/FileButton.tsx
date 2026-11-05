"use client";

import { useState } from "react";
import { Download, Eye, FileText } from "lucide-react";
import { openFile, saveFile, type DownloadedFile } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatFileSize } from "@/lib/format";
import type { FileRef } from "@/lib/api/types";
import { Spinner } from "./feedback";

const VIEWABLE = /^(application\/pdf|image\/)/;

/**
 * A protected file: fetched with the bearer token, then opened (PDF, images)
 * or saved. A plain <a href> cannot authenticate, so this is a button.
 */
export default function FileButton({ file, fetchFile }: { file: FileRef; fetchFile: () => Promise<DownloadedFile> }) {
  const [busy, setBusy] = useState<"view" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const viewable = VIEWABLE.test(file.mimeType);

  async function run(mode: "view" | "save") {
    if (busy) return;
    setBusy(mode);
    setError(null);
    try {
      const downloaded = await fetchFile();
      if (mode === "view") openFile(downloaded);
      else saveFile({ ...downloaded, filename: downloaded.filename || file.originalName });
    } catch (e) {
      setError(errorMessage(e, "Couldn't open this file."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
      <div className="flex items-center gap-3">
        <FileText className="h-5 w-5 text-indigo-600 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-gray-900 truncate" title={file.originalName}>
            {file.originalName}
          </p>
          <p className="text-[11px] text-gray-400">{formatFileSize(file.size)}</p>
        </div>
        {viewable && (
          <button
            type="button"
            onClick={() => run("view")}
            disabled={!!busy}
            className="p-1.5 rounded-lg text-gray-500 hover:text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
            aria-label={`Open ${file.originalName}`}
            title="Open"
          >
            {busy === "view" ? <Spinner className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
        <button
          type="button"
          onClick={() => run("save")}
          disabled={!!busy}
          className="p-1.5 rounded-lg text-gray-500 hover:text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
          aria-label={`Download ${file.originalName}`}
          title="Download"
        >
          {busy === "save" ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        </button>
      </div>
      {error && <p className="mt-1.5 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
