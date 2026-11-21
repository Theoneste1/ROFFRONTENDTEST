/**
 * Countries (capability `countries`; owner decision 2026-11-19): pure rules for the country lists and the administrators'
 * Countries screen. Unit-tested in tests/countries.test.mjs.
 *
 * Every form lists EVERY country (no country is ever blocked); with the capability the names come from the reference list
 * (which an Administrator may correct), otherwise from the built-in ISO list (lib/schools/countries.ts) as before.
 */
import type { AdminCountry, Country } from "../api/countries";
import type { Permission } from "../api/types";
import { hasFeature, type BackendDetection } from "../api/capabilities";
import { countryName, countryOptions, RWANDA } from "../schools/countries";

export const REFERENCE_MANAGE_PERMISSION: Permission = "reference.manage";

/** The backend serves the country reference list (GET /countries) and its administration. */
export function countriesSupported(detection: BackendDetection | null | undefined): boolean {
  return hasFeature(detection, "countries");
}

export interface Option {
  value: string;
  label: string;
}

/** Dropdown options from the reference list: Rwanda first, then by name (as the built-in list orders them). */
export function referenceCountryOptions(countries: readonly Pick<Country, "code" | "name">[]): Option[] {
  const rw = countries.filter((c) => c.code === RWANDA);
  const others = countries.filter((c) => c.code !== RWANDA).sort((a, b) => a.name.localeCompare(b.name, "en"));
  return [...rw, ...others].map((c) => ({ value: c.code, label: c.name }));
}

/** The options a form shows: the reference list once loaded (capability), else the built-in list — never fewer countries. */
export function countryChoices(supported: boolean, countries: readonly Pick<Country, "code" | "name">[] | undefined): Option[] {
  return supported && countries && countries.length ? referenceCountryOptions(countries) : countryOptions();
}

/** A country's name from the reference list, else the browser's name for the code. */
export function countryDisplayName(code: string, countries?: readonly Pick<Country, "code" | "name">[]): string {
  return countries?.find((c) => c.code === code)?.name ?? countryName(code);
}

export type CountriesPageMode = "loading" | "unsupported" | "error" | "forbidden" | "visible";

/** "unsupported" without the capability; "forbidden" without reference.manage; otherwise "visible" (after loading). */
export function countriesPageMode(opts: {
  detection: BackendDetection | undefined;
  detectionLoading: boolean;
  permissionsStatus: "loading" | "ready" | "error";
  can: (p: Permission) => boolean;
}): CountriesPageMode {
  if (opts.detectionLoading || opts.permissionsStatus === "loading") return "loading";
  if (!countriesSupported(opts.detection)) return "unsupported";
  if (opts.permissionsStatus === "error") return "error";
  return opts.can(REFERENCE_MANAGE_PERMISSION) ? "visible" : "forbidden";
}

/** The menu item: only for a backend with `countries` AND the known reference.manage. */
export function countriesNavVisible(detection: BackendDetection | undefined, permissions: ReadonlySet<string> | null): boolean {
  return countriesSupported(detection) && !!permissions && permissions.has(REFERENCE_MANAGE_PERMISSION);
}

/** The admin list filtered by a search (part of the name, or the exact code). */
export function filterCountries<T extends Pick<AdminCountry, "code" | "name">>(rows: readonly T[], q: string): T[] {
  const s = q.trim().toLowerCase();
  return s ? rows.filter((c) => c.name.toLowerCase().includes(s) || c.code.toLowerCase() === s) : [...rows];
}

export const PHONE_PREFIX = /^\+\d{1,4}$/;

/** Field errors of the correction form (the backend's rules), empty when it can be sent. */
export function countryEditProblems(d: { name: string; phonePrefix: string }): Partial<Record<"name" | "phonePrefix", string>> {
  const e: Partial<Record<"name" | "phonePrefix", string>> = {};
  const name = d.name.trim();
  if (name.length < 2 || name.length > 100) e.name = "Enter the country's name (2–100 characters).";
  if (d.phonePrefix.trim() && !PHONE_PREFIX.test(d.phonePrefix.trim())) e.phonePrefix = "“+” followed by 1 to 4 digits, e.g. +254.";
  return e;
}

/** Only what changed; an empty calling code removes it (null). */
export function countryChange(before: Pick<Country, "name" | "phonePrefix">, d: { name: string; phonePrefix: string }): { name?: string; phonePrefix?: string | null } {
  const out: { name?: string; phonePrefix?: string | null } = {};
  if (d.name.trim() !== before.name) out.name = d.name.trim();
  const prefix = d.phonePrefix.trim() || null;
  if (prefix !== before.phonePrefix) out.phonePrefix = prefix;
  return out;
}
