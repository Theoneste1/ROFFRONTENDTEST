/**
 * Portals and labels per role. The rules themselves live in role-rules.ts
 * (all six roles and unknown values); this module adds the sign-in redirect.
 */
import { isDeepLinkPath } from "@/lib/notifications/links";
import { portalHome, portalPrefix } from "./role-rules";

export {
  NO_ACCESS_PATH,
  ROLE_LABEL,
  hasNotificationTypeSettings,
  hasPortal,
  isAdministrative,
  portalHome,
  portalPath,
  portalPrefix,
  roleLabel,
  sharesPortal,
} from "./role-rules";

/**
 * Where to go after signing in. A `next` path is honoured only when it is an
 * internal path inside the user's own portal (no open redirects, no landing a
 * student on an admin URL), or a role-neutral notification link such as
 * `/discussions/:id`, which then redirects to the role's own page. A role
 * without a portal always goes to the "no access configured" page.
 */
export function postLoginPath(role: string | null | undefined, next: string | null | undefined): string {
  const prefix = portalPrefix(role);
  if (!prefix) return portalHome(role);
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")) {
    if (next === prefix || next.startsWith(prefix + "/")) return next;
    if (isDeepLinkPath(next.split("?")[0])) return next;
  }
  return portalHome(role);
}
