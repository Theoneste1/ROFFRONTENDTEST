import type { Metadata } from "next";
import SyncRunDetail from "./SyncRunDetail";

export const metadata: Metadata = { title: "Directory sync run" };

export default async function SchoolSyncRunPage({ params }: PageProps<"/admin/schools/sync/[runId]">) {
  const { runId } = await params;
  return <SyncRunDetail runId={runId} />;
}
