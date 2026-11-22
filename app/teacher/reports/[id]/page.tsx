import type { Metadata } from "next";
import { ViewReport } from "@/app/components/reports/ReportsHome";

export const metadata: Metadata = { title: "Report" };

export default async function Page({ params }: PageProps<"/teacher/reports/[id]">) {
  const { id } = await params;
  return <ViewReport id={id} base="/teacher/reports" />;
}
