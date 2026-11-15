/**
 * The standard school selection for every form that names a school:
 *
 *   Country → Province → District → Sector → School      (Rwanda)
 *   Country → School                                       (any other country)
 *
 * Every step is a plain dropdown whose options belong to the step before it, from the official
 * directory: provinces / districts / sectors from `GET /schools/locations`, schools from the
 * directory filtered by that place (or that country). Changing a step clears every step after it.
 * Once a school is chosen, its official details are shown from its directory record.
 *
 * Pure functions only (unit-tested in tests/school-cascade.test.mjs); the dropdowns themselves are
 * app/components/schools/SchoolCascade.tsx.
 */
import type { SchoolProvince } from "../api/accounts";

export interface Place {
  province: string;
  district: string;
  sector: string;
}

export type PlaceLevel = keyof Place;

export const emptyPlace = (): Place => ({ province: "", district: "", sector: "" });

export function provincesOf(locations: readonly SchoolProvince[] | undefined): string[] {
  return (locations ?? []).map((p) => p.province);
}

export function districtsOf(locations: readonly SchoolProvince[] | undefined, province: string): string[] {
  return (locations ?? []).find((p) => p.province === province)?.districts.map((d) => d.district) ?? [];
}

export function sectorsOf(locations: readonly SchoolProvince[] | undefined, province: string, district: string): string[] {
  return (locations ?? []).find((p) => p.province === province)?.districts.find((d) => d.district === district)?.sectors ?? [];
}

/** Set one level; every level after it is cleared (a district belongs to one province, a sector to one district). */
export function setPlaceLevel(place: Place, level: PlaceLevel, value: string): Place {
  if (level === "province") return value === place.province ? place : { province: value, district: "", sector: "" };
  if (level === "district") return value === place.district ? place : { ...place, district: value, sector: "" };
  return { ...place, sector: value };
}

export const placeComplete = (p: Place) => !!(p.province && p.district && p.sector);

/** A school as the directory returns it (public search row or admin directory row). */
export interface DirectorySchoolFacts {
  name: string;
  code: string | null;
  countryCode?: string | null;
  province?: string | null;
  district?: string | null;
  sector?: string | null;
  location?: string | null;
}

/**
 * The official information shown once a school is chosen: name, code (or that it has none — a
 * code is never invented), and its place. `place` fills in the levels the row does not carry
 * (the public search returns district and sector, not the province).
 */
export function schoolFacts(s: DirectorySchoolFacts, place?: Partial<Place>, countryLabel?: string): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [
    { label: "School", value: s.name },
    { label: "Official code", value: s.code ?? "No official code" },
  ];
  if (countryLabel) rows.push({ label: "Country", value: countryLabel });
  const province = s.province ?? place?.province ?? "";
  const district = s.district ?? place?.district ?? "";
  const sector = s.sector ?? place?.sector ?? "";
  if (province) rows.push({ label: "Province", value: province });
  if (district) rows.push({ label: "District", value: district });
  if (sector) rows.push({ label: "Sector", value: sector });
  if (s.location && s.location !== [sector, district].filter(Boolean).join(", ")) rows.push({ label: "Location", value: s.location });
  return rows;
}

/** Sort schools by name for a dropdown (the directory may return them in another order). */
export function byName<T extends { name: string }>(schools: readonly T[]): T[] {
  return [...schools].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

/** The value of the "my school is not listed" option in a school dropdown (never a school id). */
export const NOT_LISTED = "__not_listed__";
