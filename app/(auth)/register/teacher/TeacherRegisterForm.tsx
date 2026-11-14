"use client";

/**
 * Teacher self-registration (`POST /auth/register/teacher`), the owner-approved design: an
 * application that an Administrator reviews. No account, school assignment or school record
 * exists until approval.
 *
 * Gate (lib/accounts/teacher-registration → teacherRegistrationGate): wait for GET /api/v1; the
 * backend must advertise `teacherSelfRegistration` and GET /auth/register/teacher/availability
 * must answer `open: true`. Otherwise the page says registration is not available and links to
 * the contact form and sign in. A failed check offers a retry.
 *
 * School: province → district → school from the official directory (code and sector shown
 * read-only, never sent), or "My school is not listed" (name + sector, reviewed by an
 * Administrator). Home location: district → sector, separate from the school.
 */
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { teacherRegistrationApi, type TeacherRegistrationResult } from "@/lib/api/teacher-registration";
import { hasFeature } from "@/lib/api/capabilities";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { useSchoolLocations } from "@/lib/queries/school-directory";
import { queryKeys } from "@/lib/query/keys";
import {
  OLYMPIAD_SUBJECTS,
  PHONE_HINT,
  TEACHER_ERROR_FIELDS,
  TEACHER_REGISTER_ERRORS,
  TEACHER_RULES,
  buildTeacherPayload,
  countryOptions,
  districtsOf,
  emptyTeacherDraft,
  homeDistrictsOf,
  homeSectorsOf,
  mapServerFieldErrors,
  provincesOf,
  sectorsOf,
  setHomeDistrict,
  setSchoolDistrict,
  setSchoolMode,
  setSchoolProvince,
  teacherRegistrationGate,
  toggleInterest,
  validateTeacherRegistration,
  type TeacherDraft,
  type TeacherField,
} from "@/lib/accounts/teacher-registration";
import { Alert, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { Button, TextField } from "@/app/components/ui/form";
import NewPasswordFields from "@/app/components/auth/NewPasswordFields";
import { DistrictSchoolSelect, PlaceSelect } from "@/app/components/account/SchoolPlaceFields";

const linkCls = "font-medium text-[#2B2BB2] hover:underline";
const primaryLink = "inline-flex w-full items-center justify-center rounded-lg bg-[#2B2BB2] px-6 py-3 text-sm font-semibold text-white hover:bg-[#232c94]";

function Heading() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Join as a teacher</h1>
      <p className="mt-1 text-sm text-slate-500">Apply for a teacher account. An administrator reviews every application before the account is created.</p>
    </div>
  );
}

function Footer() {
  return (
    <p className="text-center text-sm text-slate-500">
      Already have an account?{" "}
      <Link href="/login" className={linkCls}>Sign in</Link>
      {" · "}
      <Link href="/" className={linkCls}>Home</Link>
    </p>
  );
}

export default function TeacherRegisterForm() {
  const caps = useBackendCapabilities();
  const feature = hasFeature(caps.detection, "teacherSelfRegistration");
  const availability = useQuery({
    queryKey: queryKeys.teacherRegistration.availability(),
    queryFn: teacherRegistrationApi.availability,
    enabled: feature,
    retry: 1,
  });
  const gate = teacherRegistrationGate(caps.detection, { status: availability.status, open: availability.data?.open });
  // Once the form is shown it stays (a background re-check must not remove it while someone types).
  const [shown, setShown] = useState(false);
  if (!shown && gate.state === "open") setShown(true);

  if (shown) return <OpenForm />;

  if (gate.state === "loading" || gate.state === "availabilityLoading") {
    return (
      <div className="space-y-5" data-testid="teacher-register-loading">
        <Heading />
        <LoadingBlock label="Preparing the registration form…" />
        <p className="text-center text-xs text-slate-500">This can take up to a minute while the server wakes up.</p>
        <Footer />
      </div>
    );
  }
  if (gate.state === "detectionFailed" || gate.state === "availabilityError") {
    return (
      <div className="space-y-5" data-testid="teacher-register-error">
        <Heading />
        <ErrorState
          error={gate.state === "availabilityError" ? availability.error : null}
          title="Couldn't check whether teacher registration is open"
          onRetry={() => (gate.state === "availabilityError" ? void availability.refetch() : caps.retry())}
        />
        <Footer />
      </div>
    );
  }
  return (
    <div className="space-y-5" data-testid="teacher-register-unavailable">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Join as a teacher</h1>
      <Alert tone="info">Teacher registration is not available right now.</Alert>
      <p className="text-sm text-slate-700">
        If you teach at a school and would like to connect your students with the Rwanda Olympiad Foundation, send us a message and we will get in touch.
      </p>
      <Link href="/?subject=teacher#contact" className={primaryLink}>
        Contact us
      </Link>
      <Footer />
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 border-t border-slate-200 pt-5">
      <legend className="sr-only">{title}</legend>
      <div>
        <h2 className="text-base font-semibold text-slate-900" aria-hidden="true">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      {children}
    </fieldset>
  );
}

function OpenForm() {
  const [d, setD] = useState<TeacherDraft>(emptyTeacherDraft);
  const [errors, setErrors] = useState<Partial<Record<TeacherField, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<TeacherRegistrationResult | null>(null);
  const locations = useSchoolLocations();
  const countries = useMemo(() => countryOptions(), []);
  const set = <K extends keyof TeacherDraft>(k: K, v: TeacherDraft[K]) => setD((s) => ({ ...s, [k]: v }));
  const update = (fn: (s: TeacherDraft) => TeacherDraft) => setD(fn);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (submitting) return;
    const e = validateTeacherRegistration(d);
    setErrors(e);
    setError(null);
    if (Object.keys(e).length) return;
    setSubmitting(true);
    try {
      setDone(await teacherRegistrationApi.register(buildTeacherPayload(d)));
    } catch (err) {
      setError(err);
      const server = isApiError(err) ? mapServerFieldErrors(err.validationMessages) : {};
      const field = isApiError(err) ? TEACHER_ERROR_FIELDS[err.code] : undefined;
      if (field && isApiError(err)) server[field] = TEACHER_REGISTER_ERRORS[err.code];
      setErrors(server);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-5" data-testid="teacher-register-done">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Application received</h1>
        <Alert tone="success">Thank you for applying to join ROF LMS as a teacher.</Alert>
        <ul className="space-y-2 text-sm text-slate-700 list-disc pl-5">
          <li>Your application is pending review by an administrator. Your account is created only once it is approved.</li>
          {done.school && <li>School: <strong>{done.school.name}</strong>{done.school.code ? ` (code ${done.school.code})` : ""}.</li>}
          {done.proposedSchoolName && (
            <li>Your school <strong>{done.proposedSchoolName}</strong> isn&apos;t in the directory yet: an administrator will review it before approving your application.</li>
          )}
          <li>Once approved, sign in with the username and password you chose.</li>
        </ul>
        <Link href="/" className={primaryLink}>
          Back to the homepage
        </Link>
      </div>
    );
  }

  const known = isApiError(error) && error.code ? TEACHER_REGISTER_ERRORS[error.code] : undefined;
  const serverFieldErrors = isApiError(error) && mapServerFieldErrors(error.validationMessages);
  const showAlert = error != null && (known || !serverFieldErrors || Object.keys(serverFieldErrors).length === 0);
  const places = locations.data;
  const missing = d.schoolMode === "missing";

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5" data-testid="teacher-register-form">
      <Heading />

      {showAlert && <Alert tone="error">{known ?? errorMessage(error)}</Alert>}

      <Section title="Personal information">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="First name" name="firstName" autoComplete="given-name" required maxLength={TEACHER_RULES.nameMax} value={d.firstName} onChange={(e) => set("firstName", e.target.value)} error={errors.firstName} />
          <TextField label="Last name" name="lastName" autoComplete="family-name" required maxLength={TEACHER_RULES.nameMax} value={d.lastName} onChange={(e) => set("lastName", e.target.value)} error={errors.lastName} />
        </div>
        <TextField label="Username" name="username" autoComplete="username" required maxLength={30} value={d.username} onChange={(e) => set("username", e.target.value.toLowerCase())} error={errors.username} hint="Lowercase letters, digits, “.”, “_” or “-”." />
        <TextField label="E-mail" name="email" type="email" autoComplete="email" required maxLength={254} value={d.email} onChange={(e) => set("email", e.target.value)} error={errors.email} />
        <div className="grid gap-4 sm:grid-cols-2">
          <PlaceSelect label="Country" value={d.country} onChange={(v) => set("country", v)} options={countries} placeholder="Choose your country" error={errors.country} />
          <TextField label="Phone" name="phone" type="tel" autoComplete="tel" required maxLength={30} value={d.phone} onChange={(e) => set("phone", e.target.value)} error={errors.phone} hint={PHONE_HINT} />
        </div>
      </Section>

      <Section title="Olympiad interests" description="The Olympiad subjects you would like to support. Choose at least one.">
        <div className="flex flex-wrap gap-4" role="group" aria-label="Olympiad interests" aria-describedby={errors.interests ? "interests-error" : undefined}>
          {OLYMPIAD_SUBJECTS.map((s) => (
            <label key={s.value} className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="olympiadInterests"
                value={s.value}
                checked={d.interests.includes(s.value)}
                onChange={() => set("interests", toggleInterest(d.interests, s.value))}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              {s.label}
            </label>
          ))}
        </div>
        {errors.interests && (
          <p id="interests-error" className="text-xs text-red-600">
            {errors.interests}
          </p>
        )}
      </Section>

      <Section title="School" description="The school where you teach, from the official list of Rwandan schools.">
        {locations.isError ? (
          <ErrorState error={locations.error} title="Couldn't load the list of places" onRetry={() => void locations.refetch()} />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <PlaceSelect
                label="Province"
                value={d.schoolProvince}
                onChange={(v) => update((s) => setSchoolProvince(s, v))}
                options={provincesOf(places)}
                placeholder={locations.isPending ? "Loading…" : "Choose"}
                disabled={locations.isPending}
                error={errors.schoolProvince}
              />
              <PlaceSelect
                label="District"
                value={d.schoolDistrict}
                onChange={(v) => update((s) => setSchoolDistrict(s, v))}
                options={districtsOf(places, d.schoolProvince)}
                disabled={!d.schoolProvince}
                error={errors.schoolDistrict}
              />
            </div>
            {!missing && (
              <DistrictSchoolSelect officialOnly province={d.schoolProvince} district={d.schoolDistrict} value={d.school} onChange={(school) => set("school", school)} error={errors.school} />
            )}
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={missing}
                onChange={(e) => update((s) => setSchoolMode(s, e.target.checked ? "missing" : "listed"))}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                data-testid="school-missing"
              />
              My school is not listed
            </label>
            {missing && (
              <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                <TextField
                  label="School name"
                  name="proposedSchoolName"
                  required
                  maxLength={TEACHER_RULES.schoolNameMax}
                  value={d.proposedSchoolName}
                  onChange={(e) => set("proposedSchoolName", e.target.value)}
                  error={errors.proposedSchoolName}
                />
                <PlaceSelect
                  label="Sector"
                  value={d.schoolSector}
                  onChange={(v) => set("schoolSector", v)}
                  options={sectorsOf(places, d.schoolProvince, d.schoolDistrict)}
                  placeholder={d.schoolDistrict ? "Choose" : "Choose the district first"}
                  disabled={!d.schoolDistrict}
                  error={errors.schoolSector}
                />
                <p className="text-xs text-slate-600">
                  An administrator will review this school before approving your application. Nothing is added to the school directory automatically.
                </p>
              </div>
            )}
          </>
        )}
      </Section>

      <Section title="Home location" description="Where you live (separate from your school).">
        {!locations.isError && (
          <div className="grid gap-4 sm:grid-cols-2">
            <PlaceSelect
              label="Home district"
              value={d.homeDistrict}
              onChange={(v) => update((s) => setHomeDistrict(s, v))}
              options={homeDistrictsOf(places)}
              placeholder={locations.isPending ? "Loading…" : "Choose"}
              disabled={locations.isPending}
              error={errors.homeDistrict}
            />
            <PlaceSelect
              label="Home sector"
              value={d.homeSector}
              onChange={(v) => set("homeSector", v)}
              options={homeSectorsOf(places, d.homeDistrict)}
              placeholder={d.homeDistrict ? "Choose" : "Choose the district first"}
              disabled={!d.homeDistrict}
              error={errors.homeSector}
            />
          </div>
        )}
        {locations.isError && <p className="text-xs text-slate-500">Load the list of places above to choose your home location.</p>}
      </Section>

      <Section title="Account security">
        <NewPasswordFields
          password={d.password}
          confirm={d.confirm}
          onPassword={(v) => set("password", v)}
          onConfirm={(v) => set("confirm", v)}
          errors={{ password: errors.password, confirm: errors.confirm }}
          label="Password"
        />
      </Section>

      <Button type="submit" loading={submitting} className="w-full">
        {submitting ? "Sending your application…" : "Apply as a teacher"}
      </Button>

      <Footer />
    </form>
  );
}
