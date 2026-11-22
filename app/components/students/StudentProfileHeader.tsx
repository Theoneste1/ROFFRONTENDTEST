"use client";

/**
 * The one Student Profile header used everywhere a student is opened (administrators, user management, coaches,
 * Test Management, teachers, students): the photo (or the initials avatar), the full name, username, country, school,
 * grade, Olympiad level, Olympiad subjects and — for staff — the account status. Responsive: stacked on phones.
 * <StudentLink> makes a name (or a photo) open the student's profile in the viewer's portal.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { useSession } from "@/lib/auth/session";
import { accountStatusText, studentProfileHref, type StudentOverview } from "@/lib/accounts/student-overview";
import { interestsWithOtherText } from "@/lib/accounts/olympiad-interests";
import { countryName } from "@/lib/schools/countries";
import { AvatarBadge, useAvatarSrc } from "@/app/components/account/UserAvatar";
import { avatarInitials, avatarTone } from "@/lib/accounts/avatar";
import { useState } from "react";

function Photo({ s }: { s: StudentOverview }) {
  const src = useAvatarSrc(s.avatarUrl);
  const [broken, setBroken] = useState<string | null>(null);
  const show = src && broken !== src;
  return (
    <div
      className={`flex h-24 w-24 sm:h-28 sm:w-28 shrink-0 items-center justify-center overflow-hidden rounded-full ring-4 ring-white shadow-md text-3xl font-extrabold ${show ? "bg-slate-200" : avatarTone(s)}`}
      data-testid="profile-photo"
      data-avatar={show ? "picture" : "generated"}
    >
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`Photo of ${s.firstName} ${s.lastName}`} className="h-full w-full object-cover" onError={() => setBroken(src)} />
      ) : (
        <span aria-label={`Initials of ${s.firstName} ${s.lastName}`}>{avatarInitials(s)}</span>
      )}
    </div>
  );
}

function Fact({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-gray-900 break-words" data-testid={testId}>{children}</dd>
    </div>
  );
}

export default function StudentProfileHeader({ student: s, actions }: { student: StudentOverview; actions?: ReactNode }) {
  const status = accountStatusText(s.accountStatus);
  return (
    <section className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-gray-100/80" data-testid="student-profile-header">
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
        <Photo s={s} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-words" data-testid="profile-name">{s.firstName} {s.lastName}</h1>
            {status && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${s.accountStatus === "ACTIVE" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`} data-testid="profile-status">
                {status}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600">@{s.username}</p>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-left md:grid-cols-3">
            <Fact label="Country">{s.country ? countryName(s.country) : "—"}</Fact>
            <Fact label="School" testId="profile-school">{s.school?.name ?? "—"}</Fact>
            <Fact label="Grade">{s.gradeLevel ?? "—"}</Fact>
            <Fact label="Olympiad level" testId="profile-level">{s.olympiadLevel?.name ?? "—"}</Fact>
            <Fact label="Olympiad subjects">{interestsWithOtherText(s.olympiadInterests, s.olympiadInterestOther) || "—"}</Fact>
          </dl>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap justify-center gap-2">{actions}</div>}
      </div>
    </section>
  );
}

/**
 * A student's name — and optionally their photo — that opens the profile in the viewer's portal. Plain text when the
 * viewer's role has no portal.
 */
export function StudentLink({ student, withPhoto = false, className = "" }: { student: { id: string; firstName: string; lastName: string; username?: string | null; avatarUrl?: string | null }; withPhoto?: boolean; className?: string }) {
  const { user } = useSession();
  const href = studentProfileHref(user?.role, student.id);
  const body = (
    <>
      {withPhoto && <AvatarBadge user={student} size="xs" />}
      <span>{student.firstName} {student.lastName}</span>
    </>
  );
  if (!href) return <span className={`inline-flex items-center gap-2 ${className}`}>{body}</span>;
  return (
    <Link href={href} className={`inline-flex items-center gap-2 font-semibold text-[#00428C] hover:underline ${className}`} data-testid="student-link">
      {body}
    </Link>
  );
}
