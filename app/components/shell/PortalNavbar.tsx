'use client';

/** The portal top bar (menu toggle, the ROF logo — a click signs out and opens the home page —, notification bell, profile menu), shared by the portals. */

import LogoLink from "@/app/components/shell/LogoLink";
import type { Ref } from "react";
import { Menu } from "lucide-react";
import ProfileMenu from "@/app/components/shell/ProfileMenu";
import NotificationBell from "@/app/components/notifications/NotificationBell";
import PageHelp from "@/app/components/help/PageHelp";
import Image from "@/app/components/ui/Image";

interface NavbarProps {
  onMenuClick: () => void;
  menuButtonRef?: Ref<HTMLButtonElement>;
  /** Whether the menu the hamburger controls is open (aria-expanded). */
  menuExpanded?: boolean;
  /** The id of the menu the hamburger controls (aria-controls). */
  menuControls?: string;
}

export default function PortalNavbar({ onMenuClick, menuButtonRef, menuExpanded, menuControls }: NavbarProps) {
  return (
    <div className="h-20 w-full flex items-center justify-between gap-2 px-3 sm:px-4 md:px-6 border-blue-200">
      {/* LEFT SIDE */}
      <div className="flex items-center gap-2 sm:gap-3 md:gap-5 min-w-0">
        {/* Hamburger Menu Button */}
        <button
          ref={menuButtonRef}
          type="button"
          onClick={onMenuClick}
          className="p-1 hover:bg-gray-200/50 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 flex-shrink-0"
          aria-label="Toggle Sidebar"
          aria-expanded={menuExpanded}
          aria-controls={menuControls}
        >
          <Menu className="h-6 w-6 text-gray-700 cursor-pointer" />
        </button>

        {/* Logo + Text: opens the ROF LMS home page (owner, 2026-11-20: never the foundation's website) */}
        <LogoLink testId="rof-logo-link" className="flex items-center gap-2 md:gap-4 min-w-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
          <div className="h-10 w-10 md:h-12 md:w-12 rounded-full overflow-hidden flex-shrink-0">
            <Image
              src="/logo.png"
              alt=""
              width={48}
              height={48}
              className="h-full w-full object-cover"
            />
          </div>

          <div className="flex items-center min-w-0">
            <div className="text-2xl md:text-3xl font-extrabold tracking-tight text-gray-900 leading-none pr-2 md:pr-3">
              ROF
            </div>
            {/* The full name is secondary: hidden on the narrowest phones so the bar never overflows. */}
            <div className="hidden min-[400px]:block h-7 md:h-9 w-px bg-gray-400" />
            <div className="hidden min-[400px]:block text-[10px] md:text-xs font-bold tracking-wide text-gray-800 uppercase leading-tight pl-2 md:pl-3">
              <div>Rwanda</div>
              <div>Olympiad</div>
              <div>Foundation</div>
            </div>
          </div>
        </LogoLink>
      </div>

      {/* RIGHT SIDE */}
      <div className="flex items-center gap-2 sm:gap-3 md:gap-6 flex-shrink-0">
        <PageHelp />

        <NotificationBell />

        <ProfileMenu />
      </div>
    </div>
  );
}
