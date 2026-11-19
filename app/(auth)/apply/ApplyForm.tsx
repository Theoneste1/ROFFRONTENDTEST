"use client";

/**
 * Coach application (`POST /mentor-requests`). Coaches are the people who
 * mentor ROF students (the platform's MENTOR accounts). An administrator reviews
 * the request (Coaches → Applications) and the applicant is e-mailed the decision.
 * `?as=teacher`: on a backend advertising `teacherSelfRegistration` it links to
 * the teacher application (/register/teacher, which checks whether it is open).
 * Otherwise teachers cannot register themselves: with `teacherAccounts`, only ROF
 * administrators create Teacher accounts, so the page says so and links to the
 * contact form either way.
 */
import { useState, type FormEvent } from "react";
import { useCountryOptions } from "@/lib/queries/countries";
import Link from "next/link";
import { AuthHeading, JoinSwitch, SignInInstead } from "@/app/components/auth/AuthUi";
import { useSearchParams } from "next/navigation";
import { publicApi } from "@/lib/api/auth";
import { errorMessage, fieldErrors, isApiError } from "@/lib/api/errors";
import { Alert } from "@/app/components/ui/feedback";
import { Button, TextField } from "@/app/components/ui/form";
import NewPasswordFields, { validateNewPassword } from "@/app/components/auth/NewPasswordFields";
import { hasFeature } from "@/lib/api/capabilities";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import OptionalAvatarField from "@/app/components/applications/OptionalAvatarField";
import { pictureOutcomeText, registrationAvatarProblem, registrationAvatarSupported, uploadRegistrationAvatar, type PictureOutcome } from "@/lib/accounts/registration-avatar";
import { applicationDetailsSupported, coachExtraPayload, emptyCoachExtra, validateCoachExtra, type CoachExtraDraft } from "@/lib/accounts/application-details";
import { CoachExtraFields } from "@/app/components/applications/ExtraFields";
import {
  coachDetailsPayload,
  coachDetailsSupported,
  EDUCATION_LEVELS,
  emptyCoachDetails,
  validateCoachDetails,
  type CoachDetailsDraft,
  type CoachDetailsField,
} from "@/lib/accounts/coach-application";
import { CascadeSelect } from "@/app/components/schools/SchoolCascade";
import OlympiadInterestsField from "@/app/components/account/OlympiadInterestsField";
import { FormSection } from "@/app/components/auth/AuthUi";

const USERNAME = /^[a-z0-9._-]{3,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FIELDS = ["firstName", "lastName", "username", "email", "password"] as const;
type F = (typeof FIELDS)[number] | "confirm";
const DETAIL_FIELDS = ["country", "occupation", "educationLevel", "olympiadInterests"] as const;

export default function ApplyForm() {
  const teacher = useSearchParams().get("as") === "teacher";
  const detection = useBackendCapabilities().detection;
  const teacherAccounts = hasFeature(detection, "teacherAccounts");
  // The backend implements the teacher application (whether it is open is checked on that page).
  const teacherSelfRegistration = hasFeature(detection, "teacherSelfRegistration");
  const role = "Coach";
  // Country, occupation, education and interests: only when the backend accepts them.
  const detailsOn = coachDetailsSupported(detection);
  // Phone, affiliation, expertise, experience (applicationDetails).
  const extraOn = applicationDetailsSupported(detection);
  const [extra, setExtra] = useState<CoachExtraDraft>(emptyCoachExtra);
  const [extraErrors, setExtraErrors] = useState<Partial<Record<keyof CoachExtraDraft, string>>>({});
  const [details, setDetails] = useState<CoachDetailsDraft>(emptyCoachDetails);
  const [detailErrors, setDetailErrors] = useState<Partial<Record<CoachDetailsField, string>>>({});
  // Every country (capability countries: the reference list; otherwise the built-in list, as before).
  const countries = useCountryOptions().options;
  const setDetail = <K extends keyof CoachDetailsDraft>(k: K, val: CoachDetailsDraft[K], field: CoachDetailsField) => {
    setDetails((s) => ({ ...s, [k]: val }));
    setDetailErrors((s) => ({ ...s, [field]: undefined }));
  };
  const [v, setV] = useState({ firstName: "", lastName: "", username: "", email: "" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Partial<Record<F, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  // Optional profile picture (REG-02): never required; uploaded with the registration's one-time token.
  const pictureOn = registrationAvatarSupported(useBackendCapabilities().detection);
  const [picture, setPicture] = useState<File | null>(null);
  const [pictureError, setPictureError] = useState<string | null>(null);
  const [pictureResult, setPictureResult] = useState<{ outcome: PictureOutcome; message?: string } | null>(null);
  const set = (k: keyof typeof v) => (val: string) => setV((s) => ({ ...s, [k]: val }));

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (submitting) return;
    const e: Partial<Record<F, string>> = {};
    if (v.firstName.trim().length < 2) e.firstName = "Enter your first name (at least 2 characters).";
    if (v.lastName.trim().length < 2) e.lastName = "Enter your last name (at least 2 characters).";
    if (!USERNAME.test(v.username)) e.username = "3–30 characters: lowercase letters, digits, “.”, “_” or “-”.";
    if (!EMAIL.test(v.email.trim())) e.email = "Enter a valid e-mail address.";
    const p = validateNewPassword(password, confirm);
    if (p.password) e.password = p.password;
    if (p.confirm) e.confirm = p.confirm;
    const de = detailsOn ? validateCoachDetails(details) : {};
    const xe = extraOn ? validateCoachExtra(extra) : {};
    setErrors(e);
    setDetailErrors(de);
    setExtraErrors(xe);
    setError(null);
    if (Object.keys(e).length || Object.keys(de).length || Object.keys(xe).length || pictureError) return;
    setSubmitting(true);
    try {
      const applied = await publicApi.applyAsMentor({
        firstName: v.firstName.trim(),
        lastName: v.lastName.trim(),
        username: v.username,
        email: v.email.trim(),
        password,
        ...(detailsOn && coachDetailsPayload(details)),
        ...(extraOn && coachExtraPayload(extra)),
      });
      if (pictureOn) setPictureResult(await uploadRegistrationAvatar(applied.avatarUploadToken, picture));
      setDone(true);
    } catch (err) {
      setError(err);
      setErrors(fieldErrors(err, FIELDS));
      if (detailsOn) setDetailErrors(fieldErrors(err, DETAIL_FIELDS));
    } finally {
      setSubmitting(false);
    }
  }

  if (teacher) {
    return (
      <div className="space-y-5" data-testid="apply-teacher">
        <JoinSwitch active="teacher" />
        <AuthHeading title="Join as a teacher" />
        {teacherSelfRegistration ? (
          <>
            <p className="text-sm text-slate-700">
              Teachers apply for an account with their school and contact details. An administrator reviews every application and links the account to your school.
            </p>
            <Link href="/register/teacher" className="inline-flex w-full items-center justify-center rounded-lg bg-[#2B2BB2] px-6 py-3 text-sm font-semibold text-white hover:bg-[#232c94]" data-testid="apply-teacher-register">
              Apply as a teacher
            </Link>
          </>
        ) : teacherAccounts ? (
          <>
            <Alert tone="info">Teacher accounts are created by ROF administrators. There is no self-registration for teachers.</Alert>
            <p className="text-sm text-slate-700">
              Send us a message with your name, your school and its school code. An administrator creates your account, links it to your school and e-mails you an activation link.
            </p>
          </>
        ) : (
          <>
            <Alert tone="info">Teacher accounts are not available on ROF LMS yet.</Alert>
            <p className="text-sm text-slate-700">
              If you teach at a school and would like to connect your students with the Rwanda Olympiad Foundation, send us a message and we will get in touch.
            </p>
          </>
        )}
        {teacherSelfRegistration ? (
          <p className="text-center text-sm text-slate-600">
            Questions? <Link href="/?subject=teacher#contact" className="font-medium text-[#2B2BB2] hover:underline">Contact us</Link>
          </p>
        ) : (
          <Link href="/?subject=teacher#contact" className="inline-flex w-full items-center justify-center rounded-lg bg-[#2B2BB2] px-6 py-3 text-sm font-semibold text-white hover:bg-[#232c94]">
            Contact us
          </Link>
        )}
        <p className="text-center text-sm text-slate-600">
          Want to mentor ROF students? <Link href="/apply" className="font-medium text-[#2B2BB2] hover:underline">Apply as a coach</Link>
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-5" data-testid="apply-done">
        <AuthHeading title="Application received" />
        <Alert tone="success">Thank you for applying to join ROF LMS as a {role.toLowerCase()}.</Alert>
        <p className="text-sm text-slate-700">
          An administrator will review your application. You will receive an e-mail at <strong>{v.email.trim()}</strong> with the decision. Once approved, sign in with the username and password you chose.
        </p>
        {pictureOutcomeText(pictureResult) && (
          <p className="text-sm text-slate-700" data-testid="picture-outcome">{pictureOutcomeText(pictureResult)}</p>
        )}
        <Link href="/" className="inline-flex w-full items-center justify-center rounded-lg bg-[#2B2BB2] px-6 py-3 text-sm font-semibold text-white hover:bg-[#232c94]">
          Back to the homepage
        </Link>
      </div>
    );
  }

  const taken = isApiError(error) && error.code === "IDENTITY_TAKEN";
  const fieldErr = Object.keys(fieldErrors(error, detailsOn ? [...FIELDS, ...DETAIL_FIELDS] : FIELDS)).length > 0;
  const teacherHref = teacherSelfRegistration ? "/register/teacher" : "/apply?as=teacher";

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <JoinSwitch active="coach" />
      <div>
        <AuthHeading title={`Join as a ${role.toLowerCase()}`} />
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Coaches mentor ROF students: you prepare assignments, share resources and review student work for the courses you are assigned. An administrator reviews every application.
        </p>
        <p className="mt-2 text-xs text-slate-600">
          A school teacher?{" "}
          <Link href={teacherHref} className="font-medium text-[#2B2BB2] hover:underline">
            Join as a teacher
          </Link>{" "}
          instead.
        </p>
      </div>

      {error != null && !fieldErr && (
        <Alert tone="error">
          {taken ? "That username or e-mail is already in use or has a pending application. Try another, or sign in if you already have an account." : errorMessage(error)}
        </Alert>
      )}

      {error != null && fieldErr && <Alert tone="error">Please check the highlighted fields.</Alert>}

      <FormSection step={1} title="About you">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="First name" name="firstName" autoComplete="given-name" required maxLength={50} value={v.firstName} onChange={(e) => set("firstName")(e.target.value)} error={errors.firstName} />
          <TextField label="Last name" name="lastName" autoComplete="family-name" required maxLength={50} value={v.lastName} onChange={(e) => set("lastName")(e.target.value)} error={errors.lastName} />
        </div>
        {detailsOn && (
          <CascadeSelect label="Country" value={details.country} onChange={(c) => setDetail("country", c, "country")} options={countries} placeholder="Choose your country" error={detailErrors.country} testId="coach-country" />
        )}
      </FormSection>

      {detailsOn && (
        <FormSection step={2} title="Your background">
          <TextField
            label="Current or most recent occupation"
            name="occupation"
            required
            maxLength={200}
            value={details.occupation}
            onChange={(e) => setDetail("occupation", e.target.value, "occupation")}
            error={detailErrors.occupation}
            hint="For example: mathematics teacher, engineering student, software developer."
          />
          <CascadeSelect
            label="Highest level of education"
            value={details.educationLevel}
            onChange={(l) => setDetail("educationLevel", l as CoachDetailsDraft["educationLevel"], "educationLevel")}
            options={EDUCATION_LEVELS}
            placeholder="Choose your level of education"
            error={detailErrors.educationLevel}
            hint="Completed or in progress."
            testId="coach-education"
          />
          <OlympiadInterestsField
            value={details.interests}
            onChange={(next) => setDetail("interests", next, "olympiadInterests")}
            error={detailErrors.olympiadInterests}
            hint="The Olympiads you would like to coach. Choose one or more."
          />
          {extraOn && (
            <CoachExtraFields
              value={extra}
              onChange={(k, val) => {
                setExtra((s) => ({ ...s, [k]: val }));
                setExtraErrors((s) => ({ ...s, [k]: undefined }));
              }}
              errors={extraErrors}
            />
          )}
          {pictureOn && (
            <OptionalAvatarField
              file={picture}
              error={pictureError}
              onChange={(f) => {
                setPicture(f);
                setPictureError(registrationAvatarProblem(f));
              }}
            />
          )}
        </FormSection>
      )}

      <FormSection step={detailsOn ? 3 : 2} title="Your account">
        <TextField label="Username" name="username" autoComplete="username" required maxLength={30} value={v.username} onChange={(e) => set("username")(e.target.value.toLowerCase())} error={errors.username} hint="Lowercase letters, digits, “.”, “_” or “-”." />
        <TextField label="E-mail" name="email" type="email" autoComplete="email" required maxLength={254} value={v.email} onChange={(e) => set("email")(e.target.value)} error={errors.email} hint="We'll e-mail you the decision on your application." />
        <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} errors={{ password: errors.password, confirm: errors.confirm }} label="Password" />
      </FormSection>

      <Button type="submit" loading={submitting} className="w-full">
        {submitting ? "Sending your application…" : `Apply as a ${role.toLowerCase()}`}
      </Button>

      <SignInInstead />
    </form>
  );
}
