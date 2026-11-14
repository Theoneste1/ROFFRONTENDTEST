"use client";

/**
 * Session state for the whole app.
 *
 * On load it tries a silent `POST /auth/refresh` (the httpOnly cookie carries
 * the refresh token). If that works, the current user (`GET /me`) and
 * permissions (`GET /me/permissions`) are loaded through TanStack Query, so
 * any mutation can refresh them by invalidating `queryKeys.me.all`.
 *
 * Only a definite refusal of the refresh token signs the user out. If the
 * server cannot be reached (network, 429, 5xx), the status is "error" with a
 * "Try again" that restores the session — never a silent sign-out.
 *
 * After an explicit sign-out the session is never restored from the cookie
 * until the next sign-in, and the server logout is repeated on load (H1;
 * lib/auth/signed-out.ts): on a shared computer the next person cannot be
 * signed in as the previous user, even if that user's logout request was lost.
 *
 * Hiding UI by role or permission is only a courtesy: the backend enforces
 * every rule again on every request.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clearRefreshCooldown,
  getAccessToken,
  onSessionExpired,
  refreshSession,
  refreshUnavailableError,
  setAccessToken,
} from "@/lib/api/client";
import { signInThenClearCooldown, type RefreshOutcome } from "@/lib/api/refresh-outcome";
import { authApi, meApi } from "@/lib/api/auth";
import { clearSignedOut, confirmSignedOut, isMarkedSignedOut, isSignedOutEvent, markSignedOut, needsServerLogout } from "@/lib/auth/signed-out";
import { queryKeys } from "@/lib/query/keys";
import type { CurrentUser, Permission, Role } from "@/lib/api/types";

export type SessionStatus = "loading" | "authenticated" | "unauthenticated" | "error";

interface SessionValue {
  status: SessionStatus;
  user: CurrentUser | null;
  role: Role | null;
  /** True after the user signed out themselves (sign out, sign out everywhere): go to plain /login. */
  signedOutByUser: boolean;
  permissions: ReadonlySet<Permission>;
  /**
   * The permissions once `GET /me/permissions` has answered; null while it is
   * loading or if it failed (menus then show their items — the API enforces).
   */
  knownPermissions: ReadonlySet<Permission> | null;
  /**
   * Whether `GET /me/permissions` has answered: pages whose content depends on
   * a permission wait for "ready" instead of briefly showing "not permitted".
   */
  permissionsStatus: "loading" | "ready" | "error";
  can: (permission: Permission) => boolean;
  login: (username: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  logoutEverywhere: () => Promise<void>;
  /**
   * Ends the session in this browser without calling the API, for when the
   * backend has already revoked it (e.g. after a password change).
   */
  endSession: () => void;
  /** Why `status` is "error" (pass it to ErrorState); null otherwise. */
  error: unknown;
  /** Retry loading the session after an error (restores it if the server was unreachable). */
  retry: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

/** "unavailable": the session could not be restored because the server was unreachable — not signed out. */
type Phase = "checking" | "signed-in" | "signed-out" | "unavailable";

/** ok → signed in; rejected → signed out; unavailable → not signed out, "Try again" restores. */
function phaseFor(outcome: RefreshOutcome): Phase {
  return outcome === "ok" ? "signed-in" : outcome === "rejected" ? "signed-out" : "unavailable";
}

/** The same error the API client throws for an unavailable refresh (one definition, in client.ts). */
const UNAVAILABLE_ERROR = refreshUnavailableError();

const CHANNEL = "rof-auth";
type AuthMessage = { type: "login" } | { type: "logout" };

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("checking");
  const [signedOutByUser, setSignedOutByUser] = useState(false);
  const channel = useRef<BroadcastChannel | null>(null);

  const signOutLocally = useCallback(() => {
    setAccessToken(null);
    queryClient.clear();
    setPhase("signed-out");
  }, [queryClient]);

  // Restore the session once on load (single-flight, safe under StrictMode).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isMarkedSignedOut()) {
        // Signed out on this device: never restore from the cookie, and make sure
        // the server session is revoked (the earlier logout request may have been lost).
        if (needsServerLogout()) authApi.logout().then(() => confirmSignedOut(), () => undefined);
        if (!cancelled) {
          setSignedOutByUser(true);
          setPhase("signed-out");
        }
        return;
      }
      const outcome = getAccessToken() ? "ok" : await refreshSession();
      if (!cancelled) setPhase(phaseFor(outcome));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The API client reports when a refresh is no longer possible.
  useEffect(() => onSessionExpired(signOutLocally), [signOutLocally]);

  // Keep tabs in step: signing out in one tab signs out the others.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel(CHANNEL);
    channel.current = bc;
    bc.onmessage = async (event: MessageEvent<AuthMessage>) => {
      if (event.data?.type === "logout") {
        signOutLocally();
      } else if (event.data?.type === "login" && !getAccessToken()) {
        // Another tab signed in (the message is sent only after a successful
        // sign-in, so the server is reachable): end this tab's own outage
        // cooldown, then adopt the session with one refresh. Anything but "ok"
        // leaves this tab as it is.
        clearRefreshCooldown();
        if ((await refreshSession()) === "ok") setPhase("signed-in");
      }
    };
    return () => {
      bc.close();
      channel.current = null;
    };
  }, [signOutLocally]);

  // The same through localStorage: another tab wrote the signed-out marker
  // (covers browsers without BroadcastChannel and a missed message).
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (isSignedOutEvent(event)) {
        setSignedOutByUser(true);
        signOutLocally();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [signOutLocally]);

  const signedIn = phase === "signed-in";

  const meQuery = useQuery({
    queryKey: queryKeys.me.profile(),
    queryFn: meApi.get,
    enabled: signedIn,
    staleTime: 5 * 60_000,
  });

  const permissionsQuery = useQuery({
    queryKey: queryKeys.me.permissions(),
    queryFn: meApi.permissions,
    enabled: signedIn,
    staleTime: 10 * 60_000,
  });

  const login = useCallback(
    async (username: string, password: string) => {
      // The cooldown is cleared only after the sign-in succeeded (a failure throws first).
      const res = await signInThenClearCooldown(() => authApi.login(username, password), clearRefreshCooldown);
      // Before any other request: a refresh while the marker is set is refused.
      clearSignedOut();
      queryClient.clear();
      queryClient.setQueryData(queryKeys.me.profile(), res.user);
      setSignedOutByUser(false);
      setPhase("signed-in");
      channel.current?.postMessage({ type: "login" } satisfies AuthMessage);
      return res.user;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    // First, before any request: from now on nothing restores this session in
    // this browser, even if the logout request below is lost.
    markSignedOut();
    try {
      // The cookie identifies the session, so this works with an expired access token.
      await authApi.logout();
      confirmSignedOut();
    } catch {
      // The session ends locally even if the server could not be reached; the
      // marker keeps it ended and the next load repeats the server logout.
    }
    setSignedOutByUser(true);
    signOutLocally();
    channel.current?.postMessage({ type: "logout" } satisfies AuthMessage);
  }, [signOutLocally]);

  const logoutEverywhere = useCallback(async () => {
    // Refreshes first if the access token expired (M1); a failure is shown, nothing changes.
    await authApi.logoutAll();
    confirmSignedOut();
    setSignedOutByUser(true);
    signOutLocally();
    channel.current?.postMessage({ type: "logout" } satisfies AuthMessage);
  }, [signOutLocally]);

  const endSession = useCallback(() => {
    // The server already ended every session (e.g. password changed).
    confirmSignedOut();
    signOutLocally();
    channel.current?.postMessage({ type: "logout" } satisfies AuthMessage);
  }, [signOutLocally]);

  // A deliberate "Try again" may refresh at once (ends the storm-prevention cooldown).
  const retry = useCallback(() => {
    clearRefreshCooldown();
    if (phase === "unavailable") {
      setPhase("checking");
      void (async () => setPhase(phaseFor(await refreshSession())))();
      return;
    }
    void meQuery.refetch();
    void permissionsQuery.refetch();
  }, [phase, meQuery, permissionsQuery]);

  const value = useMemo<SessionValue>(() => {
    const user = signedIn ? (meQuery.data ?? null) : null;
    const permissions = new Set<Permission>(signedIn ? (permissionsQuery.data?.permissions ?? []) : []);
    const knownPermissions = signedIn && permissionsQuery.data ? permissions : null;

    let status: SessionStatus;
    let error: unknown = null;
    if (phase === "checking") status = "loading";
    else if (phase === "signed-out") status = "unauthenticated";
    else if (phase === "unavailable") {
      status = "error";
      error = UNAVAILABLE_ERROR;
    } else if (user) status = "authenticated";
    else if (meQuery.isError) {
      status = "error";
      error = meQuery.error;
    } else status = "loading";

    return {
      status,
      user,
      role: user?.role ?? null,
      signedOutByUser,
      permissions,
      knownPermissions,
      permissionsStatus: knownPermissions ? "ready" : signedIn && permissionsQuery.isError ? "error" : "loading",
      can: (p) => permissions.has(p),
      login,
      logout,
      logoutEverywhere,
      endSession,
      error,
      retry,
    };
  }, [phase, signedIn, signedOutByUser, meQuery.data, meQuery.isError, meQuery.error, permissionsQuery.data, permissionsQuery.isError, login, logout, logoutEverywhere, endSession, retry]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
