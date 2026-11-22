'use client';

import React from "react";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  LayoutGrid,
  Users,
  GraduationCap,
  UserCircle,
  FolderTree,
  CalendarRange,
  BookOpen,
  FileText,
  Award,
  BarChart3,
  ScrollText,
  ShieldAlert,
  Inbox,
  School,
  UserPlus,
  MailCheck,
  ClipboardList,
  Globe,
  FileQuestion
} from "lucide-react";
import SidebarUtilities from "@/app/components/shell/SidebarUtilities";
import SidebarNav from "@/app/components/shell/SidebarNav";
import { useSession } from "@/lib/auth/session";
import { ADMIN_COUNTRIES, ADMIN_FORMS, ADMIN_NAV, ADMIN_NOTIFICATION_DELIVERIES, ADMIN_SETTINGS, ADMIN_TEACHER_APPLICATIONS, ADMIN_TESTS, ADMIN_CUSTOM_REPORTS, canSeeNavItem, visibleNav } from "@/lib/auth/navigation";
import { customReportsNavVisible } from "@/lib/reports/custom-reports";
import { testsNavVisible } from "@/lib/test-management/rules";
import { countriesNavVisible } from "@/lib/countries/reference";
import { teacherApplicationsNavVisible } from "@/lib/admin/teacher-applications";
import { notificationDeliveriesNavVisible } from "@/lib/admin/notification-deliveries";
import { formsNavVisible } from "@/lib/admin/form-availability";
import { useBackendCapabilities } from "@/lib/queries/capabilities";

interface SidebarProps {
  isOpen: boolean;
}

const ICONS: Record<string, LucideIcon> = {
  "/admin/dashboard": LayoutGrid,
  "/admin/users": Users,
  "/admin/mentors": GraduationCap,
  "/admin/students": UserCircle,
  "/admin/schools": School,
  "/admin/divisions": FolderTree,
  "/admin/academic-years": CalendarRange,
  "/admin/courses": BookOpen,
  "/admin/assignments": FileText,
  "/admin/results": Award,
  "/admin/reports": BarChart3,
  "/admin/audit-log": ScrollText,
  "/admin/moderation": ShieldAlert,
  "/admin/messages": Inbox,
  "/admin/teacher-applications": UserPlus,
  "/admin/notification-deliveries": MailCheck,
  "/admin/forms": ClipboardList,
  "/admin/countries": Globe,
  "/admin/tests": FileQuestion,
  "/admin/custom-reports": BarChart3,
};

/**
 * The administrator portal menu (Administrators and Super Administrators).
 * Items follow `GET /me/permissions` (lib/auth/navigation.ts): an item whose
 * permission the user does not hold — e.g. removed by a Super Admin's DENY
 * override — is hidden. Navigation only; the API enforces every permission.
 */
export default function Sidebar({ isOpen }: SidebarProps) {
  const pathname = usePathname();
  const { knownPermissions } = useSession();
  const { detection } = useBackendCapabilities();
  // Teacher applications: only with the backend feature AND the (known) users.manageTeachers.
  const items = [
    ...visibleNav(ADMIN_NAV, knownPermissions),
    ...(teacherApplicationsNavVisible(detection, knownPermissions) ? [ADMIN_TEACHER_APPLICATIONS] : []),
    // Notification deliveries: the backend feature AND the known email.bulkSend (lib/admin/notification-deliveries.ts).
    ...(notificationDeliveriesNavVisible(detection, knownPermissions) ? [ADMIN_NOTIFICATION_DELIVERIES] : []),
    // Forms: the backend feature AND the known forms.view (lib/admin/form-availability.ts).
    ...(formsNavVisible(detection, knownPermissions) ? [ADMIN_FORMS] : []),
    // Countries: the backend feature AND the known reference.manage (lib/countries/reference.ts).
    ...(countriesNavVisible(detection, knownPermissions) ? [ADMIN_COUNTRIES] : []),
    // Tests: the backend feature AND the known tests.view (lib/test-management/rules.ts).
    ...(testsNavVisible(detection, knownPermissions) ? [ADMIN_TESTS] : []),
    // Custom reports: the backend feature AND the known reports.build.
    ...(customReportsNavVisible(detection, knownPermissions, true) ? [ADMIN_CUSTOM_REPORTS] : []),
  ];

  // Function to check if link is active
  const isActive = (path: string) => {
    if (path === "/admin/dashboard") {
      return pathname === "/admin/dashboard";
    }
    return pathname.startsWith(path);
  };

  return (
    <aside
      className={`${isOpen ? 'w-64 px-4' : 'w-20 px-3'
        } h-full bg-brand-950 text-slate-400 flex flex-col justify-between py-6 select-none transition-all duration-300 ease-in-out`}
    >
      {/* TOP NAVIGATION LINKS */}
      <div className="flex-1 min-h-0 flex flex-col gap-3">
        {/* Title Header */}
        <div className="text-white font-bold text-center text-lg tracking-wide pb-6 border-b border-blue-900/40 whitespace-nowrap">
          {isOpen ? "ROF LMS" : "ROF"}
        </div>

        {/* What fits is shown; the rest is under "More" (all portals: app/components/shell/SidebarNav.tsx). */}
        <SidebarNav
          isOpen={isOpen}
          label="Administration"
          items={items.map((item) => ({ href: item.href, label: item.label, icon: ICONS[item.href] ?? LayoutGrid, active: isActive(item.href) }))}
        />
      </div>

      {/* BOTTOM UTILITY LINKS */}
      <SidebarUtilities isOpen={isOpen} settingsHref={canSeeNavItem(ADMIN_SETTINGS, knownPermissions) ? ADMIN_SETTINGS.href : undefined} />
    </aside>
  );
}
