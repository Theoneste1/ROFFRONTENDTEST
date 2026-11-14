import type { Metadata } from "next";
import SchoolImport from "./SchoolImport";

export const metadata: Metadata = { title: "Import schools" };

/** Administrators: import schools from a CSV / XLSX file (`schoolAdministration` + schools.manage). */
export default function SchoolImportPage() {
  return <SchoolImport />;
}
