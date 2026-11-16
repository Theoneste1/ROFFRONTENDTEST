"use client";

/** A public form's availability (capability formAvailability). Only queried when the backend advertises it. */
import { useQuery } from "@tanstack/react-query";
import { publicApi } from "@/lib/api/auth";
import { hasFeature } from "@/lib/api/capabilities";
import { queryKeys } from "@/lib/query/keys";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import type { FormKey } from "@/lib/forms/closed-form";

export function usePublicForm(key: FormKey) {
  const enabled = hasFeature(useBackendCapabilities().detection, "formAvailability");
  const q = useQuery({ queryKey: queryKeys.forms.public(key), queryFn: () => publicApi.form(key), enabled, staleTime: 30_000, retry: 1 });
  return { enabled, ...q };
}
