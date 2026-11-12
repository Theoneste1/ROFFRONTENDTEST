/**
 * Backend detection from the public `GET /api/v1` (no imports; unit-tested in
 * tests/capabilities.test.mjs).
 *
 * Contract: backend docs/INTEGRATION.md, "Backend capabilities (GET /api/v1)".
 * Every attempt is classified as exactly one of:
 * - LEGACY  — 200, a JSON object with name "ROF LMS API", string version /
 *   docs / health, and NO `capabilities` property (today's production backend);
 * - NEW     — the same fields plus `capabilities` = { schemaVersion: 1,
 *   roles: string[], features: string[] };
 * - UNKNOWN — everything else: network errors, timeouts, aborts, any status
 *   but 200, non-JSON or malformed bodies, missing / wrongly typed fields,
 *   `capabilities: null`, a schemaVersion other than 1, …
 *
 * UNKNOWN is never treated as LEGACY: callers use only what both backends
 * support (or wait / retry) until a definite answer arrives. Nothing is
 * inferred from HTTP status codes of other routes, from `version` (1.0.0 on
 * both backends), from user roles or from feature flags.
 *
 * Capabilities describe the BACKEND, the same for every viewer — never the
 * current user's permissions (that is `GET /me/permissions`).
 */

/** The `features` this frontend knows (schemaVersion 1). Unknown names in a response are ignored. */
export const KNOWN_FEATURES = [
  "permissionScopes",
  "schoolReferenceRequired",
  "schoolAdministration",
  "schoolAffiliations",
  /** Optional: the TEACHER role can currently be assigned (the caller still needs users.manageTeachers). */
  "teacherAccounts",
  /** Optional: the HEAD_COACH role can currently be assigned (the caller still needs users.manageHeadCoaches). */
  "headCoachAccounts",
] as const;
export type BackendFeature = (typeof KNOWN_FEATURES)[number];

export const CAPABILITIES_SCHEMA_VERSION = 1;
export const API_INFO_NAME = "ROF LMS API";
/** Longer than Netlify's 26-second proxy limit; a sleeping Render backend can take about a minute to wake. */
export const DETECTION_TIMEOUT_MS = 30_000;

export type BackendDetection =
  | { state: "LEGACY" }
  | { state: "NEW"; schemaVersion: 1; roles: readonly string[]; features: readonly string[] }
  | { state: "UNKNOWN"; reason: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const unknown = (reason: string): BackendDetection => ({ state: "UNKNOWN", reason });

/** Classifies one `GET /api/v1` answer: its HTTP status and raw body text. */
export function classifyApiInfo(status: number, bodyText: string | null): BackendDetection {
  if (status !== 200) return unknown(`status ${status}`);
  if (bodyText === null) return unknown("no body");
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return unknown("body is not JSON");
  }
  if (!isObject(body)) return unknown("body is not a JSON object");
  if (body.name !== API_INFO_NAME) return unknown("unexpected name");
  if (typeof body.version !== "string" || typeof body.docs !== "string" || typeof body.health !== "string") {
    return unknown("missing or invalid version / docs / health");
  }
  if (!Object.prototype.hasOwnProperty.call(body, "capabilities")) return { state: "LEGACY" };

  const caps = body.capabilities;
  if (!isObject(caps)) return unknown("capabilities is not an object");
  if (typeof caps.schemaVersion !== "number" || !Number.isInteger(caps.schemaVersion)) return unknown("schemaVersion is not an integer");
  if (caps.schemaVersion !== CAPABILITIES_SCHEMA_VERSION) return unknown(`unsupported schemaVersion ${caps.schemaVersion}`);
  if (!isStringArray(caps.roles)) return unknown("roles is not an array of strings");
  if (!isStringArray(caps.features)) return unknown("features is not an array of strings");
  return { state: "NEW", schemaVersion: CAPABILITIES_SCHEMA_VERSION, roles: [...caps.roles], features: [...caps.features] };
}

export interface DetectOptions {
  /** `fetch` (injected in tests). */
  fetch?: typeof fetch;
  /** Default `/api/v1` on this origin (the /api proxy). */
  url?: string;
  timeoutMs?: number;
  /** Cancels the request (e.g. the query was cancelled); counts as UNKNOWN. */
  signal?: AbortSignal;
}

/** Fetches `GET /api/v1` and classifies it. Never throws: every failure is UNKNOWN. */
export async function detectBackend({
  fetch: fetchFn = globalThis.fetch,
  url = "/api/v1",
  timeoutMs = DETECTION_TIMEOUT_MS,
  signal,
}: DetectOptions = {}): Promise<BackendDetection> {
  if (signal?.aborted) return unknown("aborted");
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetchFn(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit", // public; no cookie or token is needed
      cache: "no-store", // the answer changes with a deployment
      redirect: "manual", // a redirect is not the API information (3xx → UNKNOWN)
      signal: controller.signal,
    });
    const text = res.status === 200 ? await res.text() : null;
    return classifyApiInfo(res.status, text);
  } catch {
    return unknown(timedOut ? "timeout" : controller.signal.aborted ? "aborted" : "network error");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * True only on a NEW backend that lists the feature, and only for a feature
 * this frontend knows (KNOWN_FEATURES) — unknown names are ignored even if a
 * caller passes one. LEGACY and UNKNOWN: false.
 */
export function hasFeature(detection: BackendDetection | null | undefined, feature: BackendFeature): boolean {
  return (
    detection?.state === "NEW" &&
    (KNOWN_FEATURES as readonly string[]).includes(feature) &&
    detection.features.includes(feature)
  );
}

/** True only for a definite LEGACY answer — never for UNKNOWN or while loading. */
export function isLegacyBackend(detection: BackendDetection | null | undefined): boolean {
  return detection?.state === "LEGACY";
}

/** True only for a definite NEW answer. */
export function isNewBackend(detection: BackendDetection | null | undefined): boolean {
  return detection?.state === "NEW";
}

/**
 * Caching (shared, one request for the whole app): a definite answer is kept
 * for 5 minutes (a deployment can change it); UNKNOWN is never considered
 * fresh and is retried every 30 seconds while something uses it.
 */
export const DEFINITE_STALE_MS = 5 * 60_000;
export const UNKNOWN_RETRY_MS = 30_000;

export function staleTimeFor(detection: BackendDetection | undefined): number {
  return detection && detection.state !== "UNKNOWN" ? DEFINITE_STALE_MS : 0;
}

export function refetchIntervalFor(detection: BackendDetection | undefined): number | false {
  return detection?.state === "UNKNOWN" ? UNKNOWN_RETRY_MS : false;
}
