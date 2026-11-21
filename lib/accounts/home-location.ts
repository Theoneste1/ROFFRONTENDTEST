/**
 * Home location (capability homeLocationRules; owner, 2026-11-20): the same rules on the Student, Teacher and Coach
 * registration forms and on profile edits.
 *
 *  - Home country: required, a searchable list of every country (app/components/ui/SearchableSelect).
 *  - It defaults to the country of the school location (Student: the school's country; Teacher: Rwanda, the only school
 *    country). A change of the school country moves the default along — but never once the person has chosen a home
 *    country themselves (`countryChosen`). The Coach form has no school, so nothing is defaulted there.
 *  - Home country Rwanda: home province → district → sector, all required, from the official list; choosing a province
 *    clears the district and sector, choosing a district clears the sector (lib/schools/school-cascade setPlaceLevel).
 *  - Any other country: only the country — the province, district and sector are hidden, not asked, not validated and
 *    not sent; leaving Rwanda clears them, coming back asks for them again.
 *
 * The home location is separate from the school location: nothing here reads or changes the school's fields except the
 * one-way default above.
 */
import { hasFeature, type BackendDetection } from "../api/capabilities";
import { isCountryCode, RWANDA } from "../schools/countries";
import { emptyPlace, setPlaceLevel, type Place, type PlaceLevel } from "../schools/school-cascade";
import type { SchoolClaimDraft } from "./school-claim";

/** The country of a student's school location: a Rwandan school (listed or not), or the chosen country abroad. */
export const schoolCountryOfClaim = (c: SchoolClaimDraft): string => (c.mode === "abroad" ? c.country : RWANDA);

export interface HomeDraft {
  /** ISO 3166-1 alpha-2, "" when none yet. */
  country: string;
  /** Rwanda only (empty otherwise). */
  place: Place;
  /** True once the person chose the home country themselves: the school country no longer changes it. */
  countryChosen: boolean;
}

export type HomeField = "homeCountry" | "homeProvince" | "homeDistrict" | "homeSector";

/** True when the backend applies these rules (and accepts the place for every form and on profile edits). */
export function homeLocationRulesSupported(detection: BackendDetection | null | undefined): boolean {
  return hasFeature(detection, "homeLocationRules");
}

export const emptyHome = (country = ""): HomeDraft => ({ country, place: emptyPlace(), countryChosen: false });

/** The province, district and sector are asked (and required) only for a home in Rwanda. */
export const homeInRwanda = (d: Pick<HomeDraft, "country">) => d.country === RWANDA;

/** A new country (the place is cleared when the country changes). */
function withCountry(d: HomeDraft, country: string): HomeDraft {
  return country === d.country ? d : { ...d, country, place: emptyPlace() };
}

/** The person chose the home country: kept from now on, whatever the school country. */
export function chooseHomeCountry(d: HomeDraft, country: string): HomeDraft {
  return { ...withCountry(d, country), countryChosen: true };
}

/** The school country changed: the home country follows it unless the person chose one (never overwritten). */
export function followSchoolCountry(d: HomeDraft, schoolCountry: string): HomeDraft {
  if (d.countryChosen || !schoolCountry || !isCountryCode(schoolCountry)) return d;
  return withCountry(d, schoolCountry);
}

/** A province, district or sector chosen: the levels after it are cleared. */
export function setHomeLevel(d: HomeDraft, level: PlaceLevel, value: string): HomeDraft {
  return { ...d, place: setPlaceLevel(d.place, level, value) };
}

/** Field errors (only for fields that are shown): the country always; province, district and sector for Rwanda. */
export function validateHome(d: HomeDraft): Partial<Record<HomeField, string>> {
  const e: Partial<Record<HomeField, string>> = {};
  if (!isCountryCode(d.country)) e.homeCountry = "Choose your home country.";
  else if (homeInRwanda(d)) {
    if (!d.place.province) e.homeProvince = "Choose your home province.";
    if (!d.place.district) e.homeDistrict = "Choose your home district.";
    if (!d.place.sector) e.homeSector = "Choose your home sector.";
  }
  return e;
}

/** The home place of a request: the three fields for Rwanda, nothing otherwise (the country goes under the form's own key). */
export function homePlacePayload(d: HomeDraft): { homeProvince?: string; homeDistrict?: string; homeSector?: string } {
  return homeInRwanda(d) ? { homeProvince: d.place.province, homeDistrict: d.place.district, homeSector: d.place.sector } : {};
}

/** A draft from a stored profile (country and place), for profile edits; the stored country counts as chosen. */
export function homeFromProfile(u: { country?: string | null; homeProvince?: string | null; homeDistrict?: string | null; homeSector?: string | null }): HomeDraft {
  const country = u.country ?? "";
  return {
    country,
    place: country === RWANDA ? { province: u.homeProvince ?? "", district: u.homeDistrict ?? "", sector: u.homeSector ?? "" } : emptyPlace(),
    countryChosen: !!country,
  };
}

/** The backend's home-location refusals → the field to show them on. */
export const HOME_ERRORS: Readonly<Record<string, { field: HomeField; message: string }>> = {
  UNKNOWN_HOME_LOCATION: { field: "homeSector", message: "That province, district and sector don't match the official list. Choose them again." },
  HOME_LOCATION_RWANDA_ONLY: { field: "homeCountry", message: "Province, district and sector are only for homes in Rwanda." },
  HOME_PLACE_REQUIRED: { field: "homeProvince", message: "Choose your home province, district and sector." },
  HOME_COUNTRY_REQUIRED: { field: "homeCountry", message: "Choose your home country." },
};
