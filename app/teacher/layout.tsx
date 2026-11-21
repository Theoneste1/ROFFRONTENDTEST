'use client';

import PortalShell from "@/app/components/shell/PortalShell";
import RoleGate from "@/app/components/auth/RoleGate";
import Sidebar from "./components/Sidebar";

/**
 * The teacher portal (role TEACHER): the students of the schools an
 * Administrator assigned to the teacher, with the actions an Administrator
 * granted. Same shell as the other portals.
 */
export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGate role="TEACHER">
      <PortalShell renderSidebar={(isOpen) => <Sidebar isOpen={isOpen} />}>
        {children}
      </PortalShell>
    </RoleGate>
  );
}
