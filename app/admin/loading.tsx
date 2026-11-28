import { LoadingBlock } from "@/app/components/ui/feedback";

/** Shown at once inside the portal frame (top bar and menu stay) while the next page loads. */
export default function Loading() {
  return <LoadingBlock label="Loading…" />;
}
