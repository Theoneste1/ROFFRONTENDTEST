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
 * Pages that depend on it: registration (school directory), the admin school
 * directory and claim review, invitations and CSV import (school references),
 * user roles (Teacher / Head Coach, password step-up), and starting an academic
 * year (`academicYearActivation`).
 */
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import {
  detectBackend,
  isWaking,
  refetchIntervalFor,
  staleTimeFor,
  type BackendDetection,
} from "@/lib/api/capabilities";

// Shared by every component (one detection for the app): consecutive UNKNOWN answers and when they began.
let consecutiveUnknown = 0;
let firstUnknownAt: number | null = null;
/** Decided when each answer arrives (retries are at most 15 s apart inside the window). */
let waking = false;

async function detectAndCount(signal: AbortSignal): Promise<BackendDetection> {
  const d = await detectBackend({ signal });
  if (d.state === "UNKNOWN") {
    consecutiveUnknown += 1;
    firstUnknownAt ??= Date.now();
  } else {
    consecutiveUnknown = 0;
    firstUnknownAt = null;
  }
  waking = d.state === "UNKNOWN" && isWaking(firstUnknownAt, Date.now());
  return d;
}

export function useBackendCapabilities() {
  const query = useQuery<BackendDetection>({
    queryKey: queryKeys.backend.capabilities(),
    queryFn: ({ signal }) => detectAndCount(signal),
    staleTime: (q) => staleTimeFor(q.state.data),
    refetchInterval: (q) => refetchIntervalFor(q.state.data, consecutiveUnknown),
    retry: false, // detectBackend never throws: failures are UNKNOWN, retried by refetchInterval
  });
  return {
    detection: query.data,
    loading: query.isPending,
    /** UNKNOWN for less than WAKING_WINDOW_MS: the backend is probably still waking up (retries continue). */
    waking: query.data?.state === "UNKNOWN" && waking,
    /** A request is in flight: the first one, a scheduled UNKNOWN retry, or `retry()`. */
    fetching: query.isFetching,
    retry: () => void query.refetch(),
  };
}
