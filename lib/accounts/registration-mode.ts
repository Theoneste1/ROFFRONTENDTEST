/**
 * Which student-registration form to show, from the backend detection
 * (GET /api/v1, lib/api/capabilities):
 *
 *   detection not answered yet   → "loading": no form (fields and validation aren't known yet)
 *   LEGACY                       → legacy school name + location
 *   NEW with schoolAffiliations  → the school directory (code / not listed / abroad)
 *   NEW without it               → legacy fields
 *   UNKNOWN (failed or timed out)→ "failed": say so, offer a retry — and continuing with the
 *                                  legacy fields, which every backend accepts
 *
 * Once a form is chosen the page keeps it (see RegisterForm): a later refetch
 * must not swap the fields under someone who is typing.
 */
import { hasFeature, type BackendDetection } from "../api/capabilities";

export type RegistrationSchoolMode = "directory" | "legacy";

export type RegistrationGate =
  | { state: "loading" }
  | { state: "failed"; reason: string }
  | { state: "ready"; mode: RegistrationSchoolMode };

/** `fetching`: a request is in flight (first load or a retry). */
export function registrationGate(detection: BackendDetection | undefined, fetching: boolean): RegistrationGate {
  if (!detection || (detection.state === "UNKNOWN" && fetching)) return { state: "loading" };
  if (detection.state === "UNKNOWN") return { state: "failed", reason: detection.reason };
  if (detection.state === "LEGACY") return { state: "ready", mode: "legacy" };
  return { state: "ready", mode: hasFeature(detection, "schoolAffiliations") ? "directory" : "legacy" };
}
