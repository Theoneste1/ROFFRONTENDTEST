'use client';

import React from "react";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
    LayoutGrid,
    BookOpen,
    FileText,
    ClipboardCheck,
    Network,
    FileQuestion
} from "lucide-react";
import SidebarUtilities from "@/app/components/shell/SidebarUtilities";
import SidebarNav from "@/app/components/shell/SidebarNav";
import { useSession } from "@/lib/auth/session";
import { MENTOR_NAV, MENTOR_TESTS, visibleNav } from "@/lib/auth/navigation";
import { testsNavVisible } from "@/lib/test-management/rules";
import { useBackendCapabilities } from "@/lib/queries/capabilities";

interface SidebarProps {
    isOpen: boolean;
}

const ICONS: Record<string, LucideIcon> = {
    "/mentor/dashboard": LayoutGrid,
    "/mentor/courses": BookOpen,
    "/mentor/assignments": FileText,
    "/mentor/reviews": ClipboardCheck,
    "/mentor/programme": Network,
    "/mentor/tests": FileQuestion,
};

/**
 * The coach portal menu. Items follow `GET /me/permissions`
 * (lib/auth/navigation.ts): e.g. a DENY override of reviews.grade hides
 * Reviews. Navigation only; the API enforces every permission.
 */
export default function Sidebar({ isOpen }: SidebarProps) {
    const pathname = usePathname();
    const { knownPermissions } = useSession();
    const { detection } = useBackendCapabilities();
    // Tests: Head Coaches (tests.view) on a backend with `testManagement` (lib/test-management/rules.ts).
    const items = [...visibleNav(MENTOR_NAV, knownPermissions), ...(testsNavVisible(detection, knownPermissions) ? [MENTOR_TESTS] : [])];

    // Function to check if link is active
    const isActive = (path: string) => {
        if (path === "/mentor/dashboard") {
            return pathname === "/mentor/dashboard";
        }
        return pathname.startsWith(path);
    };

    return (
        <aside
            className={`${isOpen ? 'w-64 px-4' : 'w-20 px-3'
                } h-full bg-[#001E4E] text-slate-400 flex flex-col justify-between py-6 select-none transition-all duration-300 ease-in-out`}
        >
            {/* TOP NAVIGATION LINKS */}
            <div className="flex-1 min-h-0 flex flex-col gap-3">
                {/* Title Header */}
                <div className="text-white font-bold text-center text-lg tracking-wide pb-6 border-b border-blue-900/40 whitespace-nowrap">
                    {isOpen ? "ROF LMS" : "ROF"}
                </div>

                <SidebarNav
                    isOpen={isOpen}
                    label="Coach portal"
                    items={items.map((item) => ({ href: item.href, label: item.label, icon: ICONS[item.href] ?? LayoutGrid, active: isActive(item.href) }))}
                />
            </div>

            {/* BOTTOM UTILITY LINKS */}
            <SidebarUtilities isOpen={isOpen} settingsHref="/mentor/account" />
        </aside>
    );
}
