import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import EnrollmentsClient from "./EnrollmentsClient";

export const metadata: Metadata = { title: "Enrolments" };

/** Administrators: one academic year's enrolments; grade corrections and withdrawals in the current year. */
export default async function EnrollmentsPage({ params }: PageProps<"/admin/academic-years/[id]">) {
  const { id } = await params;
  return (
    <PermissionsGate>
      <EnrollmentsClient yearId={id} />
    </PermissionsGate>
  );
}
