"use client";

/**
 * Optional profile picture at registration (REG-02): never required; same file rules as My Profile. Shown as a dashed
 * drop zone (the approved reference design): click it (or focus it and press Space / Enter) to choose a file, or drop a
 * file on it. A dropped file goes through the same `onChange` as a chosen one, so the form's own check
 * (registrationAvatarProblem) and upload are unchanged.
 */
import { useId, useRef, useState, type DragEvent } from "react";
import { Camera } from "lucide-react";
import { AVATAR_RULES } from "@/lib/accounts/avatar";

/** "2 MB" (the limit of AVATAR_RULES). */
const MAX_SIZE = `${Math.round((AVATAR_RULES.maxBytes / (1024 * 1024)) * 10) / 10} MB`;

export default function OptionalAvatarField({ file, onChange, error }: { file: File | null; onChange: (f: File | null) => void; error?: string | null }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const onDrag = (e: DragEvent<HTMLLabelElement>, entering: boolean) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (entering) e.dataTransfer.dropEffect = "copy";
    setOver(entering);
  };
  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    setOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (!dropped) return;
    // The input keeps no stale choice: the dropped file is the one the form holds.
    if (input.current) input.current.value = "";
    onChange(dropped);
  };

  const tone = over ? "border-brand bg-brand/5" : error ? "border-red-400 bg-red-50/40" : "border-slate-300 bg-slate-50/70 hover:border-brand/60 hover:bg-brand/5";
  return (
    <div data-testid="optional-avatar">
      <p id={`${id}-title`} className="mb-1.5 block text-sm font-semibold text-slate-800">
        Profile picture <span className="font-normal text-slate-600">(optional)</span>
      </p>
      <label
        htmlFor={id}
        onDragEnter={(e) => onDrag(e, true)}
        onDragOver={(e) => onDrag(e, true)}
        onDragLeave={(e) => onDrag(e, false)}
        onDrop={onDrop}
        className={`relative flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-3.5 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand has-[:focus-visible]:ring-offset-2 ${tone}`}
        data-testid="avatar-drop-zone"
      >
        <input
          id={id}
          ref={input}
          name="avatar"
          type="file"
          accept={AVATAR_RULES.accept}
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          className="sr-only"
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-types ${id}-status`}
          aria-invalid={error ? true : undefined}
        />
        <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <Camera className="h-5 w-5 flex-shrink-0 text-brand" aria-hidden="true" />
          {file ? file.name : "Click to upload or drag and drop"}
        </span>
        <span id={`${id}-types`} className="text-xs text-slate-600">
          JPEG, PNG or WebP (max {MAX_SIZE})
        </span>
      </label>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3">
        <p id={`${id}-status`} className={`text-xs ${error ? "text-red-600" : "text-slate-600"}`}>
          {error ?? (file ? `Chosen: ${file.name}. It is added once your registration is sent.` : "You can also add or change it later in My Profile.")}
        </p>
        {file && (
          <button
            type="button"
            className="inline-flex min-h-11 items-center text-xs font-semibold text-brand hover:underline"
            onClick={() => {
              // Clear the input too, so choosing the same file again fires a change.
              if (input.current) input.current.value = "";
              onChange(null);
            }}
          >
            Remove the chosen picture
          </button>
        )}
      </div>
    </div>
  );
}
