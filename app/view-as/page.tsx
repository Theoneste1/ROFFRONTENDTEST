import type { Metadata } from "next";
import { Suspense } from "react";
import ViewAsStart from "./ViewAsStart";

export const metadata: Metadata = { title: "View as", robots: { index: false, follow: false } };

/**
 * The "view as" tab (read only, owner 2026-11-23): exchanges the single-use ticket from the address for a viewing token
 * kept in this tab only, then opens the viewed user's home page; /view-as?ended=1 tells that the viewing session ended.
 */
export default function ViewAsPage() {
  return (
    <Suspense fallback={null}>
      <ViewAsStart />
    </Suspense>
  );
}
