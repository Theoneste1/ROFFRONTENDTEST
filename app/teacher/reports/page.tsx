import type { Metadata } from "next";
import { ReportsList } from "@/app/components/reports/ReportsHome";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return <ReportsList base="/teacher/reports" />;
}
