import type { Metadata } from "next";
import { EditReport } from "@/app/components/reports/ReportsHome";

export const metadata: Metadata = { title: "Edit report" };

export default async function Page({ params }: PageProps<"/teacher/reports/[id]/edit">) {
  const { id } = await params;
  return <EditReport id={id} base="/teacher/reports" />;
}
