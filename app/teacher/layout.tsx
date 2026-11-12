'use client';

import { useState } from "react";
import PortalNavbar from "@/app/components/shell/PortalNavbar";
import RoleGate from "@/app/components/auth/RoleGate";
import Sidebar from "./components/Sidebar";

/**
 * The teacher portal (role TEACHER): the students of the schools an
 * Administrator assigned to the teacher, with the actions an Administrator
 * granted. Same shell as the other portals.
 */
export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  // Collapsed on phones so the content keeps the screen (renders after RoleGate's session check).
  const [isSidebarOpen, setIsSidebarOpen] = useState(
    () => typeof window === "undefined" || window.matchMedia("(min-width: 768px)").matches,
  );

  return (
    <RoleGate role="TEACHER">
      <div className="min-h-screen w-full bg-[#e2e8f0] overflow-x-hidden flex flex-col">
        <div className="w-full flex-shrink-0">
          <PortalNavbar onMenuClick={() => setIsSidebarOpen((o) => !o)} avatarClassName="bg-emerald-600" />
        </div>
        <div className="flex w-full flex-1">
          <div className="flex-shrink-0 self-stretch">
            <Sidebar isOpen={isSidebarOpen} />
          </div>
          <main className="flex-1 min-w-0 w-full">{children}</main>
        </div>
      </div>
    </RoleGate>
  );
}
