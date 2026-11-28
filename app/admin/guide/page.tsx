import { Suspense } from "react";
import UserGuide from "@/app/components/help/UserGuide";

/** The user guide, read inside the system (owner, 2026-11-28). */
export default function GuidePage() {
  return (
    <Suspense>
      <UserGuide />
    </Suspense>
  );
}
