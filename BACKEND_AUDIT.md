# ROF LMS — Backend Audit (ROFBACKENDTEST)

Audit date: 2026-11-05 · Read-only inspection; no backend files were changed.

Sources: the code in `src/`, `prisma/schema.prisma`, the migrations, `prisma/seed.ts`, and the backend's own generated docs in `docs/`. The generated docs are `routes.json`, `openapi.json`, `response-schemas.json`, `ARCHITECTURE.md`, `AUTHORIZATION.md`, `DATABASE.md` and `WORKFLOWS.md`. The code is the source of truth.

## 1. Stack

| Item | Finding |
|---|---|
| Framework | NestJS 12, ESM, TypeScript |
| Database | PostgreSQL via Prisma 7 (`@prisma/adapter-pg`); 15 migrations (`20261103000000_baseline` … `20261118000000_remove_live_sessions_and_reminders`) |
| Storage | `StorageService` with `local` or `s3` driver (MinIO in Docker); type is detected from the file's bytes |
| E-mail | Outbox table plus an in-process worker over SMTP (Mailpit in dev) |
| Background jobs | `@nestjs/schedule`, in-process |
| Security | Helmet, CORS allow-list (`CORS_ORIGINS`), throttling (120 req/min/IP; stricter on credential routes), global JWT guard plus global roles guard, scope checks in `AccessService` |
| Base URL | `http://localhost:3000/api/v1`; Swagger at `/api/docs`; health at `/health` |
| Dev defaults (`.env.example`) | `PORT=3000`, `CORS_ORIGINS=http://localhost:5173`, `APP_URL=http://localhost:5173` |
| Tests | Unit + e2e (vitest) + route-coverage check; every route has an e2e test (per backend docs; **not re-run in this audit**) |

## 2. Academic model

- **Divisions:** exactly 2, JUNIOR (S1–S3) and SENIOR (S4–S6).
- **Courses:** exactly 4 (ALGEBRA, GEOMETRY, NUMBER_THEORY, COMBINATORICS), created by the seed. Admins edit and publish them but **cannot create or delete** them.
- **Content scope:** content is owned by a **course × division** pair, and every resource, assignment and course thread carries `courseId` and `divisionId`.
- **Mentors:** each mentor works in scopes (`MentorAssignment` rows) and can act only inside those.
- **Academic years:** exactly one is current. Activating a year archives the previous year's assignments and promotes students.
- **Course progress:** `CourseEnrollment` tracks each student per course (Unrolled → Rolled → Completed).

## 3. Database models (45 models, 28 enums)

| Area | Models |
|---|---|
| Identity | `User`, `RefreshToken`, `PasswordResetToken`, `AccountActivationToken`, `TokenBlacklist`, `MentorRequest`, `School` |
| Structure | `Discipline`, `Course`, `Division`, `AcademicYear`, `StudentEnrollment`, `MentorAssignment`, `CourseEnrollment` |
| Content | `CourseResource`, `ResourceAttachment`, `ResourceView`, `FileObject` |
| Assessment | `Assignment`, `AssignmentEvent`, `AssignmentAttachment`, `AssignmentView`, `Submission`, `SubmissionRevision`, `SubmissionAttachment`, `DistributionBatch`, `MentorReview`, `ReviewAttachment`, `ReviewEvent`, `ResultRelease` |
| Community | `DiscussionThread`, `Comment`, `CommentReaction`, `ContentReport`, `ModerationAction`, `StudyGroup`*, `StudyGroupMember`* |
| Messaging | `Notification`, `NotificationPreference`, `NotificationSetting`, `EmailJob`, `EmailDelivery` |
| Admin | `SystemSetting`, `AuditLog` (append-only via DB trigger), `ActivityLog` |

\* The study-group tables exist, but `StudyGroupsModule` is **deliberately not registered** in `src/app/app.module.ts`, so `/study-groups` routes do not exist.

### Key relationships

- `User` (role STUDENT, MENTOR or ADMIN). Students have `gradeLevel`, `divisionId` and `schoolId`, enforced by a CHECK constraint; these mirror the active `StudentEnrollment`. `User.points` and `problemsSolved` are caches of published results.
- `Assignment` → `Course`, `Division`, `AcademicYear`, and `createdBy` (the mentor). One `Assignment` has many `Submission`, one per student, unique on (`assignmentId`, `studentId`).
- `Submission` → many `SubmissionRevision` (attempts 1, 2, 3 …), each with its files.
- `Submission` → many `MentorReview` (review cycles), each with `ReviewEvent`s and `ReviewAttachment`s.
- `CourseResource` → `Course` × `Division`, plus its attachments (`FileObject`).
- `DiscussionThread` → a course × division, **or** an assignment.
  - Each thread has many `Comment`s, one level of replies.
  - `CommentReaction`, `ContentReport` and `ModerationAction` hang off threads and comments.

### Important enums

- `AssignmentStatus`: DRAFT, PENDING_APPROVAL, PUBLISHED, REJECTED, CLOSED, ARCHIVED
- `SubmissionStatus`: SUBMITTED, ASSIGNED, IN_REVIEW, MARKED, SUBMITTED_TO_ADMIN, APPROVED, PUBLISHED, REJECTED, RESUBMISSION_REQUESTED
- `ResourceType`: BOOK, EBOOK, NOTE, PAST_PAPER, ATTACHMENT
- `ReactionType`: LIKE, HELPFUL, CONFUSED
- `GradeLevel`: S1–S6
- `DivisionCode`: JUNIOR, SENIOR
- `DistributionStrategy`: BALANCED, ROUND_ROBIN

## 4. API endpoints (198 routes in `docs/api/routes.json`)

All paths are under `/api/v1`. Lists are paginated with `?page=&limit=` (default 20, max 100) and return `{ data, meta: { total, page, limit, totalPages } }`. Short fixed lists return plain arrays. **No list endpoint accepts sort parameters.**

| Area | Endpoints (method path — roles) |
|---|---|
| **Auth** (public unless noted) | `POST /auth/login`, `/auth/refresh`, `/auth/logout` (any), `/auth/logout-all` (any), `PATCH /auth/password` (any), `POST /auth/register/student`, `/auth/register/admin` (ADMIN), `/auth/activation/inspect`, `/auth/activate`, `/auth/resend-activation`, `/auth/forgot-password`, `/auth/reset-password` |
| **Me** | `GET/PATCH /me`, `GET /me/permissions`, `/me/enrollments` (S), `/me/courses` (S), `/me/assignments` (S, returns `displayStatus`, `canSubmit`), `/me/submissions` (S), `/me/results` and `/me/results/:submissionId` (+`/feedback-files/:attachmentId`) (S), `/me/teaching` (M) |
| **Notifications** | `GET /notifications`, `/notifications/:id`, `/notifications/unread-count`, `PATCH /notifications/:id/read\|unread`, `POST /notifications/read`, `/notifications/read-all`; `GET/PUT /me/notification-preferences`; `GET/PATCH /me/notification-settings`, `POST …/reset` (M, A) |
| **Structure** | `GET /divisions` (public), `GET /admin/divisions`, `PATCH /admin/divisions/:id`; `GET /disciplines`; `GET /academic-years`, `/academic-years/current`; `POST /admin/academic-years`, `GET/PATCH /admin/academic-years/:id`, `POST …/:id/activate`, `GET …/:id/enrollments`, `PATCH /admin/enrollments/:id`; `GET /schools/search` (public), `GET /schools`, `/schools/:id` (A) |
| **Courses & resources** | `GET /courses`, `/courses/:id`, `POST /courses/:id/complete` (S); `PATCH /admin/courses/:id`, `…/publish\|unpublish\|archive` (A); `GET/POST /courses/:courseId/resources` (filters `divisionId,type,tag,year,q,includeArchived`), `GET/PATCH/DELETE …/:resourceId`, `PATCH …/publish\|unpublish\|archive\|restore`, `POST/DELETE …/attachments`, `GET …/file`, `GET …/attachments/:attachmentId/file` (write: M scoped, A) |
| **Mentor scopes & requests** | `GET/POST /admin/mentor-assignments`, `DELETE /admin/mentor-assignments/:id`; `POST /mentor-requests` (public), `GET /mentor-requests`, `PATCH /mentor-requests/:id/approve\|reject` (A) |
| **Assignments** | `GET /assignments` (filters `courseId,divisionId,status,academicYearId,createdById,q,deadlineFrom,deadlineTo`), `GET /assignments/:id`, `GET …/file`, `…/attachments/:attachmentId/file`; mentor: `POST /assignments` (multipart), `PATCH /assignments/:id`, `PATCH …/submit\|recall`, `POST/DELETE …/attachments`; admin: `PATCH …/publish\|reject\|unpublish\|close\|reopen\|archive`; `GET …/history` (M, A). **There is no DELETE assignment route.** |
| **Submissions & reviews** | Student: `POST /submissions` (multipart; `assignmentId`, `answerText`, `note`, `files`). Admin: `GET /submissions` (filters `assignmentId,courseId,divisionId,mentorId,studentId,status`), `POST /assignments/:id/distribute`, `GET …/distribution-batches`, `PATCH /submissions/:id/assign\|reassign\|approve\|reject\|publish\|reopen`, `POST /assignments/:id/results/publish`, `GET …/result-releases`, `GET /submissions/:id/result-history`. Mentor: `GET /mentor/reviews`, `PATCH /submissions/:id/start-review\|mark\|submit-to-admin\|request-resubmission\|withdraw-resubmission-request`, `DELETE …/review/attachments/:attachmentId`. Shared: `GET /submissions/:id`, `…/history`, `…/reviews` (M, A), `…/file`, `…/attachments/:id/file`, `…/revisions/:n/file`, `…/feedback-file(s)` |
| **Discussions** | `GET/POST /courses/:courseId/threads`, `GET/POST /assignments/:assignmentId/threads`, `GET/PATCH/DELETE /threads/:id`, `PATCH /threads/:id/:op` (A: lock/pin/hide…), `GET/POST /threads/:id/comments`, `GET /comments/:id/replies`, `PATCH/DELETE /comments/:id`, `POST /comments/:id/reactions`, `POST /comments/:id/report`, `POST /threads/:id/report`; admin moderation: `GET /admin/moderation/reports`, `GET …/:id`, `POST …/:id/resolve`, `GET /admin/moderation/actions`, `GET /admin/comments/hidden`, `PATCH /comments/:id/hide\|restore` |
| **Leaderboard & analytics** | `GET /leaderboard` (`divisionId, schoolId`), `GET /leaderboard/me` (S), `GET /leaderboard/schools`, `POST /admin/leaderboard/recompute` (A); `GET /analytics/courses/:courseId` (M scoped, A; aggregate only) |
| **Admin: users** | `GET/POST /admin/users` (filters `role,divisionId,gradeLevel,schoolId,isApproved,isActive,isActivated,search`), `GET/PATCH/DELETE /admin/users/:id`, `PATCH …/status`, `POST /admin/users/invite`, `/admin/users/import?dryRun=`, `POST …/:id/resend-invitation`, `…/send-password-reset` |
| **Admin: dashboard, reports** | `GET /admin/dashboard`; `GET /admin/reports/{overview,students,mentors,enrollment,course-participation,assignments,reviews,results-publication,mentor-activity}`, each with a `.csv` variant, plus `mentor-workload.csv`, `results.csv`, `student-progress.csv`. Filters: `academicYearId, divisionId, courseId, from, to` (+`status, q` on user reports) |
| **Admin: other** | `GET/PATCH /admin/settings`; `GET /admin/audit-logs`, `…/:id`, `…/actions`, `…/export.csv`; `GET /admin/activity`, `…/summary`; `GET /admin/email/jobs`, `…/:id`, `…/:id/deliveries`, `POST …/:id/retry`, `POST /admin/email/send`, `GET /admin/email/users` |
| **Public misc** | `GET /api/v1`, `GET /health`, `GET /support` |

### Error contract

Every error returns `{ statusCode, error, code, message, details?, requestId, path, timestamp }`. The frontend should branch on `code`; examples are `VALIDATION_FAILED`, `INVALID_STATE_TRANSITION`, `DEADLINE_PASSED`, `NOT_ASSIGNED_TO_SCOPE`, `NOT_ASSIGNED_MENTOR`, `FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE`, `ACCOUNT_NOT_ACTIVATED` and `DISCUSSIONS_DISABLED`. Unknown body or query fields are rejected with 400.

### Key validation rules (for mirroring in forms)

- **`CreateAssignmentDto`:**
  - `title`: 3–200 characters
  - `courseId`, `divisionId`: UUIDs
  - `description`: ≤500 characters
  - `instructions`: 10–10,000 characters
  - `deadline`: ISO 8601
  - `points`: 0–10,000
  - `maximumMarks`: 1–10,000
  - `allowResubmission`, `allowLateSubmission`: booleans
  - `maxResubmissions`: 0–50 (0 means unlimited)
- **Submission:** `answerText` 1–20,000 characters, `note` ≤1,000 characters.
- **Uploads (per file):**
  - Submission and brief files: 20 MB; PDF, images including HEIC, DOC/DOCX, ZIP, TXT.
  - Feedback files: 10 MB.
  - Resources: 50 MB; additionally PPT/PPTX and EPUB.
  - 100 MB maximum per request.

## 5. Authentication and authorization

- **Login:** `POST /auth/login { username, password }`, where `username` may also be the e-mail. It returns `access_token` (JWT, 15 min), `expires_in`, `refresh_token`, `refresh_expires_at`, and `user` (id, username, email, firstName, lastName, role, division, gradeLevel, school, points, problemsSolved, avatarUrl, …).
- **Refresh token:** 30 days, rotated on every use, and reuse revokes the whole session family. Browsers receive it as the httpOnly cookie `rof_refresh` with `SameSite=Strict` and `path=/api/v1/auth`; it is marked `Secure` only when `NODE_ENV=production` (`src/auth/auth.controller.ts:183`). Callers must use `credentials: 'include'`.
- **Access-token handling:** the guide recommends keeping it **in memory**, refreshing once on a 401, and signing out if that fails.
- **Lockout:** 5 wrong passwords lock the account for 15 minutes, but the response is indistinguishable from a wrong password.
- **Ending sessions:** suspension, role change and password change or reset end every session immediately.
- **Roles and permissions:** STUDENT, MENTOR and ADMIN, with a fixed permission list in `src/auth/permissions.ts`, exposed via `GET /me/permissions`.
- **No implicit admin override:** grading (`reviews.grade`) is MENTOR-only, so admins never grade, and creating assignments is MENTOR-only.
- **Scope enforcement:** students out of scope get **404**; mentors out of scope get **403** with `NOT_ASSIGNED_TO_SCOPE` or `NOT_ASSIGNED_MENTOR`.
- **Privacy:** students see other students as first name plus last initial, and e-mails are shown only to admins.
- **Account lifecycle:**
  - Admin create (active immediately).
  - Invite or CSV import (activation link).
  - Student self-registration (e-mail verification in production).
  - Mentor application, approved by an admin.
- **E-mail links:** these point to `APP_URL + /activate?token=` and `/reset-password?token=`.

## 6. Business logic: implementation status

| Capability | Status |
|---|---|
| Auth, sessions, lockout, activation, password reset | Fully implemented |
| User admin (CRUD, invite, CSV import with dry-run, status, resend, reset link) | Fully implemented |
| Academic years, enrolments, promotion | Fully implemented |
| Courses (fixed 4) and resources with attachments, publish/archive | Fully implemented |
| Mentor scopes and mentor applications | Fully implemented |
| Assignment lifecycle (draft → approval → publish → close → archive) with history | Fully implemented |
| Submission and review pipeline (8 steps, resubmissions, revisions, distribution, approval, publication, reopen) | Fully implemented |
| Leaderboard (per division, schools), points | Fully implemented |
| Discussions, reactions, reports, moderation | Fully implemented |
| Notifications (in-app + e-mail outbox, preferences, per-type settings) | Fully implemented (**polling only, no push**) |
| Admin dashboard, 9 reports + CSV, audit log, activity log | Fully implemented |
| Settings, support info, bulk e-mail | Fully implemented |
| Study groups | Code present, **switched off** |
| Live sessions | **Removed** (migration `20261118000000_remove_live_sessions_and_reminders`) |
| Mentor-facing student list, direct messaging, mentor CSV export, sorting | **Not implemented** |

## 7. Seed and demo data

Local run (verified 2026-11-05): `node dist/main.js` with `npx prisma dev --name rof` starts cleanly. The database is migrated and seeded with demo users, and SMTP is unset, so the e-mail module runs in **DRY_RUN** (no mail is delivered).

- **Admin account:** username `admin`. The password comes from `SEED_ADMIN_PASSWORD`; if it is unset, a random password is generated and printed once. The guide says `Admin12345` in the Docker stack. **Verified 2026-11-05: `Admin12345` is not the admin password in the local `rof` database** (one attempt only, to stay under the lockout), so the owner must supply it.
- **Demo accounts:** `mentor.junior` and `mentor.senior` (each scoped to all 4 courses in one division), and `student.s2` and `student.s5`. All use password `Demo1234`.
