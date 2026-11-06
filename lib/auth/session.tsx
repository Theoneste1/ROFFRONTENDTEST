"use client";

/**
 * Session state for the whole app.
 *
 * On load it tries a silent `POST /auth/refresh` (the httpOnly cookie carries
 * the refresh token). If that works, the current user (`GET /me`) and
 * permissions (`GET /me/permissions`) are loaded through TanStack Query, so
 * any mutation can refresh them by invalidating `queryKeys.me.all`.
 *
 * Hiding UI by role or permission is only a courtesy: the backend enforces
 * every rule again on every request.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAccessToken, onSessionExpired, refreshSession, setAccessToken } from "@/lib/api/client";
import { authApi, meApi } from "@/lib/api/auth";
import { queryKeys } from "@/lib/query/keys";
import type { CurrentUser, Permission, Role } from "@/lib/api/types";

export type SessionStatus = "loading" | "authenticated" | "unauthenticated" | "error";

interface SessionValue {
  status: SessionStatus;
  user: CurrentUser | null;
  role: Role | null;
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
  /** Retry loading the session after an error. */
  retry: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

type Phase = "checking" | "signed-in" | "signed-out";

const CHANNEL = "rof-auth";
type AuthMessage = { type: "login" } | { type: "logout" };

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("checking");
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
      const ok = getAccessToken() ? true : await refreshSession();
      if (!cancelled) setPhase(ok ? "signed-in" : "signed-out");
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
        if (await refreshSession()) setPhase("signed-in");
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
    signOutLocally();
    channel.current?.postMessage({ type: "logout" } satisfies AuthMessage);
  }, [signOutLocally]);

  const logoutEverywhere = useCallback(async () => {
    await authApi.logoutAll();
    signOutLocally();
    channel.current?.postMessage({ type: "logout" } satisfies AuthMessage);
  }, [signOutLocally]);

  const endSession = useCallback(() => {
    signOutLocally();
    channel.current?.postMessage({ type: "logout" } satisfies AuthMessage);
  }, [signOutLocally]);

  const retry = useCallback(() => {
    void meQuery.refetch();
    void permissionsQuery.refetch();
  }, [meQuery, permissionsQuery]);

  const value = useMemo<SessionValue>(() => {
    const user = signedIn ? (meQuery.data ?? null) : null;
    const permissions = new Set<Permission>(signedIn ? (permissionsQuery.data?.permissions ?? []) : []);

    let status: SessionStatus;
    if (phase === "checking") status = "loading";
    else if (phase === "signed-out") status = "unauthenticated";
    else if (user) status = "authenticated";
    else if (meQuery.isError) status = "error";
    else status = "loading";

    return {
      status,
      user,
      role: user?.role ?? null,
      permissions,
      can: (p) => permissions.has(p),
      login,
      logout,
      logoutEverywhere,
      endSession,
      retry,
    };
  }, [phase, signedIn, meQuery.data, meQuery.isError, permissionsQuery.data, login, logout, logoutEverywhere, endSession, retry]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
