"use client";

/**
 * The account's picture, or its generated avatar (lib/accounts/avatar.ts), everywhere in the app.
 *
 * - <AvatarBadge>: round; the picture, or the initials ("TN") on the account's ROF tone. For tight
 *   places: the top bar, menus, lists.
 * - <AvatarTile>: the large avatar on My Profile; the picture, or the generated text avatar showing
 *   the first name and the last-name initial ("Theoneste N").
 *
 * A picture behind authentication (`/api/v1/users/:id/avatar?v=…`) is fetched with the session
 * (never a token in a URL), cached per path by React Query, and shown through an object URL that is
 * revoked when it is no longer shown. If it cannot be loaded, the generated avatar is shown.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { meApi } from "@/lib/api/auth";
import { isApiError } from "@/lib/api/errors";
import { queryKeys } from "@/lib/query/keys";
import { avatarInitials, avatarLabel, avatarSource, avatarTone, type AvatarPerson } from "@/lib/accounts/avatar";

export interface AvatarUser extends AvatarPerson {
  avatarUrl?: string | null;
}

/** The picture's displayable URL, or null (none, still loading, or failed). */
export function useAvatarSrc(avatarUrl: string | null | undefined): string | null {
  const source = avatarSource(avatarUrl);
  const blob = useQuery({
    queryKey: queryKeys.avatars.image(source?.kind === "api" ? source.path : ""),
    queryFn: async () => (await meApi.avatarImage((source as { path: string }).path)).blob,
    enabled: source?.kind === "api",
    staleTime: Infinity, // the path changes with every new picture (?v=<file id>)
    gcTime: 30 * 60_000,
    // 404: no picture (the generated avatar is shown); 401/403: not retried either. Server errors: once.
    retry: (count, err) => !(isApiError(err) && err.status < 500) && count < 1,
  });
  const data = source?.kind === "api" ? blob.data : undefined;
  // One object URL per picture, revoked when the picture changes or the avatar unmounts.
  const objectUrl = useMemo(() => (data ? URL.createObjectURL(data) : null), [data]);
  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, [objectUrl]);
  if (source?.kind === "url") return source.url;
  return objectUrl;
}

const BADGE_SIZE = {
  xs: "h-7 w-7 text-[11px]",
  sm: "h-9 w-9 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
} as const;

export function AvatarBadge({ user, size = "md", className = "" }: { user: AvatarUser | null | undefined; size?: keyof typeof BADGE_SIZE; className?: string }) {
  const src = useAvatarSrc(user?.avatarUrl);
  const [broken, setBroken] = useState<string | null>(null);
  const showImage = src && broken !== src;
  return (
    <span
      className={`relative inline-flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full font-bold ring-2 ring-white shadow-sm ${BADGE_SIZE[size]} ${showImage ? "bg-slate-200" : avatarTone(user)} ${className}`}
      aria-hidden="true"
      data-testid="avatar-badge"
      data-avatar={showImage ? "picture" : "generated"}
    >
      {showImage ? (
        // An object URL or an https URL: plain <img> (next/image cannot optimise blob: URLs).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setBroken(src)} />
      ) : (
        avatarInitials(user)
      )}
    </span>
  );
}

/** The large avatar of My Profile: the picture, or the generated "Theoneste N" avatar. */
export function AvatarTile({ user, busy = false }: { user: AvatarUser | null | undefined; busy?: boolean }) {
  const src = useAvatarSrc(user?.avatarUrl);
  const [broken, setBroken] = useState<string | null>(null);
  const showImage = src && broken !== src;
  const label = avatarLabel(user);
  return (
    <div
      className={`relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-3xl shadow-md ring-4 ring-white ${showImage ? "bg-slate-200" : avatarTone(user)} ${busy ? "opacity-60" : ""}`}
      data-testid="avatar-tile"
      data-avatar={showImage ? "picture" : "generated"}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`Profile picture of ${label}`} className="h-full w-full object-cover" onError={() => setBroken(src)} />
      ) : (
        <span className="px-2 text-center text-xl font-extrabold leading-tight tracking-tight break-words" aria-label={`Avatar: ${label}`}>
          {label}
        </span>
      )}
    </div>
  );
}
