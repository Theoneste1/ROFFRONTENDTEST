import { QueryClient } from "@tanstack/react-query";
import { isApiError } from "@/lib/api/errors";

/** Errors that will not change if the same request is sent again. */
function isPermanent(error: unknown): boolean {
  if (!isApiError(error)) return false;
  return error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => !isPermanent(error) && failureCount < 2,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
