import { QueryCache, QueryClient } from "@tanstack/react-query";
import { isApiError } from "@/lib/api/errors";
import { DATE_OF_BIRTH_REQUIRED } from "@/lib/accounts/date-of-birth-step";
import { queryKeys } from "./keys";

/** Errors that will not change if the same request is sent again. */
function isPermanent(error: unknown): boolean {
  if (!isApiError(error)) return false;
  return error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;
}

export function makeQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    // A student held at the date-of-birth step (403 DATE_OF_BIRTH_REQUIRED): reload /me so the step appears.
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (!isApiError(error) || error.code !== DATE_OF_BIRTH_REQUIRED) return;
        const profileKey = queryKeys.me.profile();
        if (profileKey.every((k, i) => query.queryKey[i] === k) && query.queryKey.length === profileKey.length) return; // never loop on /me itself
        void client.invalidateQueries({ queryKey: queryKeys.me.profile() });
      },
    }),
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
  return client;
}
