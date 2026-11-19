"use client";

/**
 * The country list for every form (capability `countries`): the reference list when the backend serves it, otherwise the
 * built-in ISO list exactly as before (lib/countries/reference.ts → countryChoices). Every country is always offered.
 */
import { useQuery } from "@tanstack/react-query";
import { countriesApi } from "@/lib/api/countries";
import { queryKeys } from "@/lib/query/keys";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { countriesSupported, countryChoices } from "@/lib/countries/reference";

export function useCountryOptions() {
  const supported = countriesSupported(useBackendCapabilities().detection);
  const q = useQuery({ queryKey: queryKeys.countries.list(), queryFn: countriesApi.list, enabled: supported, staleTime: 60_000, retry: 1 });
  return { supported, countries: q.data, options: countryChoices(supported, q.data) };
}
