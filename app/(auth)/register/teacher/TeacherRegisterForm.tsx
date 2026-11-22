"use client";

/**
 * Teacher self-registration (`POST /auth/register/teacher`). A listed school (owner 2026-11-21): the TEACHER account is
 * created at once, linked to the school by its code — the teacher is signed in and taken to the teacher dashboard
 * (unless the e-mail must be confirmed first: then "check your e-mail"). A school that is not listed yet: an application
 * an Administrator reviews; no account, school assignment or school record exists until approval.
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
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/session";
import { postLoginPath } from "@/lib/auth/roles";
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
import OlympiadInterestsField from "@/app/components/account/OlympiadInterestsField";
import { otherInterestSupported } from "@/lib/accounts/olympiad-interests";
import OptionalAvatarField from "@/app/components/applications/OptionalAvatarField";
import { pictureOutcomeText, registrationAvatarProblem, registrationAvatarSupported, uploadRegistrationAvatar, type PictureOutcome } from "@/lib/accounts/registration-avatar";
import GenderField from "@/app/components/account/GenderField";
import SearchableSelect from "@/app/components/ui/SearchableSelect";
import { homeLocationRulesSupported } from "@/lib/accounts/home-location";
import { genderSupported, validateGender, type Gender } from "@/lib/accounts/gender";
import { applicationDetailsSupported, emptyTeacherExtra, teacherExtraPayload, validateTeacherExtra, type TeacherExtraDraft } from "@/lib/accounts/application-details";
import { TeacherExtraFields } from "@/app/components/applications/ExtraFields";
import { useSchoolLocations } from "@/lib/queries/school-directory";
import { queryKeys } from "@/lib/query/keys";
import {
  PHONE_HINT,
  TEACHER_ERROR_FIELDS,
  TEACHER_REGISTER_ERRORS,
  TEACHER_RULES,
  buildTeacherPayload,
  emptyTeacherDraft,
  homeDistrictsOf,
  homeSectorsOf,
  mapServerFieldErrors,
  setHomeCountry,
  setHomeDistrict,
  setSchoolDistrict,
  setSchoolMode,
  setSchoolProvince,
  setSchoolSector,
  teacherRegistrationGate,
  teacherPage,
  validateTeacherRegistration,
  SCHOOL_ACCOMMODATION_OPTIONS,
  SCHOOL_OWNERSHIP_OPTIONS,
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
          <Alert tone="info">Teacher registration isn&apos;t open on ROF LMS yet.</Alert>
          <p className="text-sm text-slate-700">
            If you teach at a school, send us a message with your name and your school. We&apos;ll let you know as soon as teachers can apply, and
            help you connect your students with the Rwanda Olympiad Foundation in the meantime.
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
  // Gender (required) on a backend with registrationGender.
  const genderOn = genderSupported(useBackendCapabilities().detection);
  // Home location (homeLocationRules): Home country (searchable; Rwanda by default — teacher schools are in Rwanda — and
  // kept once chosen) → Rwanda only: province → district → sector (lib/accounts/home-location).
  const homeRules = homeLocationRulesSupported(useBackendCapabilities().detection);
  // "My school is not listed" with the school's official details (owner 2026-11-22); older backends: the name only.
  const schoolDetails = hasFeature(useBackendCapabilities().detection, "teacherUnlistedSchoolDetails");
  const homeInRwanda = d.country.trim().toUpperCase() === RWANDA;
  const [gender, setGender] = useState<Gender | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<TeacherRegistrationResult | null>(null);
  // Optional profile picture (REG-02): never required; uploaded with the registration's one-time token.
  const pictureOn = registrationAvatarSupported(useBackendCapabilities().detection);
  // "Other" Olympiad interest (olympiadInterestOther).
  const otherOn = otherInterestSupported(useBackendCapabilities().detection);
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
    if (part === "gender") return genderOn;
    if (part === "homeProvince") return homeRules && homeInRwanda;
    if (part === "homeDistrict" || part === "homeSector") return !homeRules || homeInRwanda;
    if (part === "proposedSchoolName") return missing;
    return true;
  });
  const focus = useSignupFocus();
  const session = useSession();
  const router = useRouter();
  // The account was created but signing in right away failed (shown on the done view with a link to sign in).
  const [signInFailed, setSignInFailed] = useState(false);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (submitting) return;
    const e = validateTeacherRegistration(d, homeRules, schoolDetails);
    const ge = genderOn ? validateGender(gender) : undefined;
    if (ge) e.gender = ge;
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
      const result = await teacherRegistrationApi.register({ ...buildTeacherPayload(d, homeRules, schoolDetails), ...(extraOn && teacherExtraPayload(extra)), ...(genderOn && gender && { gender }) });
      if (pictureOn) setPictureResult(await uploadRegistrationAvatar(result.avatarUploadToken, picture));
      // A listed school: the account exists — sign in and open the teacher dashboard (no Administrator involved).
      if (result.accountCreated && !result.emailVerificationRequired) {
        try {
          const user = await session.login(result.username ?? d.username.trim().toLowerCase(), d.password);
          router.replace(postLoginPath(user.role, null));
          return;
        } catch {
          setSignInFailed(true);
        }
      }
      setDone(result);
    } catch (err) {
      setError(err);
      const server = isApiError(err) ? mapServerFieldErrors(err.validationMessages) : {};
      const field = isApiError(err) ? TEACHER_ERROR_FIELDS[err.code] : undefined;
      // SCHOOL_CODE_LISTED names the listed school: the server's message is shown as given.
      if (field && isApiError(err)) server[field] = TEACHER_REGISTER_ERRORS[err.code] ?? err.message;
      setErrors(server);
      // A refused field: focus on it. Other refusals: their message above the fields.
      if (errorKeys(server).length) focus.showErrors();
      else focus.showMessage();
    } finally {
      setSubmitting(false);
    }
  }

  if (done?.accountCreated) {
    return (
      <div className="space-y-5" data-testid="teacher-register-done">
        <AuthHeading title="Your teacher account is ready" />
        <Alert tone="success">Welcome to ROF LMS. Your account is linked to your school.</Alert>
        <ul className="space-y-2 text-sm text-slate-700 list-disc pl-5">
          {done.school && <li>School: <strong>{done.school.name}</strong>{done.school.code ? ` (code ${done.school.code})` : ""}.</li>}
          <li>You will see the students who registered with your school, and you can submit their tests.</li>
          {done.emailVerificationRequired
            ? <li data-testid="teacher-register-verify">We sent you an e-mail: confirm your address, then sign in with the username and password you chose.</li>
            : signInFailed && <li>Sign in with the username and password you chose.</li>}
        </ul>
        {pictureOutcomeText(pictureResult) && (
          <p className="text-sm text-slate-700" data-testid="picture-outcome">{pictureOutcomeText(pictureResult)}</p>
        )}
        <Link href="/login" className={primaryLink} data-testid="teacher-register-sign-in">
          Sign in
        </Link>
      </div>
    );
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
  const homePlace = (only: "province" | "district" | "sector") => (
    <PlaceSelects
      only={only}
      labelPrefix="Home "
      testIdPrefix="home"
      value={{ province: d.homeProvince, district: d.homeDistrict, sector: d.homeSector }}
      onChange={(p) => {
        update((s) => ({ ...s, homeProvince: p.province, homeDistrict: p.district, homeSector: p.sector }));
        setErrors((s) => ({ ...s, homeProvince: undefined, homeDistrict: undefined, homeSector: undefined }));
      }}
      errors={{ province: errors.homeProvince, district: errors.homeDistrict, sector: errors.homeSector }}
    />
  );
  const passwordProps = { password: d.password, confirm: d.confirm, onPassword: (v: string) => set("password", v), onConfirm: (v: string) => set("confirm", v), errors: { password: errors.password, confirm: errors.confirm }, label: "Password" };

  // The fields, part by part (lib/forms/registration-fields → TEACHER_PARTS), in two columns or one.
  const parts: Record<string, ReactNode> = {
    firstName: <TextField label="First name" placeholder="e.g. Theoneste" name="firstName" autoComplete="given-name" required maxLength={TEACHER_RULES.nameMax} value={d.firstName} onChange={(e) => set("firstName", e.target.value)} error={errors.firstName} />,
    lastName: <TextField label="Last name" placeholder="e.g. Nsanza" name="lastName" autoComplete="family-name" required maxLength={TEACHER_RULES.nameMax} value={d.lastName} onChange={(e) => set("lastName", e.target.value)} error={errors.lastName} />,
    gender: genderOn && (
      <GenderField
        value={gender}
        onChange={(g) => {
          setGender(g);
          setErrors((s) => ({ ...s, gender: undefined }));
        }}
        error={errors.gender}
      />
    ),
    email: <TextField label="E-mail" placeholder="e.g. theoneste.nsanza@example.com" name="email" type="email" autoComplete="email" required maxLength={254} value={d.email} onChange={(e) => set("email", e.target.value)} error={errors.email} />,
    phone: <TextField label="Phone" placeholder="e.g. 0788 123 456" name="phone" type="tel" autoComplete="tel" required maxLength={30} value={d.phone} onChange={(e) => set("phone", e.target.value)} error={errors.phone} hint={PHONE_HINT} />,
    country: homeRules ? (
      <SearchableSelect
        label="Home country"
        value={d.country}
        onChange={(c) => {
          update((s) => setHomeCountry(s, c));
          setErrors((s) => ({ ...s, country: undefined, homeProvince: undefined, homeDistrict: undefined, homeSector: undefined }));
        }}
        options={countries}
        placeholder="Type to search for your country"
        error={errors.country}
        hint="Where you live. It starts as Rwanda, your school's country; change it if you live elsewhere."
        testId="home-country"
      />
    ) : (
      <PlaceSelect label="Country" value={d.country} onChange={(v) => set("country", v)} options={countries} placeholder="Choose your country" error={errors.country} />
    ),
    position: extraField("position"),
    yearsOfExperience: extraField("yearsOfExperience"),
    interests: (
      <OlympiadInterestsField
        idPrefix="interests"
        value={d.interests}
        onChange={(next) => set("interests", next)}
        error={errors.interests}
        hint="The Olympiad subjects you would like to support. Choose at least one."
        other={d.interestOther}
        onOtherChange={otherOn ? (next) => set("interestOther", next) : undefined}
      />
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
    proposedSchoolName: missing && (schoolDetails ? (
      <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4" data-testid="unlisted-school">
        <p className="text-sm font-semibold text-slate-900">Your school&apos;s details</p>
        <p className="text-xs text-slate-600">
          Give your school&apos;s official details. An administrator checks them and adds the school to the official list — nothing is
          typed again. Your account is created when it is approved.
        </p>
        <TextField
          label="Official school name"
          name="proposedSchoolName"
          required
          maxLength={TEACHER_RULES.schoolNameMax}
          placeholder="As on official documents"
          value={d.proposedSchoolName}
          onChange={(e) => set("proposedSchoolName", e.target.value)}
          error={errors.proposedSchoolName}
        />
        <TextField
          label="School code"
          name="proposedSchoolCode"
          required
          inputMode="numeric"
          maxLength={6}
          placeholder="6 digits"
          value={d.proposedSchoolCode}
          onChange={(e) => set("proposedSchoolCode", e.target.value.replace(/\D/g, "").slice(0, 6))}
          error={errors.proposedSchoolCode}
          hint="The school's 6-digit code from the Ministry of Education list."
        />
        <p className="text-sm text-slate-700" data-testid="unlisted-school-place">
          Place: {d.schoolSector}, {d.schoolDistrict}, {d.schoolProvince} (chosen above)
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField
            label="Cell (optional)"
            name="proposedSchoolCell"
            maxLength={100}
            value={d.proposedSchoolCell}
            onChange={(e) => set("proposedSchoolCell", e.target.value)}
            error={errors.proposedSchoolCell}
          />
          <TextField
            label="Village (optional)"
            name="proposedSchoolVillage"
            maxLength={100}
            value={d.proposedSchoolVillage}
            onChange={(e) => set("proposedSchoolVillage", e.target.value)}
            error={errors.proposedSchoolVillage}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PlaceSelect
            label="Ownership"
            value={d.proposedSchoolOwnership}
            onChange={(v) => set("proposedSchoolOwnership", v as TeacherDraft["proposedSchoolOwnership"])}
            options={SCHOOL_OWNERSHIP_OPTIONS}
            error={errors.proposedSchoolOwnership}
            testId="unlisted-school-ownership"
          />
          <PlaceSelect
            label="Day or boarding"
            value={d.proposedSchoolAccommodation}
            onChange={(v) => set("proposedSchoolAccommodation", v as TeacherDraft["proposedSchoolAccommodation"])}
            options={SCHOOL_ACCOMMODATION_OPTIONS}
            error={errors.proposedSchoolAccommodation}
            testId="unlisted-school-accommodation"
          />
        </div>
      </div>
    ) : (
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
    )),
    // homeLocationRules: Province → District → Sector of the official list; each step clears the ones after it.
    homeProvince: homeRules && homeInRwanda && homePlace("province"),
    homeDistrict: homeRules ? homeInRwanda && homePlace("district") : locations.isError ? (
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
    homeSector: homeRules ? homeInRwanda && homePlace("sector") : !locations.isError && (
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
    username: <TextField label="Username" placeholder="e.g. theoneste.nsanza" name="username" autoComplete="username" required maxLength={30} value={d.username} onChange={(e) => set("username", e.target.value.toLowerCase())} error={errors.username} hint="Lowercase letters, digits, “.”, “_” or “-”." />,
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
