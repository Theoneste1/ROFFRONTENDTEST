/**
 * Query keys for TanStack Query. Every cached request is keyed here so that
 * mutations can invalidate exactly what they change.
 *
 * Convention: `[area, ...scope, params?]`. Invalidating a prefix such as
 * `queryKeys.me.all` refreshes everything below it.
 */
export const queryKeys = {
  me: {
    all: ["me"] as const,
    profile: () => [...queryKeys.me.all, "profile"] as const,
    permissions: () => [...queryKeys.me.all, "permissions"] as const,
  },
  support: ["support"] as const,
};
