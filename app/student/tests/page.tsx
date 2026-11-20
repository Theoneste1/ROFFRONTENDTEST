import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import { MyTests } from "@/app/components/test-management/AnswerLists";

export const metadata: Metadata = { title: "My tests" };

/** Students: the tests of their division, their deadline (extension included) and their answers (tests.submit). */
export default function MyTestsPage() {
  return (
    <PermissionsGate>
      <MyTests />
    </PermissionsGate>
  );
}
