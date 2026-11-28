import type { Metadata } from "next";
import FindSubmission from "@/app/components/test-management/FindSubmission";

export const metadata: Metadata = { title: "Find a submission" };

/** Administrators and Super Administrators: find a submitted answer and reassign it (tests.reassignSubmission). */
export default function FindSubmissionPage() {
  return <FindSubmission />;
}
