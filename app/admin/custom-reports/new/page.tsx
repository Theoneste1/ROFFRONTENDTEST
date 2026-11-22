import type { Metadata } from "next";
import { NewReport } from "@/app/components/reports/ReportsHome";

export const metadata: Metadata = { title: "New report" };

export default function Page() {
  return <NewReport base="/admin/custom-reports" />;
}
