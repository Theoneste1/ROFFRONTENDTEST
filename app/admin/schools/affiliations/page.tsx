import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import AffiliationsReview from "./AffiliationsReview";

export const metadata: Metadata = { title: "School verification" };

/** Administrators: students' school claims to verify (`/admin/school-affiliations`, schools.manage). */
export default function SchoolAffiliationsPage() {
  return (
    <PermissionsGate>
      <AffiliationsReview />
    </PermissionsGate>
  );
}
