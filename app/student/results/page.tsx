import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import { MyResults } from "@/app/components/test-management/ResultViews";

export const metadata: Metadata = { title: "My results" };

/** Students: their own published test results (capability testResults, tests.viewOwnResults). Never a rank. */
export default function MyResultsPage() {
  return (
    <PermissionsGate>
      <MyResults />
    </PermissionsGate>
  );
}
