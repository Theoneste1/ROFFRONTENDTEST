/**
 * The profile menu of every portal (pure; unit-tested in tests/profile-menu.test.mjs): exactly
 * My Profile, Settings, User guide, Help and Support and Logout, in that order. Profile, Settings and the user guide
 * (read inside the system, owner 2026-11-28) open pages in the signed-in user's portal; Help and Support is the shared
 * /support page.
 */
import { portalPath, roleLabel } from "../auth/role-rules";

export type ProfileMenuKey = "profile" | "settings" | "guide" | "help" | "logout";

export interface ProfileMenuItem {
  key: ProfileMenuKey;
  label: string;
  /** Absent for Logout (an action, not a page). */
  href?: string;
}

export function profileMenuItems(role: string | null | undefined): ProfileMenuItem[] {
  return [
    { key: "profile", label: "My Profile", href: portalPath(role, "profile") },
    { key: "settings", label: "Settings", href: portalPath(role, "account") },
    { key: "guide", label: "User guide", href: portalPath(role, "guide") },
    { key: "help", label: "Help and Support", href: "/support" },
    { key: "logout", label: "Logout" },
  ];
}

/** The account title shown instead of the e-mail: "Student", "Coach", "Super Administrator", … */
export function accountTitle(role: string | null | undefined): string {
  return roleLabel(role);
}
