import type { Metadata } from "next";
import ReportDetail from "./ReportDetail";

export const metadata: Metadata = { title: "Reported content" };

/** Also the target of the backend's "content reported" notification links. */
export default async function ModerationReportPage({ params }: PageProps<"/admin/moderation/reports/[id]">) {
  const { id } = await params;
  return <ReportDetail reportId={id} />;
}
