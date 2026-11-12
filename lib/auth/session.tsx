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
 * Hiding UI by role or permission is only a courtesy: the backend enforces
 * every rule again on every request.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  SESSION_REFRESH_UNAVAILABLE,
  clearRefreshCooldown,
  getAccessToken,
  onSessionExpired,
  refreshSession,
  setAccessToken,
} from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { RefreshOutcome } from "@/lib/api/refresh-outcome";
import { authApi, meApi } from "@/lib/api/auth";
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

const UNAVAILABLE_ERROR = new ApiError(
  503,
  SESSION_REFRESH_UNAVAILABLE,
  "Can't reach the server to renew your session. Please try again.",
);

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
        // Another tab signed in: adopt its session. Anything but "ok" leaves this tab as it is.
        if ((await refreshSession()) === "ok") setPhase("signed-in");
      }
    };
    return () => {
      bc.close();
      channel.current = null;
    };
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
      const res = await authApi.login(username, password);
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
    try {
      await authApi.logout();
    } catch {
      // The session ends locally even if the server could not be reached.
    }
    setSignedOutByUser(true);
    signOutLocally();
    channel.current?.postMessage({ type: "logout" } satisfies AuthMessage);
  }, [signOutLocally]);

  const logoutEverywhere = useCallback(async () => {
    await authApi.logoutAll();
    setSignedOutByUser(true);
    signOutLocally();
    channel.current?.postMessage({ type: "logout" } satisfies AuthMessage);
  }, [signOutLocally]);

  const endSession = useCallback(() => {
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
      can: (p) => permissions.has(p),
      login,
      logout,
      logoutEverywhere,
      endSession,
      error,
      retry,
    };
  }, [phase, signedIn, signedOutByUser, meQuery.data, meQuery.isError, meQuery.error, permissionsQuery.data, login, logout, logoutEverywhere, endSession, retry]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
