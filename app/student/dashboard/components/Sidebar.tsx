'use client';

import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Trophy,
  BookOpen,
  FileText,
  Library,
  FileQuestion,
  Award
} from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { STUDENT_RESULTS, STUDENT_TESTS } from "@/lib/auth/navigation";
import { resultsNavVisible } from "@/lib/test-management/results";
import { answerNavVisible } from "@/lib/test-management/submissions";
import SidebarUtilities from "@/app/components/shell/SidebarUtilities";
import SidebarNav from "@/app/components/shell/SidebarNav";

interface SidebarProps {
  isOpen: boolean;
}

export default function Sidebar({ isOpen }: SidebarProps) {
  const pathname = usePathname();
  // Shown while permissions load (menus follow /me/permissions once known); the API enforces access.
  const { knownPermissions } = useSession();
  const showResources = !knownPermissions || knownPermissions.has("resources.view");
  // My tests: a backend with `testSubmissions` AND the known tests.submit (lib/test-management/submissions.ts).
  const { detection } = useBackendCapabilities();
  const showTests = answerNavVisible(detection, knownPermissions, "tests.submit");
  // My results: a backend with `testResults` AND the known tests.viewOwnResults (lib/test-management/results.ts).
  const showResults = resultsNavVisible(detection, knownPermissions, "tests.viewOwnResults");

  // Function to check if link is active
  const isActive = (path: string) => {
    if (path === "/student/dashboard") {
      return pathname === "/student/dashboard";
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
          label="Student portal"
          items={[
            { href: "/student/dashboard", label: "Dashboard", icon: LayoutGrid, active: isActive("/student/dashboard") },
            { href: "/student/leaderboard", label: "Leaderboard", icon: Trophy, active: isActive("/student/leaderboard") },
            { href: "/student/courses", label: "Courses", icon: BookOpen, active: isActive("/student/courses") },
            ...(showResources ? [{ href: "/student/resources", label: "Resources", icon: Library, active: isActive("/student/resources") }] : []),
            {
              href: "/student/assignments", label: "Assignments", icon: FileText, active: isActive("/student/assignments"),
              children: [
                { href: "/student/assignments", label: "All Assignments", active: pathname === "/student/assignments" },
                { href: "/student/assignments/results", label: "Results", active: pathname === "/student/assignments/results" },
              ],
            },
            ...(showTests ? [{ href: STUDENT_TESTS.href, label: STUDENT_TESTS.label, icon: FileQuestion, active: isActive(STUDENT_TESTS.href) }] : []),
            ...(showResults ? [{ href: STUDENT_RESULTS.href, label: STUDENT_RESULTS.label, icon: Award, active: isActive(STUDENT_RESULTS.href) }] : []),
          ]}
        />
      </div>

      {/* BOTTOM UTILITY LINKS */}
      <SidebarUtilities isOpen={isOpen} settingsHref="/student/account" />
    </aside>
  );
}