'use client';

import { usePathname } from "next/navigation";
import { Award, FileQuestion, Table2, Users } from "lucide-react";
import SidebarUtilities from "@/app/components/shell/SidebarUtilities";
import SidebarNav from "@/app/components/shell/SidebarNav";
import { useSession } from "@/lib/auth/session";
import { TEACHER_NAV, TEACHER_RESULTS, TEACHER_SHARED_REPORTS, TEACHER_TESTS, visibleNav } from "@/lib/auth/navigation";
import { customReportsNavVisible } from "@/lib/reports/custom-reports";
import { resultsNavVisible } from "@/lib/test-management/results";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { answerNavVisible } from "@/lib/test-management/submissions";

/** The teacher portal menu (same look as the coach portal; items follow /me/permissions). */
export default function Sidebar({ isOpen }: { isOpen: boolean }) {
  const pathname = usePathname();
  const { knownPermissions } = useSession();
  const isActive = (href: string) => (href === "/teacher/dashboard" ? pathname === href || pathname.startsWith("/teacher/students") : pathname.startsWith(href));
  // Tests (G2): a backend with `testSubmissions` AND the known tests.submitForStudents.
  const { detection } = useBackendCapabilities();
  // Results (Phase 4): a backend with `testResults` AND the known tests.viewSchoolResults.
  const items = [
    ...visibleNav(TEACHER_NAV, knownPermissions),
    ...(answerNavVisible(detection, knownPermissions, "tests.submitForStudents") ? [TEACHER_TESTS] : []),
    ...(resultsNavVisible(detection, knownPermissions, "tests.viewSchoolResults") ? [TEACHER_RESULTS] : []),
    ...(customReportsNavVisible(detection, knownPermissions, false) ? [TEACHER_SHARED_REPORTS] : []),
  ];
  const iconOf = (href: string) => (href === TEACHER_TESTS.href ? FileQuestion : href === TEACHER_RESULTS.href ? Award : href === TEACHER_SHARED_REPORTS.href ? Table2 : Users);

  return (
    <aside
      className={`${isOpen ? "w-64 px-4" : "w-20 px-3"} h-full bg-brand-950 text-slate-400 flex flex-col justify-between py-6 select-none transition-all duration-300 ease-in-out`}
    >
      <div className="flex-1 min-h-0 flex flex-col gap-3">
        <div className="text-white font-bold text-center text-lg tracking-wide pb-6 border-b border-blue-900/40 whitespace-nowrap">
          {isOpen ? "ROF LMS" : "ROF"}
        </div>
        <SidebarNav
          isOpen={isOpen}
          label="Teacher portal"
          items={items.map((item) => ({ href: item.href, label: item.label, icon: iconOf(item.href), active: isActive(item.href) }))}
        />
      </div>
      <SidebarUtilities isOpen={isOpen} settingsHref="/teacher/account" />
    </aside>
  );
}
