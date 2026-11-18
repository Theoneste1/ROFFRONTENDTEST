import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import FormsAdmin from "./FormsAdmin";

export const metadata: Metadata = { title: "Forms" };

/** Administrators: open, close and schedule the registration and website forms (`/admin/forms`, forms.view). */
export default function FormsPage() {
  return (
    <PermissionsGate>
      <FormsAdmin />
    </PermissionsGate>
  );
}
