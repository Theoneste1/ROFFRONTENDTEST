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
 *
 * One continuous form (app/components/forms/SignupForm, lib/forms/registration-fields → coachParts): the fields in order,
 * two per row on wider windows, one column on phones, then "Apply as a coach". A failed check or a refused field: focus
 * goes to the first highlighted field. The teacher page (`?as=teacher`) is its own component, so switching between
 * Coach and Teacher always starts the coach form afresh.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { useCountryOptions } from "@/lib/queries/countries";
import Link from "next/link";
import { AuthHeading, JoinSwitch, SignInInstead } from "@/app/components/auth/AuthUi";
import { publicApi } from "@/lib/api/auth";
import { errorMessage, fieldErrors, isApiError } from "@/lib/api/errors";
import { Alert } from "@/app/components/ui/feedback";
import { TextField } from "@/app/components/ui/form";
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
  COACH_SUBJECTS_LABEL,
} from "@/lib/accounts/coach-application";
import { CascadeSelect } from "@/app/components/schools/SchoolCascade";
import OlympiadInterestsField from "@/app/components/account/OlympiadInterestsField";
import SignupForm, { SIGNUP_FORM_CLASS, useSignupFocus } from "@/app/components/forms/SignupForm";
import { errorKeys } from "@/lib/forms/wizard";
import { coachParts } from "@/lib/forms/registration-fields";

const USERNAME = /^[a-z0-9._-]{3,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FIELDS = ["firstName", "lastName", "username", "email", "password"] as const;
type F = (typeof FIELDS)[number] | "confirm";
const DETAIL_FIELDS = ["country", "occupation", "educationLevel", "olympiadInterests"] as const;

/** `teacher`: the page was opened with `?as=teacher` (read by page.tsx). */
export default function ApplyForm({ teacher }: { teacher: boolean }) {
  return teacher ? <TeacherJoin /> : <CoachApplication />;
}

/** `?as=teacher`: how teachers join (the teacher application, or the contact form). */
function TeacherJoin() {
  const detection = useBackendCapabilities().detection;
  const teacherAccounts = hasFeature(detection, "teacherAccounts");
  // The backend implements the teacher application (whether it is open is checked on that page).
  const teacherSelfRegistration = hasFeature(detection, "teacherSelfRegistration");
  return (
    <div className="space-y-5" data-testid="apply-teacher">
      <JoinSwitch active="teacher" />
      <AuthHeading title="Join as a teacher" />
      {teacherSelfRegistration ? (
        <>
          <p className="text-sm text-slate-700">
            Teachers apply for an account with their school and contact details. An administrator reviews every application and links the account to your school.
          </p>
          <Link href="/register/teacher" className="inline-flex w-full items-center justify-center rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-brand-dark" data-testid="apply-teacher-register">
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
          Questions? <Link href="/?subject=teacher#contact" className="font-medium text-brand hover:underline">Contact us</Link>
        </p>
      ) : (
        <Link href="/?subject=teacher#contact" className="inline-flex w-full items-center justify-center rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-brand-dark">
          Contact us
        </Link>
      )}
      <p className="text-center text-sm text-slate-600">
        Want to mentor ROF students? <Link href="/apply" className="font-medium text-brand hover:underline">Apply as a coach</Link>
      </p>
    </div>
  );
}

/** The coach application itself. */
function CoachApplication() {
  const detection = useBackendCapabilities().detection;
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
  // The fields this backend asks for, in order.
  const PARTS = coachParts(detailsOn, (part) => {
    if (part === "picture") return pictureOn;
    if (["phone", "affiliation", "expertise", "relevantExperience", "yearsOfExperience"].includes(part)) return extraOn;
    return true;
  });
  const focus = useSignupFocus();

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
    if (Object.keys(e).length || Object.keys(de).length || Object.keys(xe).length || pictureError) {
      focus.showErrors();
      return;
    }
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
      const fe = fieldErrors(err, FIELDS);
      setErrors(fe);
      const sde = detailsOn ? fieldErrors(err, DETAIL_FIELDS) : {};
      if (detailsOn) setDetailErrors(sde);
      // A refused field: focus on it. Other refusals: their message above the fields.
      if (errorKeys(fe, sde).length) focus.showErrors();
      else focus.showMessage();
    } finally {
      setSubmitting(false);
    }
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
        <Link href="/" className="inline-flex w-full items-center justify-center rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-brand-dark">
          Back to the homepage
        </Link>
      </div>
    );
  }

  const taken = isApiError(error) && error.code === "IDENTITY_TAKEN";
  const fieldErr = Object.keys(fieldErrors(error, detailsOn ? [...FIELDS, ...DETAIL_FIELDS] : FIELDS)).length > 0;
  const teacherHref = teacherSelfRegistration ? "/register/teacher" : "/apply?as=teacher";

  const extraField = (only: keyof CoachExtraDraft) =>
    extraOn && (
      <CoachExtraFields
        only={only}
        value={extra}
        onChange={(k, val) => {
          setExtra((s) => ({ ...s, [k]: val }));
          setExtraErrors((s) => ({ ...s, [k]: undefined }));
        }}
        errors={extraErrors}
      />
    );
  const passwordProps = { password, confirm, onPassword: setPassword, onConfirm: setConfirm, errors: { password: errors.password, confirm: errors.confirm }, label: "Password" };

  // The fields, part by part (lib/forms/registration-fields → COACH_PARTS), in two columns or one.
  const parts: Record<string, ReactNode> = {
    firstName: <TextField label="First name" placeholder="e.g. Aline" name="firstName" autoComplete="given-name" required maxLength={50} value={v.firstName} onChange={(e) => set("firstName")(e.target.value)} error={errors.firstName} />,
    lastName: <TextField label="Last name" placeholder="e.g. Uwase" name="lastName" autoComplete="family-name" required maxLength={50} value={v.lastName} onChange={(e) => set("lastName")(e.target.value)} error={errors.lastName} />,
    country: detailsOn && (
      <CascadeSelect label="Country" value={details.country} onChange={(c) => setDetail("country", c, "country")} options={countries} placeholder="Choose your country" error={detailErrors.country} testId="coach-country" />
    ),
    occupation: (
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
    ),
    educationLevel: (
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
    ),
    olympiadInterests: (
      <OlympiadInterestsField
        value={details.interests}
        onChange={(next) => setDetail("interests", next, "olympiadInterests")}
        error={detailErrors.olympiadInterests}
        label={COACH_SUBJECTS_LABEL}
        hint="Choose one or more. You can change them later on your profile."
      />
    ),
    phone: extraField("phone"),
    affiliation: extraField("affiliation"),
    expertise: extraField("expertise"),
    relevantExperience: extraField("relevantExperience"),
    yearsOfExperience: extraField("yearsOfExperience"),
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
    username: <TextField label="Username" placeholder="e.g. aline.uwase" name="username" autoComplete="username" required maxLength={30} value={v.username} onChange={(e) => set("username")(e.target.value.toLowerCase())} error={errors.username} hint="Lowercase letters, digits, “.”, “_” or “-”." />,
    email: <TextField label="E-mail" placeholder="e.g. aline.uwase@example.com" name="email" type="email" autoComplete="email" required maxLength={254} value={v.email} onChange={(e) => set("email")(e.target.value)} error={errors.email} hint="We'll e-mail you the decision on your application." />,
    password: <NewPasswordFields only="password" {...passwordProps} />,
    confirm: <NewPasswordFields only="confirm" {...passwordProps} />,
  };

  return (
    <form onSubmit={onSubmit} noValidate className={SIGNUP_FORM_CLASS}>
      <SignupForm
        focus={focus}
        parts={PARTS}
        content={parts}
        submitLabel={`Apply as a ${role.toLowerCase()}`}
        submittingLabel="Sending your application…"
        submitting={submitting}
        header={
          <>
            <JoinSwitch active="coach" />
            <AuthHeading
              title={`Apply as a ${role.toLowerCase()}`}
              subtitle={
                <>
                  Coaches mentor ROF students. An administrator reviews every application. A school teacher?{" "}
                  <Link href={teacherHref} className="font-medium text-brand hover:underline">
                    Join as a teacher
                  </Link>{" "}
                  instead.
                </>
              }
            />
          </>
        }
        notices={
          <>
            {error != null && !fieldErr && (
              <Alert tone="error">
                {taken ? "That username or e-mail is already in use or has a pending application. Try another, or sign in if you already have an account." : errorMessage(error)}
              </Alert>
            )}

            {error != null && fieldErr && <Alert tone="error">Please check the highlighted fields.</Alert>}
          </>
        }
        footer={<SignInInstead />}
      />
    </form>
  );
}
