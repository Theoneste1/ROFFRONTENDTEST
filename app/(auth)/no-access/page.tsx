import type { Metadata } from "next";
import NoAccess from "./NoAccess";

export const metadata: Metadata = { title: "No access configured" };

/**
 * For signed-in accounts whose role has no portal on this site yet (Teacher,
 * Head Coach) or that this version does not know. Not behind a RoleGate, so
 * redirects to it can never loop.
 */
export default function NoAccessPage() {
  return <NoAccess />;
}
