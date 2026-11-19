import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import CountriesAdmin from "./CountriesAdmin";

export const metadata: Metadata = { title: "Countries" };

/** Administrators: correct a country's name or calling code (`/admin/countries`, reference.manage). */
export default function CountriesPage() {
  return (
    <PermissionsGate>
      <CountriesAdmin />
    </PermissionsGate>
  );
}
