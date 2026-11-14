import type { Metadata } from "next";
import SyncRuns from "./SyncRuns";

export const metadata: Metadata = { title: "Directory sync" };

/** Official-directory sync runs (`schoolDirectorySync` + schools.manage). */
export default function SchoolSyncPage() {
  return <SyncRuns />;
}
