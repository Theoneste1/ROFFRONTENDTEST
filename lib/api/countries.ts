/**
 * Countries (capability `countries`; design area 1 as simplified by the owner, 2026-11-19). ROF is a global Olympiad
 * platform: a country only identifies where someone or a school is — never a level or division, never a block.
 *
 *   GET   /countries                 public: every ISO 3166-1 alpha-2 country { code, name, phonePrefix }, by name
 *   GET   /admin/countries?q=        reference.manage: the same with the number of schools and the last change
 *   PATCH /admin/countries/:code     reference.manage: { name?, phonePrefix? } (null removes the calling code); audited
 */
import { api } from "./client";

export interface Country {
  code: string;
  name: string;
  phonePrefix: string | null;
}

export interface AdminCountry extends Country {
  updatedAt: string;
  _count: { schools: number };
}

export interface CountryChange {
  name?: string;
  phonePrefix?: string | null;
}

export const countriesApi = {
  list: () => api<Country[]>("/countries", { auth: false }),
};

export const adminCountriesApi = {
  list: (q?: string) => api<AdminCountry[]>("/admin/countries", { query: { q } }),
  update: (code: string, body: CountryChange) => api<Country>(`/admin/countries/${encodeURIComponent(code)}`, { method: "PATCH", body }),
};
