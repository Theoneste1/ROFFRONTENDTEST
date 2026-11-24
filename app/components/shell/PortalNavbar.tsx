'use client';

/** The portal top bar (menu toggle, ROF logo linking to the ROF website, notification bell, profile menu), shared by the portals. */

import Link from "next/link";
import type { Ref } from "react";
import { Menu } from "lucide-react";
import ProfileMenu from "@/app/components/shell/ProfileMenu";
import NotificationBell from "@/app/components/notifications/NotificationBell";
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
    <div className="h-20 w-full flex items-center justify-between gap-2 px-3 sm:px-4 md:px-6">
      {/* LEFT SIDE */}
      <div className="flex items-center gap-2 sm:gap-3 md:gap-5 min-w-0">
        {/* Hamburger Menu Button */}
        <button
          ref={menuButtonRef}
          type="button"
          onClick={onMenuClick}
          className="p-1.5 text-brand hover:bg-canvas rounded-md border border-transparent hover:border-line transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 flex-shrink-0"
          aria-label="Toggle Sidebar"
          aria-expanded={menuExpanded}
          aria-controls={menuControls}
        >
          <Menu className="h-6 w-6 text-brand cursor-pointer" />
        </button>

        {/* Logo + Text: opens the ROF LMS home page (owner, 2026-11-20: never the foundation's website) */}
        <Link
          href="/"
          aria-label="ROF LMS home page"
          data-testid="rof-logo-link"
          className="flex items-center gap-2 md:gap-4 min-w-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
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
            <div className="font-serif text-[1.75rem] md:text-[2rem] font-medium tracking-tight text-brand leading-none pr-2 md:pr-3">
              ROF
            </div>
            {/* The full name is secondary: hidden on the narrowest phones so the bar never overflows. */}
            <div className="hidden min-[400px]:block h-7 md:h-9 w-px bg-line" />
            <div className="hidden min-[400px]:block text-[10px] md:text-[0.6875rem] font-bold tracking-[0.08em] text-muted uppercase leading-tight pl-2 md:pl-3">
              <div>Rwanda</div>
              <div>Olympiad</div>
              <div>Foundation</div>
            </div>
          </div>
        </Link>
      </div>

      {/* RIGHT SIDE */}
      <div className="flex items-center gap-2 sm:gap-3 md:gap-6 flex-shrink-0">
        <NotificationBell />

        <ProfileMenu />
      </div>
    </div>
  );
}
