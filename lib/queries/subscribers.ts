"use client";

/** News subscribers and mailings (lib/api/subscribers.ts). */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { publicSubscribersApi, subscribersApi, type SubscriberInput } from "../api/subscribers";
import type { Audience, SubscriberFilters } from "../subscribers/rules";

const KEY = ["subscribers"] as const;
const keys = {
  list: (f: SubscriberFilters) => [...KEY, "list", f] as const,
  summary: () => [...KEY, "summary"] as const,
  mailings: (page: number) => [...KEY, "mailings", page] as const,
  preview: (a: Audience) => [...KEY, "preview", a] as const,
};

function useInvalidate() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: KEY });
}

export function useSubscribers(f: SubscriberFilters, enabled = true) {
  return useQuery({ queryKey: keys.list(f), queryFn: () => subscribersApi.list({ ...f, limit: 25 }), placeholderData: keepPreviousData, enabled });
}
export function useSubscriberSummary(enabled = true) {
  return useQuery({ queryKey: keys.summary(), queryFn: subscribersApi.summary, enabled });
}
export function useMailings(page: number, enabled = true) {
  // While a mailing is waiting or sending, its counts change: refresh every 10 seconds.
  return useQuery({
    queryKey: keys.mailings(page), queryFn: () => subscribersApi.mailings(page), placeholderData: keepPreviousData, enabled,
    refetchInterval: (q) => (q.state.data?.data.some((m) => m.status === "QUEUED" || m.status === "SENDING") ? 10_000 : false),
  });
}
export function useAudiencePreview(audience: Audience, enabled = true) {
  return useQuery({ queryKey: keys.preview(audience), queryFn: () => subscribersApi.preview(audience), enabled, placeholderData: keepPreviousData });
}

export function useCreateSubscriber() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: SubscriberInput) => subscribersApi.create(input), onSuccess: invalidate });
}
export function useUpdateSubscriber() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: SubscriberInput }) => subscribersApi.update(id, input), onSuccess: invalidate });
}
export function useDeleteSubscriber() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => subscribersApi.remove(id), onSuccess: invalidate });
}
export function useImportSubscribers() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ file, dryRun }: { file: File; dryRun: boolean }) => subscribersApi.importCsv(file, dryRun),
    onSuccess: (r) => { if (!r.dryRun) invalidate(); },
  });
}
export function useSendMailing() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: subscribersApi.send, onSuccess: invalidate });
}
export function useSendTestMailing() {
  return useMutation({ mutationFn: ({ subject, body }: { subject: string; body: string }) => subscribersApi.sendTest(subject, body) });
}
export function useCancelMailing() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => subscribersApi.cancel(id), onSuccess: invalidate });
}

/** Public. */
export function useSubscribe() {
  return useMutation({ mutationFn: (body: Record<string, unknown>) => publicSubscribersApi.subscribe(body) });
}
export function useUnsubscribe() {
  return useMutation({ mutationFn: (body: { id: string; token: string; reason?: string }) => publicSubscribersApi.unsubscribe(body) });
}
