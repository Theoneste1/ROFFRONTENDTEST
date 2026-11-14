'use client';

import PortalShell from "@/app/components/shell/PortalShell";
import Sidebar from "./dashboard/components/Sidebar";
import RoleGate from "@/app/components/auth/RoleGate";

/** The coach portal frame (shared PortalShell: rail on desktop, drawer on phones). */
export default function MentorLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <RoleGate role="MENTOR">
            <PortalShell avatarClassName="bg-purple-600" renderSidebar={(isOpen) => <Sidebar isOpen={isOpen} />}>
                {children}
            </PortalShell>
        </RoleGate>
    );
}
