/**
 * The one HTTP client for the ROF LMS API.
 *
 * - Requests go to `/api/v1/...` on this origin; next.config.ts proxies them
 *   to the backend.
 * - The access token (15 min) lives in memory only. The refresh token is the
 *   backend's httpOnly cookie `rof_refresh`; this code never reads it.
 * - On a 401 the client refreshes once and retries the request. If the
 *   refresh fails, the session is over and listeners are told (the session
 *   provider then shows the login page).
 * - Refresh tokens rotate on every use and a reused token revokes the whole
 *   session, so refreshes are single-flight within a tab and serialised
 *   across tabs with the Web Locks API.
 */
import { ApiError } from "./errors";
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

let refreshing: Promise<boolean> | null = null;

const REFRESH_ATTEMPTS = 3;

/**
 * POST /auth/refresh. Only a definite rejection (401/403) means "signed out".
 * A rate limit (429) or a network/server hiccup is retried with a short
 * backoff: the backend rejects those requests before touching the token, so
 * the cookie is still valid and retrying is safe.
 */
async function postRefresh(): Promise<boolean> {
  for (let attempt = 1; attempt <= REFRESH_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
    } catch {
      if (attempt === REFRESH_ATTEMPTS) return false;
      await delay(1000 * attempt);
      continue;
    }
    if (res.ok) {
      const body = (await res.json()) as TokenResponse;
      accessToken = body.access_token;
      return true;
    }
    const transient = res.status === 429 || res.status >= 500;
    if (!transient || attempt === REFRESH_ATTEMPTS) return false;
    const retryAfter = Number(res.headers.get("retry-after"));
    await delay(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 2000 * attempt);
  }
  return false;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function withCrossTabLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && "locks" in navigator && navigator.locks) {
    return navigator.locks.request("rof-auth-refresh", fn) as Promise<T>;
  }
  return fn();
}

/**
 * Exchange the refresh cookie for a new access token. Returns false when
 * there is no valid session. Concurrent callers share one request.
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= withCrossTabLock(postRefresh).finally(() => {
    refreshing = null;
  });
  return refreshing;
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

/** Send a request, refreshing the session once if the access token expired. */
async function sendWithRefresh(path: string, opts: RequestOptions): Promise<Response> {
  const auth = opts.auth ?? true;
  let res = await send(path, opts);
  if (res.status === 401 && auth && !path.startsWith("/auth/")) {
    if (await refreshSession()) {
      res = await send(path, opts);
    }
    if (res.status === 401) notifyExpired();
  }
  return res;
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
