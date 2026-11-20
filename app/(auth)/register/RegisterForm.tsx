"use client";

/**
 * Student self-registration (`POST /auth/register/student`). Field rules mirror
 * the backend DTO. What happens next comes from the response: e-mail activation
 * and/or administrator approval, or signing in straight away. Administrators can
 * close self-registration (403 REGISTRATION_CLOSED).
 *
 * School: a backend advertising `schoolAffiliations` (GET /api/v1) takes a school
 * from the official directory, a Rwandan school that isn't listed, or a school
 * abroad (SchoolClaimFields); every other backend — and an unknown one — gets the
 * legacy name + location fields, which both accept.
 *
 * Gender (Female / Male; required) is asked for, and sent, only when the backend advertises `registrationGender`
 * (lib/accounts/gender; older backends refuse the field).
 *
 * Olympiad interests (Mathematics, Computing, Physics; at least one) are asked for, and sent, only
 * when the backend advertises `studentOlympiadInterests` (older backends refuse the field).
 *
 * Personal details (lib/accounts/student-details.ts) — date of birth, the student's phone (optional),
 * a close-family phone, the country where the student lives and the home location (Rwanda:
 * Province → District → Sector dropdowns; elsewhere free text) — only when the backend advertises
 * `studentRegistrationDetails`; otherwise the free-text home location as before.
 *
 * Until the backend has been detected the form is not shown (its school fields
 * and validation depend on it). If detection fails the page says so, offers a
 * retry, and lets the student continue with the legacy fields. Once a form is
 * chosen it is kept, so a later re-check can't swap fields while someone types.
 *
 * One continuous form (app/components/forms/SignupForm, lib/forms/registration-fields → STUDENT_PARTS): the fields in
 * order, two per row on wider windows where they pair naturally, one column on phones, then "Create my account". A
 * failed check or a refused field: focus goes to the first highlighted field.
 *
 * Closed registration (capability formAvailability): the page shows the administrator's closed message, opening time,
 * instructions and contact (GET /forms/STUDENT_REGISTRATION) instead of the form, and a refused submission shows the
 * same texts from the 403 REGISTRATION_CLOSED body. Other backends keep the fixed closed text.
 */
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { AuthHeading, JoinSwitch, SignInInstead } from "@/app/components/auth/AuthUi";
import SignupForm, { SIGNUP_FORM_CLASS, useSignupFocus } from "@/app/components/forms/SignupForm";
import { errorKeys } from "@/lib/forms/wizard";
import { STUDENT_PARTS, visibleParts } from "@/lib/forms/registration-fields";
import { publicApi, type RegisterStudentResult } from "@/lib/api/auth";
import type { GradeLevel } from "@/lib/api/types";
import { errorMessage, fieldErrors, isApiError } from "@/lib/api/errors";
import { Alert, LoadingBlock } from "@/app/components/ui/feedback";
import { Button, TextField } from "@/app/components/ui/form";
import NewPasswordFields, { validateNewPassword } from "@/app/components/auth/NewPasswordFields";
import SchoolClaimFields, { emptyDraft, type SchoolClaimPiece } from "@/app/components/account/SchoolClaimFields";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import OptionalAvatarField from "@/app/components/applications/OptionalAvatarField";
import { pictureOutcomeText, registrationAvatarProblem, registrationAvatarSupported, uploadRegistrationAvatar, type PictureOutcome } from "@/lib/accounts/registration-avatar";
import { usePublicForm } from "@/lib/queries/forms";
import { formGate, noticeFromRefusal, noticeFromView } from "@/lib/forms/closed-form";
import ClosedFormNotice from "@/app/components/forms/ClosedFormNotice";
import OlympiadInterestsField from "@/app/components/account/OlympiadInterestsField";
import GenderField from "@/app/components/account/GenderField";
import SearchableSelect from "@/app/components/ui/SearchableSelect";
import {
  chooseHomeCountry,
  emptyHome,
  followSchoolCountry,
  homeInRwanda as homeIsRwanda,
  homeLocationRulesSupported,
  homePlacePayload,
  schoolCountryOfClaim,
  validateHome,
  type HomeDraft,
} from "@/lib/accounts/home-location";
import { genderSupported, validateGender, type Gender } from "@/lib/accounts/gender";
import { studentInterestsSupported, validateInterests, type OlympiadSubject } from "@/lib/accounts/olympiad-interests";
import { registrationGate, type RegistrationSchoolMode } from "@/lib/accounts/registration-mode";
import {
  birthDateBounds,
  emptyStudentDetails,
  setHomeCountry,
  studentDetailsPayload,
  studentDetailsSupported,
  studentPersonalPayload,
  validateStudentPersonal,
  STUDENT_DETAILS_ERRORS,
  STUDENT_DETAILS_SERVER_FIELDS,
  validateStudentDetails,
  type StudentDetailsDraft,
  type StudentDetailsField,
} from "@/lib/accounts/student-details";
import { PHONE_HINT } from "@/lib/accounts/phone";
import { RWANDA } from "@/lib/schools/countries";
import { useCountryOptions } from "@/lib/queries/countries";
import { CascadeSelect, PlaceSelects } from "@/app/components/schools/SchoolCascade";
import {
  SCHOOL_CLAIM_ERRORS,
  SCHOOL_CLAIM_SERVER_FIELDS,
  schoolClaimPayload,
  validateSchoolClaim,
  type SchoolClaimDraft,
  type SchoolClaimField,
} from "@/lib/accounts/school-claim";

const GRADES: GradeLevel[] = ["S1", "S2", "S3", "S4", "S5", "S6"];
const USERNAME = /^[a-z0-9._-]{3,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FIELDS = ["firstName", "lastName", "username", "email", "password", "gradeLevel", "schoolName", "schoolLocation", "homeLocation", "olympiadInterests", "gender"] as const;
type F = (typeof FIELDS)[number] | "confirm";
const CLAIM_SERVER_FIELDS = Object.keys(SCHOOL_CLAIM_SERVER_FIELDS);

const REGISTER_ERRORS: Readonly<Record<string, string>> = {
  REGISTRATION_CLOSED: "Student registration is closed at the moment. Please try again later or contact us.",
  IDENTITY_TAKEN: "That username or e-mail is already in use. Try another, or sign in if you already have an account.",
  NO_CURRENT_ACADEMIC_YEAR: "Registration isn't open yet: the new school year hasn't started on ROF LMS. Please try again later.",
  ...SCHOOL_CLAIM_ERRORS,
};

export default function RegisterForm() {
  const [v, setV] = useState({ firstName: "", lastName: "", username: "", email: "", gradeLevel: "" as GradeLevel | "", schoolName: "", schoolLocation: "", homeLocation: "" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Partial<Record<F, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<RegisterStudentResult | null>(null);
  // Optional profile picture (REG-02): never required; uploaded with the registration's one-time token.
  const pictureOn = registrationAvatarSupported(useBackendCapabilities().detection);
  const [picture, setPicture] = useState<File | null>(null);
  const [pictureError, setPictureError] = useState<string | null>(null);
  const [pictureResult, setPictureResult] = useState<{ outcome: PictureOutcome; message?: string } | null>(null);
  const set = (k: keyof typeof v) => (val: string) => setV((s) => ({ ...s, [k]: val }));
  const caps = useBackendCapabilities();
  const gate = registrationGate(caps.detection, caps.fetching, caps.waking);
  const studentForm = usePublicForm("STUDENT_REGISTRATION");
  const [schoolMode, setSchoolMode] = useState<RegistrationSchoolMode | null>(null);
  // Olympiad interests: asked for only when the backend accepts them (decided with the school mode).
  const [interestsOn, setInterestsOn] = useState(false);
  const [interests, setInterests] = useState<OlympiadSubject[]>([]);
  // Gender: asked for (required) only when the backend accepts it (decided with the school mode).
  const [genderOn, setGenderOn] = useState(false);
  const [gender, setGender] = useState<Gender | "">("");
  // Personal details: asked for only when the backend accepts them (decided with the school mode).
  const [detailsOn, setDetailsOn] = useState(false);
  const [details, setDetails] = useState<StudentDetailsDraft>(emptyStudentDetails);
  // Home location (homeLocationRules): Home country (searchable; defaults to the school's country until the student
  // chooses one) → Rwanda only: province → district → sector (lib/accounts/home-location).
  const [rulesOn, setRulesOn] = useState(false);
  const [home, setHome] = useState<HomeDraft>(() => emptyHome(RWANDA));
  const [detailErrors, setDetailErrors] = useState<Partial<Record<StudentDetailsField, string>>>({});
  // Every country (capability countries: the reference list; otherwise the built-in list, as before).
  const countryList = useCountryOptions();
  const countries = countryList.options;
  const bounds = useMemo(() => birthDateBounds(new Date()), []);
  const setDetail = (next: StudentDetailsDraft, field?: StudentDetailsField) => {
    setDetails(next);
    if (field) setDetailErrors((s) => ({ ...s, [field]: undefined }));
  };
  // Adopt the first definite answer and keep it (state adjusted during render, not in an effect).
  if (schoolMode === null && gate.state === "ready") {
    setSchoolMode(gate.mode);
    setInterestsOn(studentInterestsSupported(caps.detection));
    setGenderOn(genderSupported(caps.detection));
    setDetailsOn(studentDetailsSupported(caps.detection));
    setRulesOn(studentDetailsSupported(caps.detection) && homeLocationRulesSupported(caps.detection));
  }
  const directory = schoolMode === "directory";
  const [claim, setClaim] = useState<SchoolClaimDraft>(() => emptyDraft("directory"));
  const [claimErrors, setClaimErrors] = useState<Partial<Record<SchoolClaimField, string>>>({});
  const homeInRwanda = rulesOn ? homeIsRwanda(home) : details.homeCountry === RWANDA;
  // The fields this backend and these answers ask for, in order.
  const PARTS = visibleParts(STUDENT_PARTS, (part) => {
    switch (part) {
      case "dateOfBirth":
      case "homeCountry":
      case "phone":
      case "guardianPhone":
        return detailsOn;
      case "picture":
        return detailsOn && pictureOn;
      case "olympiadInterests":
        return interestsOn;
      case "gender":
        return genderOn;
      case "schoolCountry":
      case "schoolNote":
        return directory;
      case "schoolProvince":
      case "schoolDistrict":
      case "schoolSector":
      case "school":
        return directory && claim.mode !== "abroad";
      case "schoolName":
        return !directory || claim.mode === "notListed" || (claim.mode === "abroad" && !!claim.country);
      case "schoolLocation":
        return !directory;
      case "homeProvince":
      case "homeDistrict":
      case "homeSector":
        return detailsOn && homeInRwanda;
      case "homeLocation":
        // homeLocationRules: another country needs only the country (no free-text home location).
        return !(detailsOn && rulesOn);
      default:
        return true;
    }
  });
  const focus = useSignupFocus();

  function validate() {
    const e: Partial<Record<F, string>> = {};
    if (!v.firstName.trim()) e.firstName = "Enter your first name.";
    if (!v.lastName.trim()) e.lastName = "Enter your last name.";
    if (genderOn) {
      const g = validateGender(gender);
      if (g) e.gender = g;
    }
    if (!USERNAME.test(v.username)) e.username = "3–30 characters: lowercase letters, digits, “.”, “_” or “-”.";
    if (!EMAIL.test(v.email.trim())) e.email = "Enter a valid e-mail address.";
    if (!v.gradeLevel) e.gradeLevel = "Choose your grade.";
    if (!directory) {
      if (v.schoolName.trim().length < 2) e.schoolName = "Enter your school's name.";
      if (v.schoolLocation.trim().length < 2) e.schoolLocation = "Enter your school's location (e.g. district).";
    }
    if (!detailsOn && v.homeLocation.trim().length < 2) e.homeLocation = "Enter where you live (e.g. district).";
    if (interestsOn) {
      const i = validateInterests(interests);
      if (i) e.olympiadInterests = i;
    }
    const p = validateNewPassword(password, confirm);
    if (p.password) e.password = p.password;
    if (p.confirm) e.confirm = p.confirm;
    return e;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (submitting || schoolMode === null) return;
    const e = validate();
    const ce = directory ? validateSchoolClaim(claim) : {};
    const de = !detailsOn ? {} : rulesOn ? { ...validateStudentPersonal(details), ...validateHome(home) } : validateStudentDetails(details);
    setErrors(e);
    setClaimErrors(ce);
    setDetailErrors(de);
    setError(null);
    if (Object.keys(e).length || Object.keys(ce).length || Object.keys(de).length || pictureError) {
      focus.showErrors();
      return;
    }
    setSubmitting(true);
    try {
      const res = await publicApi.registerStudent({
        firstName: v.firstName.trim(),
        lastName: v.lastName.trim(),
        username: v.username,
        email: v.email.trim(),
        password,
        gradeLevel: v.gradeLevel as GradeLevel,
        ...(directory ? schoolClaimPayload(claim) : { schoolName: v.schoolName.trim(), schoolLocation: v.schoolLocation.trim() }),
        ...(!detailsOn
          ? { homeLocation: v.homeLocation.trim() }
          : rulesOn
            ? { ...studentPersonalPayload(details), homeCountry: home.country, ...homePlacePayload(home) }
            : studentDetailsPayload(details)),
        ...(interestsOn && { olympiadInterests: interests }),
        ...(genderOn && gender && { gender }),
      });
      if (pictureOn) setPictureResult(await uploadRegistrationAvatar(res.avatarUploadToken, picture));
      setDone(res);
    } catch (err) {
      setError(err);
      const fe = fieldErrors(err, FIELDS);
      setErrors(fe);
      let sde: Partial<Record<StudentDetailsField, string>> = {};
      let sce: Partial<Record<SchoolClaimField, string>> = {};
      if (detailsOn) {
        const server: Partial<Record<StudentDetailsField, string>> = fieldErrors(err, STUDENT_DETAILS_SERVER_FIELDS);
        const coded = isApiError(err) && err.code ? STUDENT_DETAILS_ERRORS[err.code] : undefined;
        if (coded) server[coded.field] = coded.message;
        setDetailErrors(server);
        sde = server;
      }
      if (directory) {
        const server = fieldErrors(err, CLAIM_SERVER_FIELDS);
        sce = Object.fromEntries(Object.entries(server).map(([k, m]) => [SCHOOL_CLAIM_SERVER_FIELDS[k], m]));
        setClaimErrors(sce);
      }
      // A refused field: focus on it. Other refusals: their message above the fields.
      if (errorKeys(fe, sde, sce).length) focus.showErrors();
      else focus.showMessage();
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-5" data-testid="register-done">
        <AuthHeading title="Welcome to ROF LMS!" />
        <Alert tone="success">Your student account <strong>{done.username}</strong> has been created.</Alert>
        <ul className="space-y-2 text-sm text-slate-700 list-disc pl-5">
          {done.requiresEmailVerification && <li>We sent an activation link to your e-mail address. Open it to activate your account.</li>}
          {done.requiresApproval && <li>An administrator will review and approve your account. You can sign in once it is approved.</li>}
          {done.schoolVerification === "PENDING" && <li>An administrator will check your school. Until then it is shown as not yet verified.</li>}
          {!done.requiresEmailVerification && !done.requiresApproval && <li>You can sign in now.</li>}
        </ul>
        {pictureOutcomeText(pictureResult) && (
          <p className="text-sm text-slate-700" data-testid="picture-outcome">{pictureOutcomeText(pictureResult)}</p>
        )}
        <Link href="/login" className="inline-flex w-full items-center justify-center rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-brand-dark">
          Go to sign in
        </Link>
      </div>
    );
  }

  if (schoolMode === null) {
    return (
      <div className="space-y-5" data-testid="register-gate">
        <JoinSwitch active="student" />
        <AuthHeading title="Join as a student" subtitle="Create your free ROF account and start preparing for the Olympiads." />
        {gate.state === "failed" ? (
          <div className="space-y-4" data-testid="register-detection-failed">
            <Alert tone="error">We couldn&apos;t reach the ROF LMS server to prepare the registration form.</Alert>
            <p className="text-sm text-slate-600">Check your connection and try again. The server can take up to a minute to wake up.</p>
            <Button type="button" variant="brand" className="w-full" onClick={caps.retry} disabled={gate.retrying} data-testid="register-retry">
              {gate.retrying ? "Trying again…" : "Try again"}
            </Button>
            <Button type="button" variant="secondary" className="w-full" onClick={() => setSchoolMode("legacy")}>
              Continue with the basic form
            </Button>
          </div>
        ) : (
          <div data-testid="register-loading">
            <LoadingBlock label={gate.state === "loading" && gate.waking ? "The server is waking up…" : "Preparing the registration form…"} />
            <p className="text-center text-xs text-slate-600">This can take up to a minute while the server wakes up.</p>
          </div>
        )}
        <SignInInstead />
      </div>
    );
  }

  // formAvailability: never show the form before GET /forms/STUDENT_REGISTRATION has answered, and never assume
  // it is open when the lookup fails (a retryable message instead). Older backends: not applicable, as before.
  const studentGate = formGate(studentForm.enabled, studentForm);
  if (studentGate === "loading" || studentGate === "failed") {
    return (
      <div className="space-y-5" data-testid="register-form-check">
        <JoinSwitch active="student" />
        <AuthHeading title="Join as a student" subtitle="Create your free ROF account and start preparing for the Olympiads." />
        {studentGate === "failed" ? (
          <div className="space-y-4" data-testid="register-form-check-failed">
            <Alert tone="error">We couldn&apos;t check whether student registration is open.</Alert>
            <p className="text-sm text-slate-600">Check your connection and try again. The server can take up to a minute to wake up.</p>
            <Button type="button" variant="brand" className="w-full" onClick={() => void studentForm.refetch()} disabled={studentForm.isFetching} data-testid="register-form-retry">
              {studentForm.isFetching ? "Trying again…" : "Try again"}
            </Button>
          </div>
        ) : (
          <div data-testid="register-form-loading">
            <LoadingBlock label="Checking whether registration is open…" />
          </div>
        )}
        <SignInInstead />
      </div>
    );
  }

  // Registration closed by the administrators (formAvailability): their message instead of the form.
  const closedNow = noticeFromView(studentForm.data);
  if (closedNow) {
    return (
      <div className="space-y-5" data-testid="register-closed">
        <JoinSwitch active="student" />
        <AuthHeading title="Join as a student" />
        <ClosedFormNotice notice={closedNow} />
        <SignInInstead />
      </div>
    );
  }
  const closedRefusal = isApiError(error) ? noticeFromRefusal(error, studentForm.data) : null;
  const coded = isApiError(error) && error.code ? STUDENT_DETAILS_ERRORS[error.code] : undefined;
  const known = isApiError(error) && error.code ? REGISTER_ERRORS[error.code] : undefined;
  const fieldErr =
    !!coded || Object.keys(fieldErrors(error, [...(directory ? [...FIELDS, ...CLAIM_SERVER_FIELDS] : FIELDS), ...(detailsOn ? STUDENT_DETAILS_SERVER_FIELDS : [])])).length > 0;

  const claimPiece = (only: SchoolClaimPiece) => (
    <SchoolClaimFields
      only={only}
      value={claim}
      onChange={(d) => {
        setClaim(d);
        setClaimErrors({});
        // The home country follows the school's country until the student chooses one (never overwritten).
        if (rulesOn) setHome((h) => followSchoolCountry(h, schoolCountryOfClaim(d)));
      }}
      errors={claimErrors}
      countryOptions={countryList.supported ? countries : undefined}
      labelPrefix="School "
    />
  );
  // Province → District → Sector of the official list; each step clears the ones after it.
  const homePlace = (only: "province" | "district" | "sector") => (
    <PlaceSelects
      only={only}
      labelPrefix="Home "
      testIdPrefix="home"
      value={rulesOn ? home.place : details.home}
      onChange={(place) => {
        if (rulesOn) setHome((h) => ({ ...h, place }));
        else setDetails({ ...details, home: place });
        setDetailErrors((s) => ({ ...s, homeProvince: undefined, homeDistrict: undefined, homeSector: undefined }));
      }}
      errors={{ province: detailErrors.homeProvince, district: detailErrors.homeDistrict, sector: detailErrors.homeSector }}
    />
  );
  const passwordProps = { password, confirm, onPassword: setPassword, onConfirm: setConfirm, errors: { password: errors.password, confirm: errors.confirm }, label: "Password" };

  // The fields, part by part (lib/forms/registration-fields → STUDENT_PARTS), in two columns or one.
  const parts: Record<string, ReactNode> = {
    firstName: <TextField label="First name" placeholder="e.g. Aline" name="firstName" autoComplete="given-name" required maxLength={100} value={v.firstName} onChange={(e) => set("firstName")(e.target.value)} error={errors.firstName} />,
    lastName: <TextField label="Last name" placeholder="e.g. Uwase" name="lastName" autoComplete="family-name" required maxLength={100} value={v.lastName} onChange={(e) => set("lastName")(e.target.value)} error={errors.lastName} />,
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
    dateOfBirth: detailsOn && (
      <TextField
        label="Date of birth"
        name="dateOfBirth"
        type="date"
        autoComplete="bday"
        required
        min={bounds.min}
        max={bounds.max}
        value={details.dateOfBirth}
        onChange={(e) => setDetail({ ...details, dateOfBirth: e.target.value }, "dateOfBirth")}
        error={detailErrors.dateOfBirth}
      />
    ),
    homeCountry: detailsOn && rulesOn ? (
      <SearchableSelect
        label="Home country"
        value={home.country}
        onChange={(c) => {
          setHome((h) => chooseHomeCountry(h, c));
          setDetailErrors((s) => ({ ...s, homeCountry: undefined, homeProvince: undefined, homeDistrict: undefined, homeSector: undefined }));
        }}
        options={countries}
        placeholder="Type to search for your country"
        error={detailErrors.homeCountry}
        hint="Where you live. It starts as your school's country; change it if you live elsewhere."
        testId="home-country"
      />
    ) : detailsOn && (
      <CascadeSelect
        label="Country where you live"
        value={details.homeCountry}
        onChange={(c) => setDetail(setHomeCountry(details, c), "homeCountry")}
        options={countries}
        placeholder="Choose your country"
        error={detailErrors.homeCountry}
        testId="home-country"
      />
    ),
    phone: detailsOn && (
      <TextField
        label="Your phone (optional)"
        name="phone"
        type="tel"
        placeholder="e.g. 0788 123 456"
        autoComplete="tel"
        maxLength={30}
        value={details.phone}
        onChange={(e) => setDetail({ ...details, phone: e.target.value }, "phone")}
        error={detailErrors.phone}
        hint="Leave empty if you don't have one."
      />
    ),
    guardianPhone: detailsOn && (
      <TextField
        label="Close-family phone"
        name="guardianPhone"
        type="tel"
        placeholder="e.g. 0788 123 456"
        required
        maxLength={30}
        value={details.guardianPhone}
        onChange={(e) => setDetail({ ...details, guardianPhone: e.target.value }, "guardianPhone")}
        error={detailErrors.guardianPhone}
        hint={`A parent or close family member. ${PHONE_HINT}`}
      />
    ),
    picture: detailsOn && pictureOn && (
      <OptionalAvatarField
        file={picture}
        error={pictureError}
        onChange={(f) => {
          setPicture(f);
          setPictureError(registrationAvatarProblem(f));
        }}
      />
    ),
    gradeLevel: (
      <div>
        <label htmlFor="gradeLevel" className="block text-sm font-semibold text-slate-700 mb-2">
          Grade <span className="text-red-500">*</span>
        </label>
        <select
          id="gradeLevel"
          name="gradeLevel"
          required
          value={v.gradeLevel}
          onChange={(e) => set("gradeLevel")(e.target.value)}
          aria-invalid={errors.gradeLevel ? true : undefined}
          aria-describedby={errors.gradeLevel ? "gradeLevel-error" : "gradeLevel-hint"}
          className={`w-full px-4 py-3 bg-white border rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 ${errors.gradeLevel ? "border-red-400 focus:ring-red-500/20" : "border-slate-300 focus:ring-brand/20 focus:border-brand"}`}
        >
          <option value="">Choose your grade</option>
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {g} ({["S1", "S2", "S3"].includes(g) ? "Junior" : "Senior"} division)
            </option>
          ))}
        </select>
        {errors.gradeLevel ? (
          <p id="gradeLevel-error" className="mt-1.5 text-xs text-red-600">{errors.gradeLevel}</p>
        ) : (
          <p id="gradeLevel-hint" className="mt-1.5 text-xs text-slate-600">S1–S3 study in the Junior division, S4–S6 in the Senior division.</p>
        )}
      </div>
    ),
    olympiadInterests: interestsOn && (
      <OlympiadInterestsField
        value={interests}
        onChange={(next) => {
          setInterests(next);
          setErrors((s) => ({ ...s, olympiadInterests: undefined }));
        }}
        error={errors.olympiadInterests}
      />
    ),
    schoolCountry: directory && claimPiece("country"),
    schoolProvince: directory && claimPiece("province"),
    schoolDistrict: directory && claimPiece("district"),
    schoolSector: directory && claimPiece("sector"),
    school: directory && claimPiece("school"),
    schoolName: directory ? (
      claimPiece("name")
    ) : (
      <TextField label="School" name="schoolName" required maxLength={200} autoComplete="off" value={v.schoolName} onChange={(e) => set("schoolName")(e.target.value)} error={errors.schoolName} />
    ),
    schoolLocation: !directory && (
      <TextField label="School location" name="schoolLocation" required maxLength={200} value={v.schoolLocation} onChange={(e) => set("schoolLocation")(e.target.value)} error={errors.schoolLocation} hint="District or city" />
    ),
    schoolNote: directory && claimPiece("note"),
    homeProvince: detailsOn && homeInRwanda && homePlace("province"),
    homeDistrict: detailsOn && homeInRwanda && homePlace("district"),
    homeSector: detailsOn && homeInRwanda && homePlace("sector"),
    homeLocation: detailsOn ? (
      !homeInRwanda && (
        <TextField
          label="Home city or region"
          name="homeLocation"
          autoComplete="address-level2"
          required
          maxLength={200}
          value={details.homeLocation}
          onChange={(e) => setDetail({ ...details, homeLocation: e.target.value }, "homeLocation")}
          error={detailErrors.homeLocation}
        />
      )
    ) : (
      <TextField label="Home location" name="homeLocation" autoComplete="address-level2" required maxLength={200} value={v.homeLocation} onChange={(e) => set("homeLocation")(e.target.value)} error={errors.homeLocation} hint="District or city where you live" />
    ),
    username: <TextField label="Username" placeholder="e.g. aline.uwase" name="username" autoComplete="username" required maxLength={30} value={v.username} onChange={(e) => set("username")(e.target.value.toLowerCase())} error={errors.username} hint="Lowercase letters, digits, “.”, “_” or “-”." />,
    email: <TextField label="E-mail" placeholder="e.g. aline.uwase@example.com" name="email" type="email" autoComplete="email" required maxLength={254} value={v.email} onChange={(e) => set("email")(e.target.value)} error={errors.email} />,
    password: <NewPasswordFields only="password" {...passwordProps} />,
    confirm: <NewPasswordFields only="confirm" {...passwordProps} />,
  };

  return (
    <form onSubmit={onSubmit} noValidate className={SIGNUP_FORM_CLASS}>
      <SignupForm
        focus={focus}
        parts={PARTS}
        content={parts}
        submitLabel="Create my account"
        submittingLabel="Creating your account…"
        submitting={submitting}
        header={
          <>
            <JoinSwitch active="student" />
            <AuthHeading title="Join as a student" subtitle="Create your free ROF account and start preparing for the Olympiads." />
          </>
        }
        notices={
          <>
            {closedRefusal && <ClosedFormNotice notice={closedRefusal} />}
            {error != null && !fieldErr && !closedRefusal && <Alert tone="error">{known ?? errorMessage(error)}</Alert>}
            {studentForm.data?.open && studentForm.data.instructions?.trim() && (
              <p className="whitespace-pre-line text-sm text-slate-600" data-testid="form-instructions">{studentForm.data.instructions.trim()}</p>
            )}
            {error != null && fieldErr && <Alert tone="error">Please check the highlighted fields.</Alert>}
          </>
        }
        footer={<SignInInstead />}
      />
    </form>
  );
}
