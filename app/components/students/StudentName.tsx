"use client";

/**
 * A student's name in a list: a link to the student's profile in the viewer's portal when the backend offers profiles
 * (studentOverview), plain text otherwise. The backend decides who may open it.
 */
import Link from "next/link";
import { hasFeature } from "@/lib/api/capabilities";
import { useSession } from "@/lib/auth/session";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { studentProfileHref } from "@/lib/accounts/student-overview";
import { personName } from "@/lib/format";

export default function StudentName({ student }: { student: { id: string; firstName: string; lastName: string } }) {
  const { user } = useSession();
  const on = hasFeature(useBackendCapabilities().detection, "studentOverview");
  const href = on ? studentProfileHref(user?.role, student.id) : null;
  const name = personName(student);
  return href ? (
    <Link href={href} className="hover:text-[#00428C] hover:underline" data-testid="student-link">
      {name}
    </Link>
  ) : (
    <>{name}</>
  );
}
