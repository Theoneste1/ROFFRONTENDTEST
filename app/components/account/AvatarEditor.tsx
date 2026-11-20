"use client";

/**
 * The profile picture on My Profile: the picture or the generated avatar ("Theoneste N"), and — on a
 * backend advertising `profilePictures` — Upload / Change picture and Remove picture.
 *
 * - Checked before sending: JPEG, PNG or WebP, at most 2 MB (lib/accounts/avatar.ts); the backend
 *   checks the detected type again.
 * - The upload goes through the API client (XHR, so its progress is shown here as a bar).
 * - The response is the new profile: it replaces the session's user, so the top bar, the menu and
 *   this page change at once, without signing in again. Removing returns to the generated avatar.
 * - Only the signed-in user's own picture (`/me/avatar`).
 */
import { useRef, useState, useSyncExternalStore } from "react";
import { Camera, Trash2 } from "lucide-react";
import type { CurrentUser } from "@/lib/api/types";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { hasFeature } from "@/lib/api/capabilities";
import { getServerUploads, getUploads, subscribeUploads, summarise } from "@/lib/api/upload-progress";
import { AVATAR_RULES, avatarFileProblem, avatarUploadErrorText } from "@/lib/accounts/avatar";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { useRemoveAvatar, useUploadAvatar } from "@/lib/queries/account";
import { Alert } from "@/app/components/ui/feedback";
import { AvatarTile } from "./UserAvatar";

/** Upload progress of the request in flight (the API client reports every multipart upload). */
function UploadBar() {
  const uploads = useSyncExternalStore(subscribeUploads, getUploads, getServerUploads);
  const s = summarise(uploads);
  const pct = s && s.total > 0 ? Math.min(100, Math.round((s.loaded / s.total) * 100)) : 0;
  return (
    <div className="mt-3 w-full max-w-[12rem]" data-testid="avatar-progress">
      {/* A native <progress>: no inline style needed (the CSP blocks style attributes). */}
      <progress
        value={pct}
        max={100}
        aria-label="Uploading picture"
        className="h-2 w-full overflow-hidden rounded-full appearance-none bg-slate-200 [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:bg-amber-400 [&::-moz-progress-bar]:bg-amber-400"
      />
      <p className="mt-1 text-[11px] text-slate-600">{s?.processing ? "Saving…" : `Uploading… ${pct}%`}</p>
    </div>
  );
}

export default function AvatarEditor({ user }: { user: CurrentUser }) {
  const enabled = hasFeature(useBackendCapabilities().detection, "profilePictures");
  const upload = useUploadAvatar();
  const remove = useRemoveAvatar();
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const busy = upload.isPending || remove.isPending;
  const hasPicture = !!user.avatarUrl;

  function onFile(file: File | undefined) {
    if (input.current) input.current.value = ""; // the same file can be chosen again
    if (!file) return;
    const problem = avatarFileProblem(file);
    if (problem) {
      setMessage({ tone: "error", text: problem });
      return;
    }
    setMessage(null);
    upload.mutate(file, {
      onSuccess: () => setMessage({ tone: "success", text: hasPicture ? "Your picture was changed." : "Your picture was added." }),
      // 415 FILE_TYPE_NOT_ALLOWED, 413 PAYLOAD_TOO_LARGE, 400 FILE_REQUIRED / EMPTY_FILE: clear messages.
      onError: (e) => setMessage({ tone: "error", text: (isApiError(e) ? avatarUploadErrorText(e) : null) ?? errorMessage(e) }),
    });
  }

  function onRemove() {
    setMessage(null);
    remove.mutate(undefined, {
      onSuccess: () => setMessage({ tone: "success", text: "Your picture was removed. Your generated avatar is shown again." }),
      onError: (e) => setMessage({ tone: "error", text: errorMessage(e) }),
    });
  }

  return (
    <div className="flex w-full flex-col items-center" data-testid="avatar-editor">
      <AvatarTile user={user} busy={busy} />
      {upload.isPending && <UploadBar />}
      {enabled ? (
        <>
          <input
            ref={input}
            type="file"
            accept={AVATAR_RULES.accept}
            className="sr-only"
            id="avatar-file"
            data-testid="avatar-file"
            onChange={(e) => onFile(e.target.files?.[0])}
            disabled={busy}
          />
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <label
              htmlFor="avatar-file"
              className={`inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-dark focus-within:ring-2 focus-within:ring-indigo-400 ${busy ? "pointer-events-none opacity-60" : ""}`}
              data-testid="avatar-upload"
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
              {hasPicture ? "Change picture" : "Upload picture"}
            </label>
            {hasPicture && (
              <button
                type="button"
                onClick={onRemove}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-60"
                data-testid="avatar-remove"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {remove.isPending ? "Removing…" : "Remove picture"}
              </button>
            )}
          </div>
          <p className="mt-2 text-[11px] text-slate-600">JPEG, PNG or WebP, up to 2 MB.</p>
        </>
      ) : (
        <p className="mt-3 text-[11px] text-slate-600" data-testid="avatar-unavailable">Profile pictures are not available yet; your avatar is generated from your name.</p>
      )}
      {message && (
        <div className="mt-3 w-full text-left" role="status">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}
    </div>
  );
}
