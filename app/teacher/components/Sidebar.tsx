'use client';

import { usePathname } from "next/navigation";
import { Users } from "lucide-react";
import SidebarUtilities from "@/app/components/shell/SidebarUtilities";
import SidebarNav from "@/app/components/shell/SidebarNav";
import { useSession } from "@/lib/auth/session";
import { TEACHER_NAV, visibleNav } from "@/lib/auth/navigation";

/** The teacher portal menu (same look as the coach portal; items follow /me/permissions). */
export default function Sidebar({ isOpen }: { isOpen: boolean }) {
  const pathname = usePathname();
  const { knownPermissions } = useSession();
  const isActive = (href: string) => (href === "/teacher/dashboard" ? pathname === href || pathname.startsWith("/teacher/students") : pathname.startsWith(href));

  return (
    <aside
      className={`${isOpen ? "w-64 px-4" : "w-20 px-3"} h-full bg-[#001E4E] text-slate-400 flex flex-col justify-between py-6 select-none transition-all duration-300 ease-in-out`}
    >
      <div className="flex-1 min-h-0 flex flex-col gap-3">
        <div className="text-white font-bold text-center text-lg tracking-wide pb-6 border-b border-blue-900/40 whitespace-nowrap">
          {isOpen ? "ROF LMS" : "ROF"}
        </div>
        <SidebarNav
          isOpen={isOpen}
          label="Teacher portal"
          items={visibleNav(TEACHER_NAV, knownPermissions).map((item) => ({ href: item.href, label: item.label, icon: Users, active: isActive(item.href) }))}
        />
      </div>
      <SidebarUtilities isOpen={isOpen} settingsHref="/teacher/account" />
    </aside>
  );
}
