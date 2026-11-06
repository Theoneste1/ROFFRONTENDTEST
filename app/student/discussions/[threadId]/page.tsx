import type { Metadata } from "next";
import ThreadPage from "@/app/components/discussions/ThreadPage";

export const metadata: Metadata = { title: "Discussion" };

/** One discussion topic (target of `/discussions/:threadId` notification links). */
export default async function DiscussionPage({ params }: PageProps<"/student/discussions/[threadId]">) {
  const { threadId } = await params;
  return <ThreadPage threadId={threadId} />;
}
