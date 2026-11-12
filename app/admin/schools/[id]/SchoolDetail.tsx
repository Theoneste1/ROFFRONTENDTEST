"use client";

import { useSchoolDirectoryMode } from "@/lib/queries/school-directory";
import { LoadingBlock } from "@/app/components/ui/feedback";
import { AdminPage } from "../../components/adminUi";
import ReadOnlySchoolDetail from "./ReadOnlySchoolDetail";
import SchoolDirectoryDetail from "../directory/SchoolDirectoryDetail";

/** A school: the directory view in "manage" mode, the existing read-only view otherwise (see ../page.tsx). */
export default function SchoolDetail({ schoolId }: { schoolId: string }) {
  const mode = useSchoolDirectoryMode();
  if (mode === "loading") {
    return (
      <AdminPage title="School">
        <LoadingBlock />
      </AdminPage>
    );
  }
  return mode === "manage" ? <SchoolDirectoryDetail schoolId={schoolId} /> : <ReadOnlySchoolDetail schoolId={schoolId} />;
}
