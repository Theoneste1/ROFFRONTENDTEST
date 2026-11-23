/**
 * Backend detection from the public `GET /api/v1` (no imports; unit-tested in
 * tests/capabilities.test.mjs).
 *
 * Contract: backend docs/INTEGRATION.md, "Backend capabilities (GET /api/v1)".
 * Every attempt is classified as exactly one of:
 * - LEGACY  — 200, a JSON object with name "ROF LMS API", string version /
 *   docs / health, and NO `capabilities` property (today's production backend);
 * - NEW     — the same fields plus `capabilities` = { schemaVersion: 1,
 *   roles: string[], features: string[] };
 * - UNKNOWN — everything else: network errors, timeouts, aborts, any status
 *   but 200, non-JSON or malformed bodies, missing / wrongly typed fields,
 *   `capabilities: null`, a schemaVersion other than 1, …
 *
 * UNKNOWN is never treated as LEGACY: callers use only what both backends
 * support (or wait / retry) until a definite answer arrives. Nothing is
 * inferred from HTTP status codes of other routes, from `version` (1.0.0 on
 * both backends), from user roles or from feature flags.
 *
 * Capabilities describe the BACKEND, the same for every viewer — never the
 * current user's permissions (that is `GET /me/permissions`).
 */

/** The `features` this frontend knows (schemaVersion 1). Unknown names in a response are ignored. */
export const KNOWN_FEATURES = [
  /**
   * Teacher–student access (TS-1…TS-6): explicit teacher–student assignments, the School Access page, delegations
   * limited to assigned or selected students, and on My Students how each student is seen and what you may do.
   */
  "teacherStudentAccess",
  "permissionScopes",
  "schoolReferenceRequired",
  "schoolAdministration",
  "schoolAffiliations",
  /** Optional: the TEACHER role can currently be assigned (the caller still needs users.manageTeachers). */
  "teacherAccounts",
  /** Optional: the HEAD_COACH role can currently be assigned (the caller still needs users.manageHeadCoaches). */
  "headCoachAccounts",
  /**
   * Starting an academic year (POST /admin/academic-years/:id/activate) is single-flight and
   * retry-safe on this backend: a concurrent or repeated start cannot roll students over twice,
   * and a retry after a lost answer returns the recorded outcome. Without it, the admin page
   * offers no "Start year" (the original backend's start is not safe to repeat).
   */
  "academicYearActivation",
  /**
   * `GET /mentor/reviews` searches (`q`), groups (`group`), sorts (`sort`) and applies the course ×
   * division scope in the database, and answers with `counts`. Without it the coach's per-assignment
   * list loads one page of 100 and filters in the browser (older backends refuse the new parameters).
   */
  "reviewQueueFilters",
  /**
   * The Reports CSV exports apply the page's filters: `results.csv` the period (submitted between)
   * and the academic year besides course × division; enrolment the course. Without it those
   * exports refuse the filters (400), so the page disables them with the reason instead.
   */
  "reportExportFilters",
  /**
   * Assignment lists filter, sort and total in the database: My Assignments takes `progress`
   * (the student's status, incl. OVERDUE) and `sort`; staff lists take `statuses` (several at
   * once). Without it those parameters are refused, so the page filters what it loaded.
   */
  "studentAssignmentFilters",
  /**
   * The official-directory sync (`/admin/school-sync`): dry-run runs from a source export, their
   * report and review (schools.manage); approve and apply only with schools.syncDirectory (Super
   * Admins). Without it the Schools pages offer no directory sync.
   */
  "schoolDirectorySync",
  /**
   * The decision-notification delivery log (`GET /admin/notification-deliveries`, retry of a failed
   * row; email.bulkSend). Without it the backend has no delivery log: the menu item is hidden.
   */
  "notificationDeliveries",
  /**
   * Optional (listed only while the TEACHER role is enabled): the backend implements the public
   * teacher application (GET/POST /auth/register/teacher…) and its review
   * (/admin/teacher-applications, users.manageTeachers). Whether registration is currently OPEN
   * comes from GET /auth/register/teacher/availability, not from this flag.
   */
  "teacherSelfRegistration",
  /**
   * Students' Olympiad interests (Mathematics, Computing, Physics; several at once): the sign-up
   * form (`POST /auth/register/student`) and the profile (`PATCH /me`) send `olympiadInterests`,
   * and profiles return it. Without it older backends refuse the field (400): neither shown nor sent.
   */
  "studentOlympiadInterests",
  /**
   * Profile pictures: `PUT /me/avatar` (multipart `file`: JPEG, PNG or WebP, at most 2 MB) and
   * `DELETE /me/avatar`; `avatarUrl` is then an authenticated API path
   * (`/api/v1/users/:id/avatar?v=…`). Without it My Profile offers no upload (the generated avatar is
   * shown everywhere).
   */
  "profilePictures",
  /**
   * Student sign-up details: `POST /auth/register/student` takes `dateOfBirth`, `phone` (optional),
   * `guardianPhone`, `homeCountry` and, in Rwanda, `homeProvince` / `homeDistrict` / `homeSector`
   * (official list; then `homeLocation` is optional). Profiles return them. Without it: not asked.
   */
  "studentRegistrationDetails",
  /**
   * Administrator date-of-birth correction: `PUT /admin/users/:id/date-of-birth` { dateOfBirth, reason } for a
   * student, and `GET /admin/users/:id/date-of-birth-history` (both users.manage). Without it: not offered.
   */
  "dateOfBirthCorrection",
  /**
   * Coach application details: `POST /mentor-requests` takes `country`, `occupation`,
   * `educationLevel` and `olympiadInterests`; the administrators' list returns them. Without it: not asked.
   */
  "coachApplicationDetails",
  /**
   * Coaches' subject interests (owner decision 2026-11-19): `POST /mentor-requests` requires `olympiadInterests` (at
   * least one); a Coach edits their own on `PATCH /me`; an Administrator edits a Coach's with `olympiadInterests` on
   * `PATCH /admin/users/:id` (Coach accounts only). Information only. Without it: neither shown on profiles nor editable.
   */
  "coachOlympiadInterests",
  /**
   * Application details and requests for more information (backend ADR-009): Teacher position and years of
   * experience; Coach phone, affiliation, expertise, experience; a Coach rejection reason; administrators ask the
   * applicant a question, answered through a one-time link. Without it: none of this is shown or sent.
   */
  "applicationDetails",
  /**
   * Application picture review: admin rows of teacher and coach applications carry `avatarFileId`; the picture is
   * served to the reviewer (`GET /admin/teacher-applications/:id/avatar`, `GET /mentor-requests/:id/avatar`) and is
   * kept on approval only with `approvePicture: true` (otherwise discarded). Without it: nothing is shown or sent.
   */
  "applicationPictureReview",
  /**
   * Optional profile picture at registration (REG-02): registration answers carry a one-time avatarUploadToken for
   * PUT /auth/register/avatar. Without it the registration forms do not offer a picture (My Profile does later).
   */
  "registrationAvatar",
  /**
   * Gender at sign-up (owner, 2026-11-20): the student, teacher and coach sign-ups require `gender` (FEMALE or MALE).
   * Without it the forms neither ask for nor send it (older backends refuse the field).
   */
  "registrationGender",
  /**
   * Home location on every registration form and profile edit (owner, 2026-11-20): the home country is required; with
   * Rwanda the home province, district and sector are required; with another country only the country
   * (lib/accounts/home-location). Without it the forms keep their earlier home fields.
   */
  "homeLocationRules",
  /**
   * "My school is not listed" (owner, 2026-11-22): the teacher sign-up sends the school's official details (6-digit code,
   * cell and village optional, ownership, day / boarding); a listed code is refused naming the school (409
   * SCHOOL_CODE_LISTED); an administrator's approval creates the school from them. Without it: the name only, as before.
   */
  "teacherUnlistedSchoolDetails",
  /**
   * Gender step (owner, 2026-11-20): `genderRequired` on the profile for a student, teacher or coach without a gender;
   * the portal asks it once (PUT /me/gender). An administrator corrects it (PATCH /admin/users/:id `gender`).
   */
  "genderStep",
  /**
   * Account states: ACTIVE, DEACTIVATED, SUSPENDED, ARCHIVED (`accountStatus` on users) and
   * `POST /admin/users/:id/status-changes` { toStatus, reason, confirm? }. Accounts are archived, never
   * deleted (`DELETE /admin/users/:id` is refused with 409 PERMANENT_DELETION_DISABLED). Without it: suspend,
   * reactivate and delete as before.
   */
  "accountStates",
  /**
   * Form availability: `GET /forms/:key` (public) gives each form's state and the administrator's closed
   * message, instructions, contact e-mail and support link; a closed form refuses with that message.
   * Without it: the fixed closed texts.
   */
  "formAvailability",
  /**
   * E-mail activation per sign-up form (owner 2026-11-23): the student, teacher and coach forms each carry
   * `requireEmailVerification` (off by default), changed on the Forms page. Without it: no switch shown.
   */
  "formEmailVerification",
  /**
   * Bulk user operations: `/admin/users/bulk` — preview an action on chosen accounts or on every account matching the
   * list filters, confirm it (bound to exactly the previewed accounts), follow its progress and per-account results,
   * cancel it; `POST /admin/users/bulk/export` (users.export) downloads the selection as CSV. Without it: none of this.
   */
  "bulkUserOperations",
  /**
   * Bulk actions on any record type (2026-11-20): `/admin/bulk/*` — GET /admin/bulk/actions lists the record types and
   * actions the administrator may run (schools, school claims, teacher and coach applications, accounts); preview,
   * confirm (bound to exactly the previewed records), progress, per-record results and cancel. Without it: the
   * accounts' own bulk actions only.
   */
  "bulkOperationsGeneric",
  /**
   * "Other" Olympiad interest (owner, 2026-11-21): `olympiadInterestOther` (2–100 characters) beside `olympiadInterests`
   * on the sign-ups, PATCH /me and the Administrator's coach edit; "Other" alone counts. Without it: the three subjects only.
   */
  "olympiadInterestOther",
  /**
   * Teacher self-service and locked test submissions (owner, 2026-11-21): a listed school's teacher gets the account at
   * once and sees the students who registered with the school code (pending claims included); a submitted test answer is
   * locked for the student and every teacher (409 SUBMISSION_LOCKED) until an Administrator authorizes one more version
   * (POST/DELETE /admin/tests/:id/submissions/:sid/resubmission, with a reason, history kept); an Administrator revokes /
   * restores a teacher's test submission (GET/PUT /admin/teachers/:id/test-submission); the teacher's test student list
   * filters by level (division) and subject. Without it: replacing an answer as before, no filters.
   */
  "testSubmissionLock",
  /** Olympiad levels (owner 2026-11-21/22): a student's division is their level — set by hand or following the grade (GET / PUT /admin/students/:id/olympiad-level, bulk setOlympiadLevel). */
  "olympiadLevels",
  /** Administrator-managed divisions (owner 2026-11-22): create, suggested grades, order, activation, courses offered, bulk coach assignment. */
  "adminDivisions",
  /** The Student Profile Overview (owner 2026-11-22): GET /students/:id/overview; the student's picture for whoever may view it. */
  "studentOverview",
  /** Custom reports with view / download / edit grants (owner 2026-11-22): /reports. */
  "customReports",
  /** Saved table layouts and a sortable Users list (owner 2026-11-22). */
  "tableLayouts",
  /** Teachers submit answers for, and follow the results of, their schools' students AND the students assigned to them (owner 2026-11-23). */
  "teacherAssignedTestStudents",
  /**
   * Course homework by teachers, by default (owner 2026-11-24): every teacher sees the homework progress of, and hands in
   * course homework for, the students they see (their schools' and their assigned students) — no delegation needed; an
   * Administrator switches it off or on again per teacher (GET / PUT /admin/teachers/:id/homework-submission). Without
   * it: progress and handing in are individual delegations.
   */
  "teacherHomeworkDefault",
  /**
   * Registration data (owner 2026-11-23): Super Administrators (registrationData.manage) list, filter, export and edit every
   * eligible registration field — /admin/registration-data (fields read from the database; saved filters; column layouts).
   */
  "registrationData",
  /** A school without a code chosen at registration: its code is asked (newSchoolCode) and becomes the school's (owner 2026-11-23). */
  "schoolCodeAtRegistration",
  /**
   * Coaches across their programmes (owner 2026-11-23): every Coach sees the students, opens the courses, marks the tests and
   * sees the published results of each programme they belong to, at every level; an Administrator or the programme's Head
   * Coach takes any part away per programme (/admin/coaches/:id/programme-access).
   */
  "coachProgrammeAccess",
  /**
   * News subscribers (owner 2026-11-23): the public "Get ROF news" box (POST /public/subscribe), the /unsubscribe page
   * (POST /public/unsubscribe) and the administrators' Subscribers screen (/admin/subscribers, subscribers.manage: list,
   * export, add, import, edit, mailings). Without it: none of these.
   */
  "subscribers",
  /**
   * View as, read only (owner 2026-11-23): POST /admin/users/:id/view-as (users.impersonate; lower roles only) → a
   * single-use ticket the new tab exchanges (POST /auth/view-as/exchange) for a 30-minute viewing token; every change
   * answers 403 VIEW_AS_READ_ONLY; 401 VIEW_AS_ENDED when it stops; POST /auth/view-as/end. Without it: no button.
   */
  "viewAs",
  /**
   * Activate now (owner 2026-11-24): POST /admin/users/:id/activate-now activates an account "Awaiting setup" whose person
   * chose their own password (they sign in without confirming their e-mail), and the Users list's bulk action activateNow
   * does the same per account (its preview says how many will be activated). Without it: neither is offered.
   */
  "adminActivateNow",
  /**
   * Countries (owner decision 2026-11-19): `GET /countries` (every ISO country, names an Administrator may correct) and
   * the administrators' Countries screen (`/admin/countries`, reference.manage). Without it: the built-in country list.
   */
  "countries",
  /**
   * Primary teacher of a school (owner decision 2026-11-19): `role` PRIMARY | SECONDARY on teacher–school links (filter
   * `?role=`), POST /admin/teacher-assignments/:id/primary (users.manageTeachers), `role` on School Access rows,
   * `teacherSchoolRole` on TEACHER rows of the users list, and GET /teacher/schools for the teacher. Without it: no badges.
   */
  "primaryTeacher",
  /**
   * Schools table (2026-11-19): GET /admin/schools sorts by name or verified students (`sort`, `order`) and returns
   * `primaryTeacher` per school. Without it: name order only, no sort controls.
   */
  "schoolsTable",
  /**
   * School list filters on every field of the NESA file (owner, 2026-11-23): ownership, cell, village, a contact (e-mail
   * or phone), with or without an e-mail or phone, programme category. Without it: those filters are not offered.
   */
  "schoolListFilters",
  /**
   * Test Management, Phase 1 (owner-approved plan 2026-11-19): `/admin/tests` (tests, questions with the sum rule, the
   * paper and the marking guide; tests.view / tests.manage) and `/admin/test-markers` (marker authorisations per coach
   * and subject; tests.manageMarkers). Administrators: every subject; Head Coaches: the subjects they head (coach portal).
   * Without it: no Tests screens.
   */
  "testManagement",
  /**
   * Test Management, Phase 2 (owner-approved plan 2026-11-19): deadlines from the server's database time (extensions
   * included); students' `/me/tests` (tests.submit: their tests, the paper, page-by-page uploads, submit / replace with
   * every version kept); teachers' `/teacher/tests` (tests.submitForStudents: verified students of their own schools);
   * `/admin/tests/:id/extensions` (tests.extensions) and `/admin/tests/:id/submissions` (tests.viewSubmissions: tracking,
   * every version). Without it: no My tests / Tests menus for students and teachers, no Submissions / Extensions tabs.
   */
  "testSubmissions",
  /**
   * Test Management, Phase 3 (owner-approved plan 2026-11-19): distribution to authorised coaches and review on the test
   * page — Markers & distribution (tests.distribute: even, manual, reassign; progress per coach), Review (tests.review:
   * approve and lock, return with a comment, second marking, unlock; choosing / adjusting the mark: tests.adjustMarks,
   * the subject's Head Coach only — G4), History (status changes, the mark-change log); the coach's blind marking queue
   * `/mentor/marking` (tests.mark). Without it: none of these.
   */
  "testMarking",
  /**
   * Test Management, Phase 4 (owner-approved plan 2026-11-19): publication of the approved results (tests.publishResults;
   * the Administrators' override with a mandatory reason: tests.overridePublication), results with identity, the report and
   * CSV exports (tests.viewResults), internal rankings (tests.viewRankings), the reporting overview, students' own results
   * (tests.viewOwnResults), teachers' school results (tests.viewSchoolResults) and the role dashboards' test widgets.
   * Without it: none of these.
   */
  "testResults",
] as const;
export type BackendFeature = (typeof KNOWN_FEATURES)[number];

export const CAPABILITIES_SCHEMA_VERSION = 1;
export const API_INFO_NAME = "ROF LMS API";
/** Longer than a hosting proxy's time limit; a sleeping Render backend can take about a minute to wake. */
export const DETECTION_TIMEOUT_MS = 30_000;

export type BackendDetection =
  | { state: "LEGACY" }
  | { state: "NEW"; schemaVersion: 1; roles: readonly string[]; features: readonly string[] }
  | { state: "UNKNOWN"; reason: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const unknown = (reason: string): BackendDetection => ({ state: "UNKNOWN", reason });

/** Classifies one `GET /api/v1` answer: its HTTP status and raw body text. */
export function classifyApiInfo(status: number, bodyText: string | null): BackendDetection {
  if (status !== 200) return unknown(`status ${status}`);
  if (bodyText === null) return unknown("no body");
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return unknown("body is not JSON");
  }
  if (!isObject(body)) return unknown("body is not a JSON object");
  if (body.name !== API_INFO_NAME) return unknown("unexpected name");
  if (typeof body.version !== "string" || typeof body.docs !== "string" || typeof body.health !== "string") {
    return unknown("missing or invalid version / docs / health");
  }
  if (!Object.prototype.hasOwnProperty.call(body, "capabilities")) return { state: "LEGACY" };

  const caps = body.capabilities;
  if (!isObject(caps)) return unknown("capabilities is not an object");
  if (typeof caps.schemaVersion !== "number" || !Number.isInteger(caps.schemaVersion)) return unknown("schemaVersion is not an integer");
  if (caps.schemaVersion !== CAPABILITIES_SCHEMA_VERSION) return unknown(`unsupported schemaVersion ${caps.schemaVersion}`);
  if (!isStringArray(caps.roles)) return unknown("roles is not an array of strings");
  if (!isStringArray(caps.features)) return unknown("features is not an array of strings");
  return { state: "NEW", schemaVersion: CAPABILITIES_SCHEMA_VERSION, roles: [...caps.roles], features: [...caps.features] };
}

export interface DetectOptions {
  /** `fetch` (injected in tests). */
  fetch?: typeof fetch;
  /** Default `/api/v1` on this origin (the /api proxy). */
  url?: string;
  timeoutMs?: number;
  /** Cancels the request (e.g. the query was cancelled); counts as UNKNOWN. */
  signal?: AbortSignal;
}

/** Fetches `GET /api/v1` and classifies it. Never throws: every failure is UNKNOWN. */
export async function detectBackend({
  fetch: fetchFn = globalThis.fetch,
  url = "/api/v1",
  timeoutMs = DETECTION_TIMEOUT_MS,
  signal,
}: DetectOptions = {}): Promise<BackendDetection> {
  if (signal?.aborted) return unknown("aborted");
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetchFn(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit", // public; no cookie or token is needed
      cache: "no-store", // the answer changes with a deployment
      redirect: "manual", // a redirect is not the API information (3xx → UNKNOWN)
      signal: controller.signal,
    });
    const text = res.status === 200 ? await res.text() : null;
    return classifyApiInfo(res.status, text);
  } catch {
    return unknown(timedOut ? "timeout" : controller.signal.aborted ? "aborted" : "network error");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * True only on a NEW backend that lists the feature, and only for a feature
 * this frontend knows (KNOWN_FEATURES) — unknown names are ignored even if a
 * caller passes one. LEGACY and UNKNOWN: false.
 */
export function hasFeature(detection: BackendDetection | null | undefined, feature: BackendFeature): boolean {
  return (
    detection?.state === "NEW" &&
    (KNOWN_FEATURES as readonly string[]).includes(feature) &&
    detection.features.includes(feature)
  );
}

/** True only for a definite LEGACY answer — never for UNKNOWN or while loading. */
export function isLegacyBackend(detection: BackendDetection | null | undefined): boolean {
  return detection?.state === "LEGACY";
}

/** True only for a definite NEW answer. */
export function isNewBackend(detection: BackendDetection | null | undefined): boolean {
  return detection?.state === "NEW";
}

/**
 * Caching (shared, one request for the whole app): a definite answer is kept
 * for 5 minutes (a deployment can change it); UNKNOWN is never considered
 * fresh and is retried while something uses it — soon at first (a sleeping
 * Render backend answers within about a minute; the hosting proxy may give up
 * earlier with a 502/504), then every 30 seconds.
 */
export const DEFINITE_STALE_MS = 5 * 60_000;
export const UNKNOWN_RETRY_MS = 30_000;
/** Delay before the n-th consecutive retry after UNKNOWN answers (1-based); then UNKNOWN_RETRY_MS. */
export const UNKNOWN_RETRY_STEPS_MS = [3_000, 5_000, 10_000, 15_000] as const;
/** How long after the first UNKNOWN answer the app still treats the backend as "waking up". */
export const WAKING_WINDOW_MS = 90_000;

export function unknownRetryDelay(consecutiveUnknown: number): number {
  if (consecutiveUnknown < 1) return UNKNOWN_RETRY_MS;
  return UNKNOWN_RETRY_STEPS_MS[consecutiveUnknown - 1] ?? UNKNOWN_RETRY_MS;
}

/** Still within the wake-up window: keep waiting quietly instead of showing a failure. */
export function isWaking(firstUnknownAt: number | null, now: number): boolean {
  return firstUnknownAt !== null && now - firstUnknownAt < WAKING_WINDOW_MS;
}

export function staleTimeFor(detection: BackendDetection | undefined): number {
  return detection && detection.state !== "UNKNOWN" ? DEFINITE_STALE_MS : 0;
}

/** `consecutiveUnknown`: how many UNKNOWN answers in a row so far (retries back off; 0 = the 30 s cadence). */
export function refetchIntervalFor(detection: BackendDetection | undefined, consecutiveUnknown = 0): number | false {
  return detection?.state === "UNKNOWN" ? unknownRetryDelay(consecutiveUnknown) : false;
}
