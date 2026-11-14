import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/app/components/ui/feedback";
import EmailJobClient from "./EmailJobClient";

export const metadata: Metadata = { title: "E-mail job" };

export default async function EmailJobPage({ params }: PageProps<"/admin/email/jobs/[id]">) {
  const { id } = await params;
  return (
    <Suspense fallback={<LoadingBlock />}>
      <EmailJobClient jobId={id} />
    </Suspense>
  );
}
