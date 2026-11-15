"use client";

/**
 * A student names their school (registration and the profile, when the backend advertises
 * `schoolAffiliations`), with the standard selection (lib/schools/school-cascade.ts):
 *
 *   Country → Province → District → Sector → School          (Rwanda)
 *
 * Every step is a plain dropdown listing only what belongs to the step before it; changing a step
 * clears every step after it. The school dropdown lists the official directory's schools of that
 * sector (GET /schools/search with the place — no search box) and ends with "My school is not
 * listed", which asks for the school's name: a missing-school request an administrator reviews.
 * Once a school is chosen its official information is shown, and it is sent by its official code
 * (or its internal id when it has none; a code is never invented).
 *
 * Another country: the school's name (international schools are not in the Rwandan directory).
 */
import { useQuery } from "@tanstack/react-query";
import { schoolDirectoryApi } from "@/lib/api/accounts";
import { errorMessage } from "@/lib/api/errors";
import { SCHOOL_CLAIM_RULES, type SchoolClaimDraft, type SchoolClaimField } from "@/lib/accounts/school-claim";
import type { DirectorySchool } from "@/lib/api/accounts";
import { RWANDA } from "@/lib/schools/countries";
import { byName, emptyPlace, NOT_LISTED, placeComplete, schoolFacts, type Place } from "@/lib/schools/school-cascade";
import { TextField } from "@/app/components/ui/form";
import { CascadeSelect, CountrySelect, PlaceSelects, SchoolFactsPanel } from "@/app/components/schools/SchoolCascade";

export const emptyDraft = (mode: SchoolClaimDraft["mode"]): SchoolClaimDraft =>
  mode === "directory"
    ? { mode, ...emptyPlace(), school: null }
    : mode === "notListed"
      ? { mode, name: "", ...emptyPlace() }
      : { mode, country: "", name: "" };

/** "Ngoma, Huye", or the school's location text when it has no sector / district. */
export const schoolPlace = (s: Pick<DirectorySchool, "sector" | "district" | "location">) => [s.sector, s.district].filter(Boolean).join(", ") || s.location;

const placeOf = (d: SchoolClaimDraft): Place =>
  d.mode === "abroad" ? emptyPlace() : { province: d.province ?? "", district: d.district ?? "", sector: d.sector ?? "" };

export default function SchoolClaimFields({
  value,
  onChange,
  errors,
}: {
  value: SchoolClaimDraft;
  onChange: (d: SchoolClaimDraft) => void;
  errors: Partial<Record<SchoolClaimField, string>>;
}) {
  const country = value.mode === "abroad" ? value.country : RWANDA;
  const place = placeOf(value);
  return (
    <fieldset className="space-y-4" data-testid="school-claim">
      <legend className="block text-sm font-semibold text-slate-700 mb-2">
        School <span className="text-red-500">*</span>
      </legend>
      <CountrySelect
        value={country}
        // Changing the country clears every later step.
        onChange={(c) => onChange(c === RWANDA ? emptyDraft("directory") : { mode: "abroad", country: c, name: "" })}
        error={errors.country}
      />
      {value.mode === "abroad" ? (
        value.country && (
          <TextField label="School name" name="schoolName" required maxLength={SCHOOL_CLAIM_RULES.nameMax} value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} error={errors.schoolName} hint="As it is written by the school." />
        )
      ) : (
        <>
          {/* A new province / district / sector clears the school (and a not-listed name). */}
          <PlaceSelects value={place} onChange={(p) => onChange({ mode: "directory", ...p, school: null })} errors={{ province: errors.province, district: errors.district, sector: errors.sector }} />
          {placeComplete(place) && <SchoolInSector place={place} value={value} onChange={onChange} errors={errors} />}
        </>
      )}
      <p className="text-xs text-slate-500">An administrator verifies your school before it is shown as confirmed.</p>
    </fieldset>
  );
}

function SchoolInSector({
  place,
  value,
  onChange,
  errors,
}: {
  place: Place;
  value: Exclude<SchoolClaimDraft, { mode: "abroad" }>;
  onChange: (d: SchoolClaimDraft) => void;
  errors: Partial<Record<SchoolClaimField, string>>;
}) {
  const schools = useQuery({
    queryKey: ["schools", "in-place", place.province, place.district, place.sector],
    queryFn: async () => byName(await schoolDirectoryApi.search({ province: place.province, district: place.district, sector: place.sector })),
    staleTime: 5 * 60_000,
  });
  const list = schools.data ?? [];
  const selected = value.mode === "notListed" ? NOT_LISTED : value.school?.id ?? "";
  const chosen = value.mode === "directory" && value.school ? list.find((s) => s.id === value.school!.id) ?? null : null;

  const choose = (id: string) => {
    if (id === NOT_LISTED) return onChange({ mode: "notListed", name: "", ...place });
    const s = list.find((x) => x.id === id);
    onChange({
      mode: "directory",
      ...place,
      school: s ? { id: s.id, code: s.code, name: s.name, place: schoolPlace(s), location: s.location, district: s.district, sector: s.sector } : null,
    });
  };

  if (schools.isError) {
    return (
      <p className="text-xs text-red-600" role="alert">
        Couldn&apos;t load the schools of {place.sector}. {errorMessage(schools.error)}{" "}
        <button type="button" className="font-semibold underline" onClick={() => void schools.refetch()}>
          Try again
        </button>
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <CascadeSelect
        label="School"
        value={selected}
        onChange={choose}
        disabled={schools.isPending}
        placeholder={schools.isPending ? "Loading schools…" : "Choose your school"}
        options={[
          ...list.map((s) => ({ value: s.id, label: s.code ? `${s.name} (${s.code})` : s.name })),
          { value: NOT_LISTED, label: "My school is not listed" },
        ]}
        error={value.mode === "directory" ? errors.school : undefined}
        hint={!schools.isPending && list.length === 0 ? `No school is listed in ${place.sector} yet. Choose “My school is not listed”.` : undefined}
        testId="cascade-school"
      />
      {value.mode === "notListed" && (
        <TextField
          label="School name"
          name="schoolName"
          required
          maxLength={SCHOOL_CLAIM_RULES.nameMax}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          error={errors.schoolName}
          hint={`Your school in ${place.sector}, ${place.district}. An administrator adds it to the directory and verifies it.`}
        />
      )}
      {chosen && <SchoolFactsPanel facts={schoolFacts(chosen, place)} />}
      {value.mode === "directory" && value.school && !chosen && !schools.isPending && (
        // The chosen school is no longer listed in this sector (e.g. deactivated meanwhile).
        <p className="text-xs text-red-600" role="alert">
          That school is no longer listed here. Choose your school again.
        </p>
      )}
    </div>
  );
}
