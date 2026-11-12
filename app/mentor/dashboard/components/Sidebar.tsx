'use client';

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
    LayoutGrid,
    BookOpen,
    FileText,
    ClipboardCheck
} from "lucide-react";
import SidebarUtilities from "@/app/components/shell/SidebarUtilities";
import { useSession } from "@/lib/auth/session";
import { MENTOR_NAV, visibleNav } from "@/lib/auth/navigation";

interface SidebarProps {
    isOpen: boolean;
}

const ICONS: Record<string, LucideIcon> = {
    "/mentor/dashboard": LayoutGrid,
    "/mentor/courses": BookOpen,
    "/mentor/assignments": FileText,
    "/mentor/reviews": ClipboardCheck,
};

/**
 * The coach portal menu. Items follow `GET /me/permissions`
 * (lib/auth/navigation.ts): e.g. a DENY override of reviews.grade hides
 * Reviews. Navigation only; the API enforces every permission.
 */
export default function Sidebar({ isOpen }: SidebarProps) {
    const pathname = usePathname();
    const { knownPermissions } = useSession();

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
                } h-full bg-[#001E4E] text-slate-300 flex flex-col justify-between py-6 select-none transition-all duration-300 ease-in-out`}
        >
            {/* TOP NAVIGATION LINKS */}
            <div className="flex flex-col gap-3">
                {/* Title Header */}
                <div className="text-white font-bold text-center text-lg tracking-wide pb-6 border-b border-blue-900/40 whitespace-nowrap">
                    {isOpen ? "ROF LMS" : "ROF"}
                </div>

                {visibleNav(MENTOR_NAV, knownPermissions).map((item) => {
                    const Icon = ICONS[item.href] ?? LayoutGrid;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            title={item.label}
                            className={`flex items-center gap-3 w-full py-3 rounded-xl font-medium transition-all ${isOpen ? 'px-4' : 'justify-center px-0'
                                } ${isActive(item.href)
                                    ? "bg-gradient-to-r from-[#6366F1] to-[#4F46E5] text-white shadow-md shadow-indigo-950/50"
                                    : "hover:bg-white/5 text-slate-400 hover:text-white"
                                }`}
                        >
                            <Icon className="h-5 w-5 flex-shrink-0" />
                            {isOpen && <span className="whitespace-nowrap">{item.label}</span>}
                        </Link>
                    );
                })}
            </div>

            {/* BOTTOM UTILITY LINKS */}
            <SidebarUtilities isOpen={isOpen} settingsHref="/mentor/profile" />
        </aside>
    );
}
