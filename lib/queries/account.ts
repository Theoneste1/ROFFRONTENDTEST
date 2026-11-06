"use client";

/** The signed-in user's own account (profile details, password) and the public support details. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi, meApi, publicApi } from "@/lib/api/auth";
import { queryKeys } from "@/lib/query/keys";
import type { UpdateMeInput } from "@/lib/api/types";

/** `PATCH /me` (firstName, lastName, homeLocation). The navbar and pages update from the response. */
export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMeInput) => meApi.update(input),
    onSuccess: (me) => qc.setQueryData(queryKeys.me.profile(), me),
  });
}

/**
 * `PATCH /auth/password`. On success the backend revokes every refresh token,
 * including this browser's, so the caller must end the session.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      authApi.changePassword(currentPassword, newPassword),
  });
}

/** `GET /support` (public): contact details configured by the administrators. */
export function useSupportInfo() {
  return useQuery({ queryKey: queryKeys.support, queryFn: publicApi.support, staleTime: 5 * 60_000 });
}
