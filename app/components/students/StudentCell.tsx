'use client';

/**
 * A student in a list (owner 2026-11-27): their profile picture (or initials) and name, with the username in its own
 * column (StudentUsernameCell) instead of beside the name. The picture loads through the session; the backend's
 * GET /users/:id/avatar decides who sees it (the student's teachers, coaches and staff).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { AvatarBadge } from "@/app/components/account/UserAvatar";

export function StudentCell({ id, firstName, lastName, avatarUrl, name, href, children }: {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  /** The name as shown (default "First Last"). */
  name?: string;
  /** Where the name leads (a profile), if anywhere. */
  href?: string;
  /** Extra lines under the name (badges, last sign-in…). */
  children?: ReactNode;
}) {
  const label = name ?? `${firstName} ${lastName}`.trim();
  return (
    <div className="flex items-center gap-3" data-testid="student-cell">
      <AvatarBadge user={{ id, firstName, lastName, avatarUrl: avatarUrl ?? null }} size="sm" />
      <div className="min-w-0">
        {href ? (
          <Link href={href} className="font-semibold text-indigo-700 hover:underline">{label}</Link>
        ) : (
          <p className="font-semibold text-gray-800">{label}</p>
        )}
        {children}
      </div>
    </div>
  );
}

/** The username, in its own column. */
export function StudentUsernameCell({ username }: { username: string }) {
  return <span className="whitespace-nowrap text-gray-600" data-testid="student-username">{username}</span>;
}
