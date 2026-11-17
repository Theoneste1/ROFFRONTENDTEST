"use client";

/** Optional profile picture at registration (REG-02): never required; same file rules as My Profile. */
import { useId } from "react";
import { AVATAR_RULES } from "@/lib/accounts/avatar";

export default function OptionalAvatarField({ file, onChange, error }: { file: File | null; onChange: (f: File | null) => void; error?: string | null }) {
  const id = useId();
  return (
    <div data-testid="optional-avatar">
      <label htmlFor={id} className="block text-sm font-semibold text-slate-700 mb-2">
        Profile picture <span className="font-normal text-slate-500">(optional)</span>
      </label>
      <input
        id={id}
        name="avatar"
        type="file"
        accept={AVATAR_RULES.accept}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
        aria-invalid={error ? true : undefined}
      />
      <p className={`mt-1 text-xs ${error ? "text-red-600" : "text-slate-500"}`}>
        {error ?? (file ? `Chosen: ${file.name}. It is added once your registration is sent.` : "JPEG, PNG or WebP. You can also add or change it later in My Profile.")}
      </p>
      {file && (
        <button type="button" className="mt-1 text-xs font-semibold text-indigo-600 hover:underline" onClick={() => onChange(null)}>
          Remove the chosen picture
        </button>
      )}
    </div>
  );
}
