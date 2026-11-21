"use client";

/**
 * The applicant's picture on an approval dialog (capability applicationPictureReview), with an explicit, unchecked
 * checkbox to keep it as the account's profile picture. The picture is fetched with the session (never a token in a
 * URL) and shown through an object URL that is revoked when it is no longer shown. The box can be ticked only once
 * the picture is visible: an Administrator must see a picture before approving it.
 */
import { useEffect, useId, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { isApiError } from "@/lib/api/errors";
import { KEEP_PICTURE_LABEL } from "@/lib/accounts/application-picture";
import { Spinner } from "@/app/components/ui/feedback";

export default function ApplicationPictureReview({
  kind,
  applicationId,
  fetchPicture,
  keep,
  onKeepChange,
  onLoadedChange,
}: {
  kind: "teacher" | "coach";
  applicationId: string;
  fetchPicture: (id: string) => Promise<{ blob: Blob }>;
  keep: boolean;
  onKeepChange: (keep: boolean) => void;
  onLoadedChange: (loaded: boolean) => void;
}) {
  const checkboxId = useId();
  const picture = useQuery({
    queryKey: ["admin", "application-picture", kind, applicationId],
    queryFn: async () => (await fetchPicture(applicationId)).blob,
    staleTime: 60_000,
    gcTime: 60_000,
    retry: (count, err) => !(isApiError(err) && err.status < 500) && count < 1,
  });
  const objectUrl = useMemo(() => (picture.data ? URL.createObjectURL(picture.data) : null), [picture.data]);
  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, [objectUrl]);
  const loaded = !!objectUrl;
  useEffect(() => {
    onLoadedChange(loaded);
    if (!loaded) onKeepChange(false);
  }, [loaded, onLoadedChange, onKeepChange]);

  return (
    <div className="rounded-xl border border-gray-200 p-3" data-testid="application-picture-review">
      <p className="text-xs font-semibold text-gray-600 mb-2">Picture sent with the application</p>
      <div className="flex items-start gap-3">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
          {objectUrl ? (
            // An object URL: plain <img> (next/image cannot optimise blob: URLs).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={objectUrl} alt="Picture sent by the applicant" className="h-full w-full object-cover" />
          ) : picture.isPending ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <span className="px-1 text-center text-[11px] text-gray-600">Couldn&apos;t load the picture</span>
          )}
        </div>
        <div className="text-sm">
          <label htmlFor={checkboxId} className={`flex items-start gap-2 ${loaded ? "text-gray-800" : "text-gray-500"}`}>
            <input
              id={checkboxId}
              type="checkbox"
              className="mt-0.5"
              checked={keep && loaded}
              disabled={!loaded}
              onChange={(e) => onKeepChange(e.target.checked)}
            />
            <span>{KEEP_PICTURE_LABEL}</span>
          </label>
          <p className="mt-1 text-xs text-gray-600">
            Leave it unticked to discard the picture. It is never published unless you tick this box.
          </p>
        </div>
      </div>
    </div>
  );
}
