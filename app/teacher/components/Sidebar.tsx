'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users } from "lucide-react";
import SidebarUtilities from "@/app/components/shell/SidebarUtilities";
import { useSession } from "@/lib/auth/session";
import { TEACHER_NAV, visibleNav } from "@/lib/auth/navigation";

/** The teacher portal menu (same look as the coach portal; items follow /me/permissions). */
export default function Sidebar({ isOpen }: { isOpen: boolean }) {
  const pathname = usePathname();
  const { knownPermissions } = useSession();
  const isActive = (href: string) => (href === "/teacher/dashboard" ? pathname === href || pathname.startsWith("/teacher/students") : pathname.startsWith(href));

  return (
    <aside
      className={`${isOpen ? "w-64 px-4" : "w-20 px-3"} h-full bg-[#001E4E] text-slate-300 flex flex-col justify-between py-6 select-none transition-all duration-300 ease-in-out`}
    >
      <div className="flex flex-col gap-3">
        <div className="text-white font-bold text-center text-lg tracking-wide pb-6 border-b border-blue-900/40 whitespace-nowrap">
          {isOpen ? "ROF LMS" : "ROF"}
        </div>
        {visibleNav(TEACHER_NAV, knownPermissions).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            className={`flex items-center gap-3 w-full py-3 rounded-xl font-medium transition-all ${isOpen ? "px-4" : "justify-center px-0"} ${
              isActive(item.href)
                ? "bg-gradient-to-r from-[#6366F1] to-[#4F46E5] text-white shadow-md shadow-indigo-950/50"
                : "hover:bg-white/5 text-slate-400 hover:text-white"
            }`}
          >
            <Users className="h-5 w-5 flex-shrink-0" />
            {isOpen && <span className="whitespace-nowrap">{item.label}</span>}
          </Link>
        ))}
      </div>
      <SidebarUtilities isOpen={isOpen} settingsHref="/teacher/profile" />
    </aside>
  );
}
