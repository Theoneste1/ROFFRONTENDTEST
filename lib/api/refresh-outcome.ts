/**
 * Session refresh rules, kept free of imports so they can be unit-tested with
 * `node --test` (tests/refresh.test.mjs). lib/api/client.ts wires them to
 * `fetch`, the Web Locks API and the access token.
 *
 * A refresh ends in one of three outcomes:
 * - `ok`: a new access token was issued;
 * - `rejected`: the backend definitively refused the refresh token (401/403:
 *   invalid, expired, revoked or reused). The session is over;
 * - `unavailable`: the server could not be reached or kept failing (network
 *   error, 429, 5xx) after the retries. This proves nothing about the session:
 *   the refresh cookie may still be valid, so the user must NOT be signed out.
 */

export type RefreshOutcome = "ok" | "rejected" | "unavailable";

export const REFRESH_ATTEMPTS = 3;

/** After an `unavailable` outcome, further refreshes answer `unavailable` at once for this long. */
export const UNAVAILABLE_COOLDOWN_MS = 15_000;

/** The longest `Retry-After` we wait between attempts. */
export const MAX_RETRY_AFTER_MS = 30_000;

/** One answer of `POST /auth/refresh`, as far as these rules need it. */
export interface RefreshResponse {
  status: number;
  /** The `Retry-After` header, if any. */
  retryAfter: string | null;
  /** The access token from a 2xx body, or null when the body has none. */
  accessToken: () => Promise<string | null>;
}

export interface AttemptDeps {
  /** Sends the refresh request. Throws on a network failure. */
  post: () => Promise<RefreshResponse>;
  /** Waits between attempts (injected so tests run instantly). */
  delay: (ms: number) => Promise<void>;
  attempts?: number;
}

/** The token is returned only with `ok`. */
export interface AttemptResult {
  outcome: RefreshOutcome;
  accessToken?: string;
}

/** A definite refusal: the session is invalid and retrying cannot help. */
export function isDefiniteRejection(status: number): boolean {
  return status === 401 || status === 403;
}

/** Worth retrying: rate limited or a server-side failure (502/503/504 on cold starts). */
export function isTransient(status: number): boolean {
  return status === 429 || status >= 500;
}

/** How long to wait before attempt `attempt + 1`. */
export function retryDelayMs(attempt: number, retryAfter: string | null): number {
  const seconds = Number(retryAfter);
  if (retryAfter !== null && retryAfter.trim() !== "" && Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }
  return 2000 * attempt;
}

/**
 * One refresh with retries. Network errors, 429 and 5xx are retried; 401/403
 * stop at once. Any other answer (an unexpected 4xx, or a 2xx without a
 * token) is not a definite rejection, so it counts as `unavailable`.
 */
export async function attemptRefresh({ post, delay, attempts = REFRESH_ATTEMPTS }: AttemptDeps): Promise<AttemptResult> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let res: RefreshResponse;
    try {
      res = await post();
    } catch {
      if (attempt === attempts) return { outcome: "unavailable" };
      await delay(1000 * attempt);
      continue;
    }

    if (res.status >= 200 && res.status < 300) {
      let token: string | null = null;
      try {
        token = await res.accessToken();
      } catch {
        token = null;
      }
      if (token) return { outcome: "ok", accessToken: token };
      return { outcome: "unavailable" };
    }
    if (isDefiniteRejection(res.status)) return { outcome: "rejected" };
    if (!isTransient(res.status)) return { outcome: "unavailable" };
    if (attempt === attempts) return { outcome: "unavailable" };
    await delay(retryDelayMs(attempt, res.retryAfter));
  }
  return { outcome: "unavailable" };
}

export interface Refresher {
  /** Concurrent callers share one refresh. Answers `unavailable` immediately during the cooldown. */
  refresh: () => Promise<RefreshOutcome>;
  /** Ends the cooldown, e.g. when the user presses "Try again". */
  clearCooldown: () => void;
}

export interface RefresherOptions {
  /** Runs one refresh (with its retries). */
  run: () => Promise<RefreshOutcome>;
  /** Serialises refreshes across tabs (Web Locks); identity when unavailable. */
  lock?: <T>(fn: () => Promise<T>) => Promise<T>;
  now?: () => number;
  cooldownMs?: number;
}

/**
 * Single-flight refresh with a cooldown after `unavailable`, so a page full of
 * failing queries cannot start a storm of refresh requests. A thrown error
 * inside `run` counts as `unavailable` (never as a rejection).
 */
export function createRefresher({
  run,
  lock = (fn) => fn(),
  now = () => Date.now(),
  cooldownMs = UNAVAILABLE_COOLDOWN_MS,
}: RefresherOptions): Refresher {
  let inflight: Promise<RefreshOutcome> | null = null;
  let unavailableUntil = 0;

  return {
    refresh() {
      if (inflight) return inflight;
      if (now() < unavailableUntil) return Promise.resolve<RefreshOutcome>("unavailable");
      inflight = lock(run)
        .catch((): RefreshOutcome => "unavailable")
        .then((outcome) => {
          unavailableUntil = outcome === "unavailable" ? now() + cooldownMs : 0;
          return outcome;
        })
        .finally(() => {
          inflight = null;
        });
      return inflight;
    },
    clearCooldown() {
      unavailableUntil = 0;
    },
  };
}

export interface SessionRefreshHooks<R extends { status: number }> {
  /** Sends the request with the current access token. */
  send: () => Promise<R>;
  refresh: () => Promise<RefreshOutcome>;
  /** The session is over: sign out locally. */
  onExpired: () => void;
  /** The error thrown when the session could not be renewed for a temporary reason. */
  unavailableError: () => Error;
}

/**
 * Sends a request; on 401 refreshes once and retries.
 * - refresh `ok`, retry still 401 → the backend refused a fresh token: sign out;
 * - refresh `rejected` → sign out;
 * - refresh `unavailable` → keep the session and throw `unavailableError()`.
 * The request is retried at most once, so this can never loop.
 */
export async function sendWithSessionRefresh<R extends { status: number }>({
  send,
  refresh,
  onExpired,
  unavailableError,
}: SessionRefreshHooks<R>): Promise<R> {
  const first = await send();
  if (first.status !== 401) return first;

  const outcome = await refresh();
  if (outcome === "ok") {
    const retried = await send();
    if (retried.status === 401) onExpired();
    return retried;
  }
  if (outcome === "rejected") {
    onExpired();
    return first;
  }
  throw unavailableError();
}
