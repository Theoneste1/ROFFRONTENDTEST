"use client";

import { useRef, useState, type DragEvent } from "react";
import { FileText, UploadCloud, X } from "lucide-react";
import { formatFileSize, hasAcceptedExtension } from "@/lib/format";

export interface FileRules {
  maxFiles: number;
  maxFileBytes: number;
  accept: string;
  label: string;
}

/**
 * Drag-and-drop / click-to-browse file picker (style of the original upload
 * zones). Checks count and size before anything is sent; the backend checks
 * the real file type from its contents.
 */
export default function FilePicker({
  files,
  onChange,
  rules,
  existingCount = 0,
  title = "Drag and drop files here, or click to browse",
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  rules: FileRules;
  /** Files already stored (count towards the limit). */
  existingCount?: number;
  title?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function add(list: FileList | null) {
    if (!list || disabled) return;
    setError(null);
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!hasAcceptedExtension(f.name, rules.accept)) {
        setError(`"${f.name}" is not an accepted file type (${rules.label}).`);
        continue;
      }
      if (f.size > rules.maxFileBytes) {
        setError(`"${f.name}" is larger than ${formatFileSize(rules.maxFileBytes)}.`);
        continue;
      }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      next.push(f);
    }
    const room = rules.maxFiles - existingCount;
    if (next.length > room) {
      setError(`You can attach up to ${rules.maxFiles} files.`);
      next.length = Math.max(room, 0);
    }
    onChange(next);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    add(e.dataTransfer.files);
  }

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`block bg-white border-2 border-dashed rounded-2xl p-8 text-center shadow-sm transition ${
          disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
        } ${dragging ? "border-blue-400 bg-blue-50/50" : "border-slate-200 hover:border-blue-300"}`}
      >
        <input ref={inputRef} type="file" multiple accept={rules.accept} className="sr-only" disabled={disabled} onChange={(e) => add(e.target.files)} />
        <UploadCloud className="w-10 h-10 text-slate-400 mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-700 mb-1">{title}</p>
        <p className="text-xs text-slate-400">{rules.label}</p>
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="text-xs font-medium text-slate-800 truncate flex-1" title={f.name}>
                {f.name}
              </span>
              <span className="text-[10px] text-slate-400">{formatFileSize(f.size)}</span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="p-1 text-slate-400 hover:text-red-600"
                aria-label={`Remove ${f.name}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
