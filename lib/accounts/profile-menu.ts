/**
 * The profile menu of every portal (pure; unit-tested in tests/profile-menu.test.mjs): exactly
 * My Profile, Settings, Help and Support and Logout, in that order. Profile and Settings open the
 * signed-in user's own pages in their portal; Help and Support is the shared /support page.
 */
import { portalPath, roleLabel } from "../auth/role-rules";

export type ProfileMenuKey = "profile" | "settings" | "help" | "logout";

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
    { key: "help", label: "Help and Support", href: "/support" },
    { key: "logout", label: "Logout" },
  ];
}

/** The account title shown instead of the e-mail: "Student", "Coach", "Super Administrator", … */
export function accountTitle(role: string | null | undefined): string {
  return roleLabel(role);
}
