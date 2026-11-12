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
import { attemptRefresh, createRefresher, sendWithSessionRefresh, type RefreshOutcome, type SharedCooldown } from "./refresh-outcome";
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
  const result = await attemptRefresh({ post: postRefresh, delay });
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

function refreshUnavailableError(): ApiError {
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
  const { body, query, auth = true, headers: initHeaders, ...init } = opts;
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
    xhr.open(method, url);
    xhr.withCredentials = withCredentials;
    xhr.responseType = "blob";
    headers.forEach((value, key) => xhr.setRequestHeader(key, value));
    xhr.upload.onprogress = (e) => tracker.progress(e.loaded, e.lengthComputable ? e.total : 0);

    const fail = () => {
      tracker.done();
      reject(new ApiError(0, "NETWORK_ERROR", "Cannot reach the server."));
    };
    xhr.onerror = fail;
    xhr.ontimeout = fail;
    xhr.onabort = () => {
      tracker.done();
      reject(new DOMException("The upload was cancelled.", "AbortError"));
    };
    xhr.onload = () => {
      tracker.done();
      const responseHeaders = new Headers();
      for (const line of xhr.getAllResponseHeaders().trim().split(/[\r\n]+/)) {
        const i = line.indexOf(":");
        if (i > 0) responseHeaders.append(line.slice(0, i).trim(), line.slice(i + 1).trim());
      }
      const noBody = xhr.status === 204 || xhr.status === 205 || xhr.status === 304;
      resolve(new Response(noBody ? null : (xhr.response as Blob), { status: xhr.status, statusText: xhr.statusText, headers: responseHeaders }));
    };

    if (signal) {
      if (signal.aborted) {
        tracker.done();
        reject(new DOMException("The upload was cancelled.", "AbortError"));
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(form);
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
  const auth = opts.auth ?? true;
  if (!auth || path.startsWith("/auth/")) return send(path, opts);
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
