'use client';

import PortalNavbar from "@/app/components/shell/PortalNavbar";

/** Mentor portal top bar (shared PortalNavbar). */
export default function Navbar({ onMenuClick }: { onMenuClick: () => void }) {
  return <PortalNavbar onMenuClick={onMenuClick} avatarClassName="bg-purple-600" />;
}
