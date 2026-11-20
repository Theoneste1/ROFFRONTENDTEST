"use client";

/**
 * My Profile → Home location (capability homeLocationRules; PATCH /me): the same rules as the registration forms
 * (lib/accounts/home-location). Home country (searchable) → Rwanda only: province → district → sector, all required;
 * another country clears them. Every role. Separate from the school location (unchanged here).
 */
import { useState, type FormEvent } from "react";
import { MapPin } from "lucide-react";
import { Section } from "./Section";
import SearchableSelect from "@/app/components/ui/SearchableSelect";
import { PlaceSelects } from "@/app/components/schools/SchoolCascade";
import { Alert } from "@/app/components/ui/feedback";
import { Button } from "@/app/components/ui/form";
import { useUpdateMe } from "@/lib/queries/account";
import { useCountryOptions } from "@/lib/queries/countries";
import { errorMessage, fieldErrors, isApiError } from "@/lib/api/errors";
import type { CurrentUser } from "@/lib/api/types";
import {
  HOME_ERRORS,
  chooseHomeCountry,
  homeFromProfile,
  homeInRwanda,
  homePlacePayload,
  validateHome,
  type HomeDraft,
  type HomeField,
} from "@/lib/accounts/home-location";

const HOME_FIELDS = ["homeCountry", "homeProvince", "homeDistrict", "homeSector"] as const;

export default function HomeLocationCard({ user }: { user: CurrentUser }) {
  const update = useUpdateMe();
  const countries = useCountryOptions().options;
  const [home, setHome] = useState<HomeDraft>(() => homeFromProfile(user));
  const [errors, setErrors] = useState<Partial<Record<HomeField, string>>>({});
  const [saved, setSaved] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    const errs = validateHome(home);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    update.mutate(
      { homeCountry: home.country, ...homePlacePayload(home) },
      {
        onSuccess: (me) => {
          setSaved(true);
          setHome(homeFromProfile(me));
        },
        onError: (err) => {
          const server: Partial<Record<HomeField, string>> = fieldErrors(err, HOME_FIELDS);
          const coded = isApiError(err) && err.code ? HOME_ERRORS[err.code] : undefined;
          if (coded) server[coded.field] = coded.message;
          setErrors(server);
        },
      },
    );
  }

  const shownError = update.isError && Object.keys(errors).length === 0;
  return (
    <Section title="Home location" icon={<MapPin className="w-5 h-5" />} description="Where you live. Separate from your school's location.">
      <form onSubmit={onSubmit} noValidate className="space-y-4" data-testid="home-location-form">
        {saved && <Alert tone="success">Your home location was saved.</Alert>}
        {shownError && <Alert tone="error">{errorMessage(update.error)}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SearchableSelect
            label="Home country"
            value={home.country}
            onChange={(c) => {
              setHome((h) => chooseHomeCountry(h, c));
              setErrors({});
              setSaved(false);
            }}
            options={countries}
            placeholder="Type to search for your country"
            error={errors.homeCountry}
            testId="profile-home-country"
          />
          {homeInRwanda(home) && (
            <>
              {(["province", "district", "sector"] as const).map((level) => (
                <PlaceSelects
                  key={level}
                  only={level}
                  labelPrefix="Home "
                  testIdPrefix="profile-home"
                  value={home.place}
                  onChange={(place) => {
                    setHome((h) => ({ ...h, place }));
                    setErrors({});
                    setSaved(false);
                  }}
                  errors={{ province: errors.homeProvince, district: errors.homeDistrict, sector: errors.homeSector }}
                />
              ))}
            </>
          )}
        </div>
        <div className="flex justify-end">
          <Button type="submit" loading={update.isPending} data-testid="home-location-save">
            Save home location
          </Button>
        </div>
      </form>
    </Section>
  );
}
