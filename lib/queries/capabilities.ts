"use client";

/**
 * The backend's capabilities (`GET /api/v1`), shared by the whole app: one
 * cached request, whatever the number of components that ask.
 *
 * - `detection` is undefined while the first answer is loading — treat that
 *   like UNKNOWN (use only what both backends support).
 * - UNKNOWN is retried automatically (every 30 s while in use, and on window
 *   focus); `retry()` asks again at once.
 * - Check features one by one with `hasFeature(detection, "…")`.
 *
 * Detection only: nothing in the app changes behaviour on it yet.
 */
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import {
  detectBackend,
  refetchIntervalFor,
  staleTimeFor,
  type BackendDetection,
} from "@/lib/api/capabilities";

export function useBackendCapabilities() {
  const query = useQuery<BackendDetection>({
    queryKey: queryKeys.backend.capabilities(),
    queryFn: ({ signal }) => detectBackend({ signal }),
    staleTime: (q) => staleTimeFor(q.state.data),
    refetchInterval: (q) => refetchIntervalFor(q.state.data),
    retry: false, // detectBackend never throws: failures are UNKNOWN, retried by refetchInterval
  });
  return {
    detection: query.data,
    loading: query.isPending,
    /** A request is in flight: the first one, a scheduled UNKNOWN retry, or `retry()`. */
    fetching: query.isFetching,
    retry: () => void query.refetch(),
  };
}
