'use client';

import { useState, ReactNode } from "react";
import Navbar from "../dashboard/components/Navbar";
import Sidebar from "../dashboard/components/Sidebar";

interface AdminShellProps {
    children: ReactNode;
}

export default function AdminShell({ children }: AdminShellProps) {
    // Collapsed on phones so the content keeps the screen. The shell renders
    // only on the client (after the session check in RoleGate).
    const [isSidebarOpen, setIsSidebarOpen] = useState(
        () => typeof window === "undefined" || window.matchMedia("(min-width: 768px)").matches,
    );

    const toggleSidebar = () => {
        setIsSidebarOpen(!isSidebarOpen);
    };

    return (
        <div className="min-h-screen w-full bg-[#e2e8f0] overflow-x-hidden flex flex-col">
            {/* Navbar - Scrolls with content */}
            <div className="w-full flex-shrink-0">
                <Navbar onMenuClick={toggleSidebar} />
            </div>

            {/* Main content area with sidebar */}
            <div className="flex w-full flex-1">
                {/* Sidebar - Scrolls with content, extends to match content height */}
                <div className="flex-shrink-0 self-stretch">
                    <Sidebar isOpen={isSidebarOpen} />
                </div>

                {/* Main content */}
                <main className="flex-1 min-w-0 w-full">
                    {children}
                </main>
            </div>
        </div>
    );
}
