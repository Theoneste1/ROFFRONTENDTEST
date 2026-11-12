import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import ProgrammeMonitor from "./ProgrammeMonitor";

export const metadata: Metadata = { title: "My programme" };

/** Head Coach: monitoring of the programmes they head (coach portal). */
export default function ProgrammePage() {
  return (
    <PermissionsGate>
      <ProgrammeMonitor />
    </PermissionsGate>
  );
}
