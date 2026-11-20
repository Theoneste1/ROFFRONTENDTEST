"use client";

/**
 * "My Profile" for every role: `/student|mentor|teacher|admin/profile` (Head Coaches use the coach
 * portal, Super Administrators the administrator portal).
 *
 * What can change is exactly what the backend allows:
 * - the profile picture, on a backend advertising `profilePictures` (`PUT`/`DELETE /me/avatar`,
 *   AvatarEditor.tsx); otherwise the generated avatar ("Theoneste N") is shown;
 * - `PATCH /me`: first name, last name, home location. Username, e-mail,
 *   role, division, grade and school are read-only here (administrators
 *   manage them);
 * - password, sessions and notification preferences are in Settings (AccountSettingsPage.tsx);
 * - students, on a backend advertising `schoolAffiliations`: their school and its
 *   verification, and asking for another school (SchoolAffiliationCard.tsx);
 * - students, on a backend advertising `studentOlympiadInterests`: their Olympiad interests
 *   (`PATCH /me` olympiadInterests; at least one);
 * - coaches, on a backend advertising `coachOlympiadInterests`: the subjects they are interested in coaching (the same
 *   `PATCH /me` olympiadInterests, at least one; "Not set" until chosen). Information only: no access changes.
 */
import { homePlaceText, studentDetailsSupported } from "@/lib/accounts/student-details";
import { countryName } from "@/lib/schools/countries";
import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Settings, Trophy, UserRound } from "lucide-react";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import {
  interestsText,
  normaliseInterests,
  sameInterests,
  studentInterestsSupported,
  validateInterests,
  type OlympiadSubject,
} from "@/lib/accounts/olympiad-interests";
import OlympiadInterestsField from "./OlympiadInterestsField";
import { COACH_SUBJECTS_LABEL, coachInterestsSupported, coachSubjectsText, validateCoachSubjects } from "@/lib/accounts/coach-application";
import { useSession } from "@/lib/auth/session";
import { portalPath, roleLabel } from "@/lib/auth/roles";
import Link from "next/link";
import AvatarEditor from "./AvatarEditor";
import { useUpdateMe } from "@/lib/queries/account";
import { errorMessage, fieldErrors } from "@/lib/api/errors";
import type { CurrentUser, UpdateMeInput } from "@/lib/api/types";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { Alert, LoadingBlock } from "@/app/components/ui/feedback";
import { Button, TextField } from "@/app/components/ui/form";
import { PageFrame } from "@/app/components/ui/PageFrame";
import SchoolAffiliationCard from "./SchoolAffiliationCard";
import TeacherSchoolsCard from "./TeacherSchoolsCard";
import { Section } from "./Section";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-800 mt-0.5 break-words">{children || "—"}</dd>
    </div>
  );
}

export default function ProfilePage() {
  const { user } = useSession();
  const caps = useBackendCapabilities();
  if (!user) return <LoadingBlock />;
  const interestsOn = user.role === "STUDENT" && studentInterestsSupported(caps.detection);
  const detailsOn = user.role === "STUDENT" && studentDetailsSupported(caps.detection);
  const coachSubjectsOn = user.role === "MENTOR" && coachInterestsSupported(caps.detection);

  const fullName = `${user.firstName} ${user.lastName}`.trim() || user.username;
  return (
    <PageFrame title="My Profile" description="Your picture and account details. Password, sessions and notifications are in Settings.">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className="space-y-6 min-w-0">
          <section className="bg-white rounded-2xl border border-gray-100 shadow-xs p-6 flex flex-col items-center text-center">
            <AvatarEditor user={user} />
            <p className="mt-4 text-lg font-bold text-gray-900" data-testid="profile-name">{fullName}</p>
            <p className="text-sm font-medium text-amber-700" data-testid="profile-title">{roleLabel(user.role)}</p>
            <dl className="mt-6 w-full grid grid-cols-1 gap-4 text-left">
              <Detail label="Username">{user.username}</Detail>
              <Detail label="E-mail">{user.email}</Detail>
              {coachSubjectsOn && <Detail label="Coaching subjects">{coachSubjectsText(user.olympiadInterests)}</Detail>}
              {user.role === "STUDENT" && (
                <>
                  <Detail label="Division">{user.division?.name}</Detail>
                  <Detail label="Grade">{user.gradeLevel}</Detail>
                  <Detail label="School">{user.school ? `${user.school.name}${user.school.location ? `, ${user.school.location}` : ""}` : null}</Detail>
                  <Detail label="Points">{`${formatNumber(user.points)} · ${formatNumber(user.problemsSolved)} problems solved`}</Detail>
                  {interestsOn && <Detail label="Olympiad interests">{interestsText(user.olympiadInterests) || "None chosen yet"}</Detail>}
                  {detailsOn && (
                    <>
                      <Detail label="Date of birth">{user.dateOfBirth ? formatDate(user.dateOfBirth.slice(0, 10)) : null}</Detail>
                      <Detail label="Country">{user.country ? countryName(user.country) : null}</Detail>
                      <Detail label="Phone">{user.phone}</Detail>
                      <Detail label="Close-family phone">{user.guardianPhone}</Detail>
                      {homePlaceText(user) && <Detail label="Home">{homePlaceText(user)}</Detail>}
                    </>
                  )}
                </>
              )}
              <Detail label="Member since">{formatDate(user.createdAt)}</Detail>
              <Detail label="Last sign-in">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : null}</Detail>
            </dl>
            <p className="mt-5 text-xs text-gray-500">
              Username, e-mail{user.role === "STUDENT" ? ", grade and school" : ""} are managed by the administrators.
              {detailsOn && " To correct your date of birth, phones or home, contact ROF support."}
            </p>
          </section>
        </div>

        <div className="xl:col-span-2 space-y-6 min-w-0">
          <DetailsForm user={user} />
          {interestsOn && <InterestsCard user={user} />}
          {coachSubjectsOn && <InterestsCard user={user} coach />}
          {user.role === "STUDENT" && <SchoolAffiliationCard />}
          {user.role === "TEACHER" && <TeacherSchoolsCard />}
          <Section title="Settings" icon={<Settings className="w-5 h-5" />} description="Your password, signed-in devices and notification e-mails.">
            <Link href={portalPath(user.role, "account")} className="inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline" data-testid="profile-settings-link">
              Open Settings <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Section>
        </div>
      </div>
    </PageFrame>
  );
}

// ─── Details (PATCH /me) ────────────────────────────────────────────────────

type DetailErrors = Partial<Record<keyof UpdateMeInput, string>>;

function DetailsForm({ user }: { user: CurrentUser }) {
  const update = useUpdateMe();
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [homeLocation, setHomeLocation] = useState(user.homeLocation ?? "");
  const [errors, setErrors] = useState<DetailErrors>({});
  const [saved, setSaved] = useState(false);
  const [nothing, setNothing] = useState(false);

  const serverErrors = fieldErrors(update.error, ["firstName", "lastName", "homeLocation"]) as DetailErrors;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    setNothing(false);
    const f = firstName.trim(), l = lastName.trim(), h = homeLocation.trim();
    const errs: DetailErrors = {};
    if (f.length < 1 || f.length > 100) errs.firstName = "Enter your first name (up to 100 characters).";
    if (l.length < 1 || l.length > 100) errs.lastName = "Enter your last name (up to 100 characters).";
    if (h && (h.length < 2 || h.length > 200)) errs.homeLocation = "Use 2 to 200 characters.";
    if (!h && user.homeLocation) errs.homeLocation = "Your home location can be changed but not removed.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    // Send only what changed; the backend refuses an empty update.
    const input: UpdateMeInput = {};
    if (f !== user.firstName) input.firstName = f;
    if (l !== user.lastName) input.lastName = l;
    if (h && h !== (user.homeLocation ?? "")) input.homeLocation = h;
    if (Object.keys(input).length === 0) {
      setNothing(true);
      return;
    }
    update.mutate(input, {
      onSuccess: (me) => {
        setSaved(true);
        setFirstName(me.firstName);
        setLastName(me.lastName);
        setHomeLocation(me.homeLocation ?? "");
      },
    });
  }

  return (
    <Section title="Personal details" icon={<UserRound className="w-5 h-5" />} description="The name shown to coaches, administrators and in discussions.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {saved && <Alert tone="success">Your details were saved.</Alert>}
        {nothing && <Alert tone="info">Nothing to save: no field was changed.</Alert>}
        {update.isError && Object.keys(serverErrors).length === 0 && <Alert tone="error">{errorMessage(update.error)}</Alert>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField
            label="First name"
            name="firstName"
            autoComplete="given-name"
            required
            maxLength={100}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            error={errors.firstName ?? serverErrors.firstName}
          />
          <TextField
            label="Last name"
            name="lastName"
            autoComplete="family-name"
            required
            maxLength={100}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            error={errors.lastName ?? serverErrors.lastName}
          />
        </div>
        {/* A home chosen from the official Province → District → Sector list is shown above, not typed here. */}
        {!homePlaceText(user) && (
        <TextField
          label="Home location"
          name="homeLocation"
          autoComplete="address-level2"
          maxLength={200}
          value={homeLocation}
          onChange={(e) => setHomeLocation(e.target.value)}
          error={errors.homeLocation ?? serverErrors.homeLocation}
          hint="City or district, e.g. Kigali."
        />
        )}
        <div className="flex justify-end">
          <Button type="submit" loading={update.isPending}>
            Save details
          </Button>
        </div>
      </form>
    </Section>
  );
}

// ─── Olympiad interests (PATCH /me olympiadInterests): a student's Olympiads, a coach's subjects ───────────────

const INTEREST_TEXTS = {
  student: {
    title: "Olympiad interests",
    description: "The Olympiads you would like to take part in. This does not change your courses or what you can access.",
    label: undefined,
    hint: "Choose at least one.",
    saved: "Your Olympiad interests were saved.",
    save: "Save interests",
    validate: validateInterests,
  },
  coach: {
    title: "Coaching subjects",
    description: "The subjects you are interested in coaching. Information only: it does not change your courses, marking or what you can access.",
    label: COACH_SUBJECTS_LABEL,
    hint: "Choose one or more.",
    saved: "Your coaching subjects were saved.",
    save: "Save subjects",
    validate: validateCoachSubjects,
  },
} as const;

function InterestsCard({ user, coach = false }: { user: CurrentUser; coach?: boolean }) {
  const t = INTEREST_TEXTS[coach ? "coach" : "student"];
  const update = useUpdateMe();
  const [interests, setInterests] = useState<OlympiadSubject[]>(() => normaliseInterests(user.olympiadInterests));
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const serverError = fieldErrors(update.error, ["olympiadInterests"]).olympiadInterests;
  const unchanged = sameInterests(interests, user.olympiadInterests);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    const err = t.validate(interests);
    setError(err);
    if (err || unchanged || update.isPending) return;
    update.mutate({ olympiadInterests: interests }, {
      onSuccess: (me) => {
        setSaved(true);
        setInterests(normaliseInterests(me.olympiadInterests));
      },
    });
  }

  return (
    <Section title={t.title} icon={<Trophy className="w-5 h-5" />} description={t.description}>
      <form onSubmit={onSubmit} noValidate className="space-y-4" data-testid={coach ? "coach-subjects-form" : "interests-form"}>
        {saved && <Alert tone="success">{t.saved}</Alert>}
        {update.isError && !serverError && <Alert tone="error">{errorMessage(update.error)}</Alert>}
        <OlympiadInterestsField
          value={interests}
          onChange={(next) => {
            setInterests(next);
            setError(undefined);
            setSaved(false);
          }}
          error={error ?? serverError}
          idPrefix="profile-interests"
          {...(t.label && { label: t.label })}
          hint={t.hint}
        />
        <div className="flex justify-end">
          <Button type="submit" loading={update.isPending} disabled={unchanged}>
            {t.save}
          </Button>
        </div>
      </form>
    </Section>
  );
}
