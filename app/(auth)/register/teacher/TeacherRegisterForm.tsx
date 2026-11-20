"use client";

/**
 * Teacher self-registration (`POST /auth/register/teacher`), the owner-approved design: an
 * application that an Administrator reviews. No account, school assignment or school record
 * exists until approval.
 *
 * Gate (lib/accounts/teacher-registration → teacherRegistrationGate): wait for GET /api/v1; the
 * backend must advertise `teacherSelfRegistration` and GET /auth/register/teacher/availability
 * must answer `open: true`. Otherwise the page says registration is not available and links to
 * the contact form and sign in. A failed check offers a retry. With `formAvailability`, the form also waits for
 * GET /forms/TEACHER_REGISTRATION (teacherPage): closed → the administrators' notice; failed → a retry.
 *
 * School: Country (Rwanda) → province → district → sector → school from the official directory (code and sector shown
 * read-only, never sent), or "My school is not listed" (name + sector, reviewed by an
 * Administrator). Home location: district → sector, separate from the school.
 *
 * One continuous form (app/components/forms/SignupForm, lib/forms/registration-fields → TEACHER_PARTS): the fields in
 * order, two per row on wider windows, one column on phones, then "Apply as a teacher". The rules are those of
 * validateTeacherRegistration; a failed check or a refused field: focus goes to the first highlighted field.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import SignupForm, { SIGNUP_FORM_CLASS, useSignupFocus } from "@/app/components/forms/SignupForm";
import { errorKeys } from "@/lib/forms/wizard";
import { TEACHER_PARTS, visibleParts } from "@/lib/forms/registration-fields";
import { useCountryOptions } from "@/lib/queries/countries";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { teacherRegistrationApi, type TeacherRegistrationResult } from "@/lib/api/teacher-registration";
import { hasFeature } from "@/lib/api/capabilities";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import OptionalAvatarField from "@/app/components/applications/OptionalAvatarField";
import { pictureOutcomeText, registrationAvatarProblem, registrationAvatarSupported, uploadRegistrationAvatar, type PictureOutcome } from "@/lib/accounts/registration-avatar";
import { applicationDetailsSupported, emptyTeacherExtra, teacherExtraPayload, validateTeacherExtra, type TeacherExtraDraft } from "@/lib/accounts/application-details";
import { TeacherExtraFields } from "@/app/components/applications/ExtraFields";
import { useSchoolLocations } from "@/lib/queries/school-directory";
import { queryKeys } from "@/lib/query/keys";
import {
  OLYMPIAD_SUBJECTS,
  PHONE_HINT,
  TEACHER_ERROR_FIELDS,
  TEACHER_REGISTER_ERRORS,
  TEACHER_RULES,
  buildTeacherPayload,
  emptyTeacherDraft,
  homeDistrictsOf,
  homeSectorsOf,
  mapServerFieldErrors,
  setHomeDistrict,
  setSchoolDistrict,
  setSchoolMode,
  setSchoolProvince,
  setSchoolSector,
  teacherRegistrationGate,
  teacherPage,
  toggleInterest,
  validateTeacherRegistration,
  type TeacherDraft,
  type TeacherField,
} from "@/lib/accounts/teacher-registration";
import { Alert, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { usePublicForm } from "@/lib/queries/forms";
import { formGate, noticeFromRefusal, noticeFromView } from "@/lib/forms/closed-form";
import ClosedFormNotice from "@/app/components/forms/ClosedFormNotice";
import { TextField } from "@/app/components/ui/form";
import NewPasswordFields from "@/app/components/auth/NewPasswordFields";
import { PlaceSelect } from "@/app/components/account/SchoolPlaceFields";
import { AuthHeading, JoinSwitch, SignInInstead } from "@/app/components/auth/AuthUi";
import { CascadeSelect, PlaceSelects, SectorSchoolSelect } from "@/app/components/schools/SchoolCascade";
import { countryName, RWANDA } from "@/lib/schools/countries";
import type { Place } from "@/lib/schools/school-cascade";

const primaryLink = "inline-flex w-full items-center justify-center rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-brand-dark";

const SUBTITLE = "Apply for a teacher account. An administrator reviews every application before the account is created.";

function Heading() {
  return (
    <>
      <JoinSwitch active="teacher" />
      <AuthHeading title="Join as a teacher" subtitle={SUBTITLE} />
    </>
  );
}

const Footer = SignInInstead;

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
  // formAvailability: the administrators' closed message for the teacher form. Only used when the FORM is closed —
  // the form may be open while the Teacher role is still disabled (TEACHERS_ENABLED), and then the generic text stays.
  // The open form also waits for GET /forms/TEACHER_REGISTRATION (teacherPage), and a failed lookup is retryable.
  const teacherForm = usePublicForm("TEACHER_REGISTRATION");
  const closedForm = noticeFromView(teacherForm.data);
  const page = teacherPage(gate.state, formGate(teacherForm.enabled, teacherForm));
  // Once the form is shown it stays (a background re-check must not remove it while someone types).
  const [shown, setShown] = useState(false);
  if (!shown && page === "open") setShown(true);

  if (shown) return <OpenForm />;

  if (page === "loading") {
    return (
      <div className="space-y-5" data-testid="teacher-register-loading">
        <Heading />
        <LoadingBlock label="Preparing the registration form…" />
        <p className="text-center text-xs text-slate-600">This can take up to a minute while the server wakes up.</p>
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
  if (page === "formFailed") {
    return (
      <div className="space-y-5" data-testid="teacher-register-form-error">
        <Heading />
        <ErrorState error={teacherForm.error} title="Couldn't check whether teacher registration is open" onRetry={() => void teacherForm.refetch()} />
        <Footer />
      </div>
    );
  }
  return (
    <div className="space-y-5" data-testid="teacher-register-unavailable">
      <Heading />
      {closedForm ? (
        <ClosedFormNotice notice={closedForm} />
      ) : (
        <>
          <Alert tone="info">Teacher registration is not available right now.</Alert>
          <p className="text-sm text-slate-700">
            If you teach at a school and would like to connect your students with the Rwanda Olympiad Foundation, send us a message and we will get in touch.
          </p>
        </>
      )}
      <Link href="/?subject=teacher#contact" className={primaryLink}>
        Contact us
      </Link>
      <Footer />
    </div>
  );
}

/** A new province, district or sector from the shared dropdowns: the steps after it start again. */
function schoolPlaceChanged(d: TeacherDraft, p: Place): TeacherDraft {
  if (p.province !== d.schoolProvince) return setSchoolProvince(d, p.province);
  if (p.district !== d.schoolDistrict) return setSchoolDistrict(d, p.district);
  return setSchoolSector(d, p.sector);
}

function OpenForm() {
  const teacherForm = usePublicForm("TEACHER_REGISTRATION");
  const [d, setD] = useState<TeacherDraft>(emptyTeacherDraft);
  // Position and years of experience (applicationDetails).
  const extraOn = applicationDetailsSupported(useBackendCapabilities().detection);
  const [extra, setExtra] = useState<TeacherExtraDraft>(emptyTeacherExtra);
  const [extraErrors, setExtraErrors] = useState<Partial<Record<keyof TeacherExtraDraft, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<TeacherField, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<TeacherRegistrationResult | null>(null);
  // Optional profile picture (REG-02): never required; uploaded with the registration's one-time token.
  const pictureOn = registrationAvatarSupported(useBackendCapabilities().detection);
  const [picture, setPicture] = useState<File | null>(null);
  const [pictureError, setPictureError] = useState<string | null>(null);
  const [pictureResult, setPictureResult] = useState<{ outcome: PictureOutcome; message?: string } | null>(null);
  const locations = useSchoolLocations();
  // Every country (capability countries: the reference list; otherwise the built-in list, as before).
  const countries = useCountryOptions().options;
  const set = <K extends keyof TeacherDraft>(k: K, v: TeacherDraft[K]) => setD((s) => ({ ...s, [k]: v }));
  const update = (fn: (s: TeacherDraft) => TeacherDraft) => setD(fn);
  const missing = d.schoolMode === "missing";
  // The fields this backend and these answers ask for, in order.
  const PARTS = visibleParts(TEACHER_PARTS, (part) => {
    if (part === "position" || part === "yearsOfExperience") return extraOn;
    if (part === "picture") return pictureOn;
    if (part === "proposedSchoolName") return missing;
    return true;
  });
  const focus = useSignupFocus();

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (submitting) return;
    const e = validateTeacherRegistration(d);
    const xe = extraOn ? validateTeacherExtra(extra) : {};
    setErrors(e);
    setExtraErrors(xe);
    setError(null);
    if (Object.keys(e).length || Object.keys(xe).length || pictureError) {
      focus.showErrors();
      return;
    }
    setSubmitting(true);
    try {
      const result = await teacherRegistrationApi.register({ ...buildTeacherPayload(d), ...(extraOn && teacherExtraPayload(extra)) });
      if (pictureOn) setPictureResult(await uploadRegistrationAvatar(result.avatarUploadToken, picture));
      setDone(result);
    } catch (err) {
      setError(err);
      const server = isApiError(err) ? mapServerFieldErrors(err.validationMessages) : {};
      const field = isApiError(err) ? TEACHER_ERROR_FIELDS[err.code] : undefined;
      if (field && isApiError(err)) server[field] = TEACHER_REGISTER_ERRORS[err.code];
      setErrors(server);
      // A refused field: focus on it. Other refusals: their message above the fields.
      if (errorKeys(server).length) focus.showErrors();
      else focus.showMessage();
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-5" data-testid="teacher-register-done">
        <AuthHeading title="Application received" />
        <Alert tone="success">Thank you for applying to join ROF LMS as a teacher.</Alert>
        <ul className="space-y-2 text-sm text-slate-700 list-disc pl-5">
          <li>Your application is pending review by an administrator. Your account is created only once it is approved.</li>
          {done.school && <li>School: <strong>{done.school.name}</strong>{done.school.code ? ` (code ${done.school.code})` : ""}.</li>}
          {done.proposedSchoolName && (
            <li>Your school <strong>{done.proposedSchoolName}</strong> isn&apos;t in the directory yet: an administrator will review it before approving your application.</li>
          )}
          <li>Once approved, sign in with the username and password you chose.</li>
        </ul>
        {pictureOutcomeText(pictureResult) && (
          <p className="text-sm text-slate-700" data-testid="picture-outcome">{pictureOutcomeText(pictureResult)}</p>
        )}
        <Link href="/" className={primaryLink}>
          Back to the homepage
        </Link>
      </div>
    );
  }

  // Closed by the administrators while the form was open in the browser (formAvailability): their message.
  const closedRefusal = isApiError(error) ? noticeFromRefusal(error, teacherForm.data) : null;
  const known = isApiError(error) && error.code ? TEACHER_REGISTER_ERRORS[error.code] : undefined;
  const serverFieldErrors = isApiError(error) && mapServerFieldErrors(error.validationMessages);
  const showAlert = error != null && (known || !serverFieldErrors || Object.keys(serverFieldErrors).length === 0);
  const places = locations.data;
  const schoolPlace = (only: "province" | "district" | "sector") => (
    <PlaceSelects
      only={only}
      labelPrefix="School "
      value={{ province: d.schoolProvince, district: d.schoolDistrict, sector: d.schoolSector }}
      onChange={(p) => update((s) => schoolPlaceChanged(s, p))}
      errors={{ province: errors.schoolProvince, district: errors.schoolDistrict, sector: errors.schoolSector }}
    />
  );

  const extraField = (only: keyof TeacherExtraDraft) =>
    extraOn && (
      <TeacherExtraFields
        only={only}
        value={extra}
        onChange={(k, val) => {
          setExtra((s) => ({ ...s, [k]: val }));
          setExtraErrors((s) => ({ ...s, [k]: undefined }));
        }}
        errors={extraErrors}
      />
    );
  const passwordProps = { password: d.password, confirm: d.confirm, onPassword: (v: string) => set("password", v), onConfirm: (v: string) => set("confirm", v), errors: { password: errors.password, confirm: errors.confirm }, label: "Password" };

  // The fields, part by part (lib/forms/registration-fields → TEACHER_PARTS), in two columns or one.
  const parts: Record<string, ReactNode> = {
    firstName: <TextField label="First name" placeholder="e.g. Aline" name="firstName" autoComplete="given-name" required maxLength={TEACHER_RULES.nameMax} value={d.firstName} onChange={(e) => set("firstName", e.target.value)} error={errors.firstName} />,
    lastName: <TextField label="Last name" placeholder="e.g. Uwase" name="lastName" autoComplete="family-name" required maxLength={TEACHER_RULES.nameMax} value={d.lastName} onChange={(e) => set("lastName", e.target.value)} error={errors.lastName} />,
    email: <TextField label="E-mail" placeholder="e.g. aline.uwase@example.com" name="email" type="email" autoComplete="email" required maxLength={254} value={d.email} onChange={(e) => set("email", e.target.value)} error={errors.email} />,
    phone: <TextField label="Phone" placeholder="e.g. 0788 123 456" name="phone" type="tel" autoComplete="tel" required maxLength={30} value={d.phone} onChange={(e) => set("phone", e.target.value)} error={errors.phone} hint={PHONE_HINT} />,
    country: <PlaceSelect label="Country" value={d.country} onChange={(v) => set("country", v)} options={countries} placeholder="Choose your country" error={errors.country} />,
    position: extraField("position"),
    yearsOfExperience: extraField("yearsOfExperience"),
    interests: (
      <div>
        <p className="mb-1 text-sm font-semibold text-slate-700">
          Olympiad interests <span className="text-red-500">*</span>
        </p>
        <div className="flex flex-wrap gap-4" role="group" aria-label="Olympiad interests" aria-describedby={errors.interests ? "interests-error" : "interests-hint"}>
          {OLYMPIAD_SUBJECTS.map((s) => (
            <label key={s.value} className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="olympiadInterests"
                value={s.value}
                checked={d.interests.includes(s.value)}
                onChange={() => set("interests", toggleInterest(d.interests, s.value))}
                aria-invalid={errors.interests ? true : undefined}
                className="h-4 w-4 rounded border-slate-300 accent-brand focus:ring-brand"
              />
              {s.label}
            </label>
          ))}
        </div>
        {errors.interests ? (
          <p id="interests-error" className="mt-1 text-xs text-red-600">
            {errors.interests}
          </p>
        ) : (
          <p id="interests-hint" className="mt-1 text-xs text-slate-600">
            The Olympiad subjects you would like to support. Choose at least one.
          </p>
        )}
      </div>
    ),
    picture: pictureOn && (
      <OptionalAvatarField
        file={picture}
        error={pictureError}
        onChange={(f) => {
          setPicture(f);
          setPictureError(registrationAvatarProblem(f));
        }}
      />
    ),
    // Country → Province → District → Sector → School: plain dropdowns; each step clears the ones after it.
    schoolCountry: (
      <CascadeSelect
        label="School country"
        value={RWANDA}
        onChange={() => undefined}
        options={[{ value: RWANDA, label: countryName(RWANDA) }]}
        disabled
        hint="Teacher applications are for schools in Rwanda, from the official list of Rwandan schools."
        testId="teacher-school-country"
      />
    ),
    schoolProvince: schoolPlace("province"),
    schoolDistrict: schoolPlace("district"),
    schoolSector: schoolPlace("sector"),
    school: (
      <SectorSchoolSelect
        teacherEligible
        place={{ province: d.schoolProvince, district: d.schoolDistrict, sector: d.schoolSector }}
        schoolId={missing ? "" : d.school?.id ?? ""}
        onChange={(school) => update((s) => ({ ...setSchoolMode(s, "listed"), school }))}
        notListed={{ selected: missing, onSelect: () => update((s) => setSchoolMode(s, "missing")) }}
        error={errors.school}
      />
    ),
    proposedSchoolName: missing && (
      <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
        <TextField
          label="School name"
          name="proposedSchoolName"
          required
          maxLength={TEACHER_RULES.schoolNameMax}
          value={d.proposedSchoolName}
          onChange={(e) => set("proposedSchoolName", e.target.value)}
          error={errors.proposedSchoolName}
          hint={`Your school in ${d.schoolSector}, ${d.schoolDistrict}.`}
        />
        <p className="text-xs text-slate-600">
          An administrator will review this school before approving your application. Nothing is added to the school directory automatically.
        </p>
      </div>
    ),
    homeDistrict: locations.isError ? (
      <p className="text-xs text-slate-600">Load the list of places above to choose your home location.</p>
    ) : (
      <PlaceSelect
        label="Home district"
        value={d.homeDistrict}
        onChange={(v) => update((s) => setHomeDistrict(s, v))}
        options={homeDistrictsOf(places)}
        placeholder={locations.isPending ? "Loading…" : "Choose"}
        disabled={locations.isPending}
        error={errors.homeDistrict}
      />
    ),
    homeSector: !locations.isError && (
      <PlaceSelect
        label="Home sector"
        value={d.homeSector}
        onChange={(v) => set("homeSector", v)}
        options={homeSectorsOf(places, d.homeDistrict)}
        placeholder={d.homeDistrict ? "Choose" : "Choose the district first"}
        disabled={!d.homeDistrict}
        error={errors.homeSector}
      />
    ),
    username: <TextField label="Username" placeholder="e.g. aline.uwase" name="username" autoComplete="username" required maxLength={30} value={d.username} onChange={(e) => set("username", e.target.value.toLowerCase())} error={errors.username} hint="Lowercase letters, digits, “.”, “_” or “-”." />,
    password: <NewPasswordFields only="password" {...passwordProps} />,
    confirm: <NewPasswordFields only="confirm" {...passwordProps} />,
  };

  return (
    <form onSubmit={onSubmit} noValidate className={SIGNUP_FORM_CLASS} data-testid="teacher-register-form">
      <SignupForm
        focus={focus}
        parts={PARTS}
        content={parts}
        submitLabel="Apply as a teacher"
        submittingLabel="Sending your application…"
        submitting={submitting}
        header={
          <>
            <JoinSwitch active="teacher" />
            <AuthHeading title="Apply as a teacher" subtitle={SUBTITLE} />
          </>
        }
        notices={
          <>
            {closedRefusal && <ClosedFormNotice notice={closedRefusal} />}
            {showAlert && !closedRefusal && <Alert tone="error">{known ?? errorMessage(error)}</Alert>}
            {teacherForm.data?.open && teacherForm.data.instructions?.trim() && (
              <p className="whitespace-pre-line text-sm text-slate-600" data-testid="form-instructions">{teacherForm.data.instructions.trim()}</p>
            )}
          </>
        }
        footer={<Footer />}
      />
    </form>
  );
}
