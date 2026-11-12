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
  /** Ends the cooldown (this tab's and the shared one), e.g. when the user presses "Try again". */
  clearCooldown: () => void;
}

/**
 * A cooldown shared by the tabs of the browser (localStorage in the app), as
 * best-effort coordination: another tab may briefly read an older value (see
 * createRefresher). It holds only a timestamp — never a token. Any of these
 * may throw (storage disabled, private mode, quota); the refresher then falls
 * back to the per-tab cooldown.
 */
export interface SharedCooldown {
  /** The shared "unavailable until" time (ms), or null when none is set. */
  get: () => number | null;
  set: (until: number) => void;
  clear: () => void;
}

export interface RefresherOptions {
  /** Runs one refresh (with its retries). */
  run: () => Promise<RefreshOutcome>;
  /** Serialises refreshes across tabs (Web Locks); identity when unavailable. */
  lock?: <T>(fn: () => Promise<T>) => Promise<T>;
  /** The cross-tab cooldown; without it each tab only has its own. */
  shared?: SharedCooldown;
  now?: () => number;
  cooldownMs?: number;
}

/** Calls a storage operation; a failure means "no shared cooldown" (per-tab fallback). */
function tryStorage<T>(op: () => T): T | null {
  try {
    return op();
  } catch {
    return null;
  }
}

/**
 * Single-flight refresh with a cooldown after `unavailable`, so a page full of
 * failing queries cannot start a storm of refresh requests. A thrown error
 * inside `run` counts as `unavailable` (never as a rejection).
 *
 * Across tabs (best effort): the refresh runs inside the lock. The holder
 * first reads the shared cooldown and, while it is active, answers
 * `unavailable` without a request; after a refresh it writes (unavailable) or
 * clears (ok, rejected) the shared cooldown before releasing the lock. When
 * several tabs queue during an outage, later tabs usually learn the outcome
 * from it and skip their own retry cycle.
 *
 * This is NOT guaranteed. The Web Lock serialises cooperating tabs, but it
 * does not make localStorage changes visible to other tabs at once: Chromium
 * propagates them asynchronously, so a tab that takes the lock right after a
 * write can still read the old value (measured: 11 of 40 immediate reads).
 * Such a tab misses the shared cooldown and makes its own retry cycle — the
 * per-tab behaviour. That costs extra refresh requests, never the session or
 * any data.
 */
export function createRefresher({
  run,
  lock = (fn) => fn(),
  shared,
  now = () => Date.now(),
  cooldownMs = UNAVAILABLE_COOLDOWN_MS,
}: RefresherOptions): Refresher {
  let inflight: Promise<RefreshOutcome> | null = null;
  let unavailableUntil = 0;

  /** The active shared cooldown's end, ignoring missing, expired or implausible values. */
  function sharedUntil(): number {
    if (!shared) return 0;
    const until = tryStorage(shared.get);
    const t = now();
    // A value further ahead than one cooldown was not written by this code
    // (edited storage, clock change): ignore it rather than block refreshing.
    if (typeof until !== "number" || !Number.isFinite(until) || until <= t || until > t + cooldownMs) return 0;
    return until;
  }

  /** Inside the lock: shared cooldown check, the refresh, then record the outcome for other tabs. */
  async function lockedRefresh(): Promise<{ outcome: RefreshOutcome; until?: number }> {
    const until = sharedUntil();
    if (until) return { outcome: "unavailable", until };
    let outcome: RefreshOutcome;
    try {
      outcome = await run();
    } catch {
      outcome = "unavailable";
    }
    if (shared) {
      if (outcome === "unavailable") {
        const end = now() + cooldownMs;
        tryStorage(() => shared.set(end));
        return { outcome, until: end };
      }
      tryStorage(shared.clear);
    }
    return { outcome };
  }

  return {
    refresh() {
      if (inflight) return inflight;
      if (now() < unavailableUntil) return Promise.resolve<RefreshOutcome>("unavailable");
      inflight = lock(lockedRefresh)
        .catch((): { outcome: RefreshOutcome; until?: number } => ({ outcome: "unavailable" }))
        .then(({ outcome, until }) => {
          unavailableUntil = outcome === "unavailable" ? (until ?? now() + cooldownMs) : 0;
          return outcome;
        })
        .finally(() => {
          inflight = null;
        });
      return inflight;
    },
    clearCooldown() {
      unavailableUntil = 0;
      if (shared) tryStorage(shared.clear);
    },
  };
}

/**
 * Runs a sign-in and, only once it has succeeded, ends the refresh cooldown
 * (`clearCooldown`): a successful sign-in proves the server is reachable, so
 * an "unavailable" cooldown left from an outage must not hold back the next
 * refresh. A failed sign-in rethrows its error and leaves the cooldown as it is.
 */
export async function signInThenClearCooldown<T>(signIn: () => Promise<T>, clearCooldown: () => void): Promise<T> {
  const result = await signIn();
  clearCooldown();
  return result;
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
