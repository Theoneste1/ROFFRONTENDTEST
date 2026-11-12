"use client";

import { useSchoolDirectoryMode } from "@/lib/queries/school-directory";
import { LoadingBlock } from "@/app/components/ui/feedback";
import { AdminPage } from "../components/adminUi";
import ReadOnlySchoolsList from "./ReadOnlySchoolsList";
import SchoolDirectoryList from "./directory/SchoolDirectoryList";

/**
 * /admin/schools: the school directory when the backend advertises `schoolAdministration` and
 * the user holds `schools.manage`; otherwise the existing read-only list (legacy backend, an
 * UNKNOWN detection, or no permission). Decided by capability and permission, never by role.
 */
export default function SchoolsPage() {
  const mode = useSchoolDirectoryMode();
  if (mode === "loading") {
    return (
      <AdminPage title="Schools">
        <LoadingBlock />
      </AdminPage>
    );
  }
  return mode === "manage" ? <SchoolDirectoryList /> : <ReadOnlySchoolsList />;
}
