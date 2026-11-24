"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HelpCircle, Settings } from "lucide-react";
import SignOutButton from "./SignOutButton";

/**
 * The bottom block of every portal sidebar: Help (`/support`), Settings and
 * Sign Out. Settings opens the user's own settings (`/<portal>/account`) for
 * students, coaches and teachers, and the platform settings for administrators
 * (their own settings are in the profile menu).
 */
export default function SidebarUtilities({ isOpen, settingsHref }: { isOpen: boolean; settingsHref?: string }) {
  const pathname = usePathname();
  const item = (active: boolean) =>
    `flex items-center gap-3 w-full py-2.5 rounded-lg transition-all text-sm ${isOpen ? "px-4" : "justify-center px-0"} ${
      active ? "bg-white/10 text-white" : "hover:bg-white/5 text-slate-400 hover:text-white"
    }`;

  return (
    <div className="flex flex-col gap-2 pt-6 border-t border-white/10">
      <Link href="/support" title="Help" className={item(pathname === "/support")}>
        <HelpCircle className="h-4 w-4 flex-shrink-0" />
        {isOpen && <span className="whitespace-nowrap">Help</span>}
      </Link>

      {/* No href: the user may not open the settings (e.g. platform settings without settings.manage). */}
      {settingsHref && (
        <Link href={settingsHref} title="Settings" className={item(pathname.startsWith(settingsHref))}>
          <Settings className="h-4 w-4 flex-shrink-0" />
          {isOpen && <span className="whitespace-nowrap">Settings</span>}
        </Link>
      )}

      <SignOutButton isOpen={isOpen} />
    </div>
  );
}
