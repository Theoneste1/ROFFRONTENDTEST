/**
 * The one HTTP client for the ROF LMS API.
 *
 * - Requests go to `/api/v1/...` on this origin; next.config.ts proxies them
 *   to the backend.
 * - The access token (15 min) lives in memory only. The refresh token is the
 *   backend's httpOnly cookie `rof_refresh`; this code never reads it.
 * - On a 401 the client refreshes once and retries the request. Only a
 *   definite refusal (401/403 from /auth/refresh, or a 401 right after a
 *   successful refresh) ends the session; listeners are told and the session
 *   provider shows the login page. A temporary failure (network, 429, 5xx)
 *   keeps the session and throws `SESSION_REFRESH_UNAVAILABLE` instead.
 * - Refresh tokens rotate on every use and a reused token revokes the whole
 *   session, so refreshes are single-flight within a tab and serialised
 *   across tabs with the Web Locks API.
 */
import { ApiError } from "./errors";
import {
  UPLOAD_TOKEN_MARGIN_MS,
  attemptRefresh,
  createRefresher,
  sendWithSessionRefresh,
  tokenExpiresWithin,
  type RefreshOutcome,
  type SharedCooldown,
} from "./refresh-outcome";
import { isMarkedSignedOut } from "../auth/signed-out";
import { UPLOAD_ORIGIN } from "./upload-origin";
import { trackUpload } from "./upload-progress";
import type { TokenResponse } from "./types";

export const API_BASE = "/api/v1";

// ─── Access token (memory only) ─────────────────────────────────────────────

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

type ExpiredListener = () => void;
const expiredListeners = new Set<ExpiredListener>();

/** Called when the session can no longer be refreshed. Returns an unsubscribe. */
export function onSessionExpired(listener: ExpiredListener): () => void {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
}

function notifyExpired() {
  accessToken = null;
  expiredListeners.forEach((l) => l());
}

// ─── Refresh ────────────────────────────────────────────────────────────────
//
// The rules (outcomes, retries, single flight, cooldown) live in
// refresh-outcome.ts. Only a definite rejection (401/403) means "signed out";
// a rate limit (429), a server error or a network failure is retried and, if
// it persists, reported as `unavailable` — the refresh cookie may still be
// valid, so the session is kept.

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** One POST /auth/refresh (the httpOnly cookie carries the refresh token). */
async function postRefresh() {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  return {
    status: res.status,
    retryAfter: res.headers.get("retry-after"),
    accessToken: async () => ((await res.json()) as Partial<TokenResponse>).access_token ?? null,
  };
}

async function runRefresh(): Promise<RefreshOutcome> {
  // Signed out on this device (lib/auth/signed-out.ts): never revive the session
  // from the cookie — also not when a refresh was already on its way while the
  // user (or another tab) signed out.
  if (isMarkedSignedOut()) return "rejected";
  const result = await attemptRefresh({ post: postRefresh, delay });
  if (isMarkedSignedOut()) {
    accessToken = null;
    return "rejected";
  }
  if (result.outcome === "ok" && result.accessToken) accessToken = result.accessToken;
  return result.outcome;
}

function withCrossTabLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && "locks" in navigator && navigator.locks) {
    return navigator.locks.request("rof-auth-refresh", fn) as Promise<T>;
  }
  return fn();
}

/**
 * The cross-tab refresh cooldown: only a timestamp ("unavailable until"),
 * never a token. Read and written inside the Web Lock (refresh-outcome.ts).
 * Best effort: the lock orders the tabs, but another tab may still read an
 * older localStorage value right after a write, then makes its own retry
 * cycle (more requests, never a sign-out). Every call may throw (no window,
 * storage disabled); the refresher then keeps the per-tab cooldown only.
 */
const REFRESH_COOLDOWN_KEY = "rof-refresh-unavailable-until";

const sharedRefreshCooldown: SharedCooldown = {
  get: () => {
    const raw = window.localStorage.getItem(REFRESH_COOLDOWN_KEY);
    return raw === null ? null : Number(raw);
  },
  set: (until) => window.localStorage.setItem(REFRESH_COOLDOWN_KEY, String(until)),
  clear: () => window.localStorage.removeItem(REFRESH_COOLDOWN_KEY),
};

const refresher = createRefresher({ run: runRefresh, lock: withCrossTabLock, shared: sharedRefreshCooldown });

/**
 * Exchange the refresh cookie for a new access token: `ok`, `rejected` (no
 * valid session) or `unavailable` (temporary failure; try again later).
 * Concurrent callers share one request, serialised across tabs.
 */
export function refreshSession(): Promise<RefreshOutcome> {
  return refresher.refresh();
}

/**
 * Allow an immediate refresh again, e.g. when the user presses "Try again":
 * ends this tab's cooldown and the shared one (other tabs keep their own
 * in-memory cooldown, at most 15 s).
 */
export function clearRefreshCooldown(): void {
  refresher.clearCooldown();
}

/** Thrown when the session could not be renewed for a temporary reason (the user stays signed in). */
export const SESSION_REFRESH_UNAVAILABLE = "SESSION_REFRESH_UNAVAILABLE";

/** The error for a session that could not be renewed for a temporary reason (also used by the session provider). */
export function refreshUnavailableError(): ApiError {
  return new ApiError(503, SESSION_REFRESH_UNAVAILABLE, "Can't reach the server to renew your session. Please try again.");
}

// ─── Requests ───────────────────────────────────────────────────────────────

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions extends Omit<RequestInit, "body"> {
  /** JSON-serialisable value or FormData (multipart uploads). */
  body?: unknown;
  /** Query parameters; undefined, null and "" are skipped. */
  query?: Record<string, QueryValue>;
  /** Send the bearer token and refresh on 401 (default true). */
  auth?: boolean;
  /**
   * With `auth`: refresh the session and retry once on 401 (default true).
   * False sends the bearer token if there is one but never refreshes — for
   * logout, which the server authenticates by the refresh cookie (H1).
   */
  refresh?: boolean;
}

/**
 * Whether a request refreshes the session and retries on 401. Every
 * authenticated call does — including /auth/logout-all and /auth/password
 * (M1: they failed with 401 once the 15-minute access token had expired) —
 * except where `refresh: false` says otherwise.
 */
export function refreshesOnUnauthorized(opts: Pick<RequestOptions, "auth" | "refresh">): boolean {
  return (opts.auth ?? true) && (opts.refresh ?? true);
}

export function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const { body, query, auth = true, refresh, headers: initHeaders, ...init } = opts;
  void refresh; // not a fetch option: used by sendWithRefresh only
  const headers = new Headers(initHeaders);
  headers.set("Accept", headers.get("Accept") ?? "application/json");
  if (auth && accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body; // the browser sets the multipart boundary
  } else if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }

  // Uploads go straight to the backend when configured (see upload-origin.ts);
  // no cookies are sent across origins.
  const direct = body instanceof FormData && UPLOAD_ORIGIN !== "";
  const url = direct ? `${UPLOAD_ORIGIN}${buildUrl(path, query)}` : buildUrl(path, query);

  if (body instanceof FormData && typeof XMLHttpRequest !== "undefined") {
    return sendMultipart(url, init.method ?? "POST", headers, body, !direct, init.signal ?? undefined);
  }

  try {
    return await fetch(url, { ...init, headers, body: payload, credentials: direct ? "omit" : "include" });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Cannot reach the server.");
  }
}

function formSize(form: FormData): number {
  let size = 0;
  form.forEach((value) => {
    size += typeof value === "string" ? value.length : value.size;
  });
  return size;
}

/**
 * Multipart uploads use XMLHttpRequest (fetch cannot report upload progress)
 * and resolve to an ordinary `Response`, so callers handle them like any other.
 */
function sendMultipart(
  url: string,
  method: string,
  headers: Headers,
  form: FormData,
  withCredentials: boolean,
  signal?: AbortSignal,
): Promise<Response> {
  const tracker = trackUpload(formSize(form));
  return new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const onSignalAbort = () => xhr.abort();
    // Every way out ends the progress entry and drops the abort listener once.
    let finished = false;
    const finish = () => {
      if (finished) return false;
      finished = true;
      tracker.done();
      signal?.removeEventListener("abort", onSignalAbort);
      return true;
    };
    const fail = () => {
      if (finish()) reject(new ApiError(0, "NETWORK_ERROR", "Cannot reach the server."));
    };
    const cancelled = () => {
      if (finish()) reject(new DOMException("The upload was cancelled.", "AbortError"));
    };

    if (signal?.aborted) return cancelled();

    xhr.onerror = fail;
    xhr.ontimeout = fail;
    xhr.onabort = cancelled;
    xhr.onload = () => {
      if (!finish()) return;
      const responseHeaders = new Headers();
      for (const line of xhr.getAllResponseHeaders().trim().split(/[\r\n]+/)) {
        const i = line.indexOf(":");
        if (i > 0) responseHeaders.append(line.slice(0, i).trim(), line.slice(i + 1).trim());
      }
      const noBody = xhr.status === 204 || xhr.status === 205 || xhr.status === 304;
      resolve(new Response(noBody ? null : (xhr.response as Blob), { status: xhr.status, statusText: xhr.statusText, headers: responseHeaders }));
    };

    try {
      xhr.open(method, url);
      xhr.withCredentials = withCredentials;
      xhr.responseType = "blob";
      headers.forEach((value, key) => xhr.setRequestHeader(key, value));
      xhr.upload.onprogress = (e) => tracker.progress(e.loaded, e.lengthComputable ? e.total : 0);
      signal?.addEventListener("abort", onSignalAbort, { once: true });
      xhr.send(form);
    } catch {
      // open / setRequestHeader / send threw synchronously: no event will follow.
      fail();
    }
  });
}

async function toError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => null);
  return ApiError.fromBody(res.status, body, res.statusText || "Request failed");
}

/**
 * Send a request, refreshing the session once if the access token expired.
 * Signs out only on a definite rejection; a temporary refresh failure throws
 * `SESSION_REFRESH_UNAVAILABLE` and keeps the session.
 */
async function sendWithRefresh(path: string, opts: RequestOptions): Promise<Response> {
  if (!refreshesOnUnauthorized(opts)) return send(path, opts);
  // Uploads: refresh first when the token is missing or about to expire, so a
  // large body is not sent with a dead token (rejected with 401, then sent
  // again — or cut off by the server, which looks like a network error).
  if (opts.body instanceof FormData && tokenExpiresWithin(accessToken, UPLOAD_TOKEN_MARGIN_MS)) {
    const outcome = await refreshSession();
    if (outcome === "rejected") {
      notifyExpired();
      throw new ApiError(401, "UNAUTHORIZED", "Your session has ended. Please sign in again.");
    }
    if (outcome === "unavailable") throw refreshUnavailableError();
  }
  return sendWithSessionRefresh({
    send: () => send(path, opts),
    refresh: refreshSession,
    onExpired: notifyExpired,
    unavailableError: refreshUnavailableError,
  });
}

/** Call the API and parse JSON. Throws `ApiError` on any non-2xx answer. */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await sendWithRefresh(path, opts);
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("application/json") ? res.json() : res.text()) as Promise<T>;
}

// ─── Files ──────────────────────────────────────────────────────────────────

export interface DownloadedFile {
  blob: Blob;
  filename: string;
}

function filenameFrom(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* fall through */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain ? plain[1].trim() : fallback;
}

/**
 * Fetch a protected file (endpoints ending in `/file`, CSV exports …).
 * A plain `<a href>` cannot send the bearer token, so files are fetched as blobs.
 */
export async function apiBlob(path: string, opts: RequestOptions = {}, fallbackName = "download"): Promise<DownloadedFile> {
  const res = await sendWithRefresh(path, { ...opts, headers: { Accept: "*/*", ...opts.headers } });
  if (!res.ok) throw await toError(res);
  return {
    blob: await res.blob(),
    filename: filenameFrom(res.headers.get("content-disposition"), fallbackName),
  };
}

/** Save a downloaded file to the user's device. */
export function saveFile({ blob, filename }: DownloadedFile): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Open a downloaded file (PDF, image) in a new tab. */
export function openFile({ blob }: DownloadedFile): void {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
