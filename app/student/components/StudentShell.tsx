'use client';

import type { ReactNode } from "react";
import PortalShell from "@/app/components/shell/PortalShell";
import Sidebar from "../dashboard/components/Sidebar";

/** The student portal frame (shared PortalShell: rail on desktop, drawer on phones). */
export default function StudentShell({ children }: { children: ReactNode }) {
    return (
        <PortalShell renderSidebar={(isOpen) => <Sidebar isOpen={isOpen} />}>
            {children}
        </PortalShell>
    );
}
