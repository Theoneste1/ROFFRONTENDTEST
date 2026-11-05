# Phase 5 — Admin Portal: Inspection and Implementation Plan

Prepared 2026-11-05. **Plan only: no application code, backend files or data were changed while preparing it.**

Sources inspected:
- The frontend audit documents: `FRONTEND_AUDIT.md`, `BACKEND_AUDIT.md`, `INTEGRATION_MAPPING.md`, `IMPLEMENTATION_ROADMAP.md`, `INTEGRATION_PROGRESS.md`.
- Every file under `app/admin/`.
- The backend's `docs/api/routes.json`, `response-schemas.json`, the DTOs under `src/**/dto`, `src/auth/permissions.ts`, `src/settings/settings.registry.ts`, `prisma/seed.ts`, and the migration `20261104000000_academic_structure_reviews_moderation`.
- The API Guide artifact.

Status legend:
- ✅ **available**: route exists, its contract was read, and it is e2e-tested by the backend's own suite.
- ⚠ **partial**: some UI fields have no backend source.
- ❌ **missing**: no backend support.
- 🚫 **excluded**: an owner decision.

"Verified from the frontend" happens in phase 5 testing. None of the admin routes has been called yet, because there are no admin credentials.

---

## 1. Current state of the admin frontend

All 11 pages are **static mock-ups**. They have no API calls, hardcoded arrays, and 10 `alert()` placeholders.

Phase 2 already wired:
- `RoleGate role="ADMIN"`;
- the real name in the navbar;
- Sign Out.

Not wired yet:
- the Help and Settings buttons (phase 6);
- the bell (phase 6).

| Route | File | Today | Audit verdict |
|---|---|---|---|
| `/admin/dashboard` | `app/admin/dashboard/page.tsx` (145 lines, server component) | 5 metric cards, "Needs attention", "Recent activity", all literals | Complete (static) |
| `/admin/users` | `users/page.tsx` + `components/UsersTableClient.tsx` | Search, role/status pills, table; "View" → `alert()`; no create/invite/import | Partial |
| `/admin/mentors` | `mentors/page.tsx` | Single division per mentor plus a comma-separated course string (wrong model); `alert()` ×2 | Partial |
| `/admin/students` | `students/page.tsx` | Mock progress bars; `alert()` | Partial |
| `/admin/divisions` | `divisions/page.tsx` | 2 cards, "accepting new students" toggle, Senior description bug (line 29); `alert()` ×3 | Complete (static) |
| `/admin/courses` | `courses/page.tsx` | Edit modal with division checkboxes and an active switch (local only) | Partial |
| `/admin/assignments` | `assignments/page.tsx` | Status pills that don't match backend states; "Create official assignments" copy (admins can't create) | Partial |
| `/admin/results` | `results/page.tsx` | Per-assignment publication table; `alert()` ×2 | Partial |
| `/admin/results/[id]` | `results/[id]/page.tsx` | Ignores `id`; review table | Partial |
| `/admin/reports` | `reports/page.tsx` | Filters change nothing ("sample dataset") | Partial |
| `/admin/audit-log` | `audit-log/page.tsx` | Mock log; categories don't match the backend | Partial |

Pages the backend supports that don't exist yet:
- assignment detail and approval;
- submissions and distribution;
- per-review approval;
- mentor applications;
- moderation;
- settings;
- schools (read-only);
- course resources (admin view).

---

## 2. Admin roles and permissions (backend, authoritative)

`ADMIN` permissions (`src/auth/permissions.ts`):
- **Content:** `courses.view`, `resources.view`, `resources.manage`.
- **Assessment:** `assignments.view`, `assignments.publish`, `submissions.distribute`, `results.approve`, `results.publish`.
- **Discussions:** `discussions.participate`, `discussions.report`, `discussions.moderate`.
- **Reporting:** `analytics.course`, `leaderboard.view`, `reports.export`.
- **Administration:** `users.manage`, `academicYears.manage`, `enrollments.manage`, `divisions.manage`, `courses.manage`, `mentorAssignments.manage`, `mentorRequests.decide`, `settings.manage`, `email.bulkSend`, `audit.view`, `activity.view`.

Rules the UI must respect:
- **Admins never grade.** There is no `reviews.grade` permission, so no score or feedback editing. Approve and send back only.
- **Admins don't create assignments.** `POST /assignments` is mentor-only. Admins publish, reject, close, reopen, unpublish and archive.
- **No implicit override.** Mentor-only and student-only routes answer 403 for admins.
- **Admins see e-mail addresses.** Students and mentors don't.
- The admin UI picks actions from `GET /me/permissions` and the role. The backend enforces everything again on every request.

---

## 3. Feature-by-feature mapping to the backend

All paths are under `/api/v1`. Every list is paginated (`?page=&limit≤100`) and returns `{ data, meta }`.

### 3.1 Dashboard — `/admin/dashboard` (existing page)

| Need | Endpoint | Key fields | Status |
|---|---|---|---|
| Headline metrics | `GET /admin/dashboard?academicYearId&divisionId&courseId&from&to` | `students{total,active,inactive,awaitingSetup,byDivision[],byCourse[]}`, `mentors{total,active,inactive,awaitingSetup,activity}`, `assignments{byStatus,published}`, `submissions{total,late,byStatus}`, `reviews{awaitingDistribution,pendingMentorReview,awaitingAdminApproval,completed}`, `results{awaitingPublication,published}`, `reportedContent{open,…}`, `accountsAwaitingSetup{mentorApplications,studentsAwaitingApproval,…}` | ✅ |
| "Needs attention" | `GET /admin/reports/overview` → `actionRequired{assignmentsAwaitingApproval, submissionsToDistribute, reviewsAwaitingApproval, resultsReadyToPublish, mentorApplications, studentsAwaitingApproval, failedEmails}` | Each item links to its queue page | ✅ |
| "Recent activity" | `GET /admin/audit-logs?limit=6` (who did what), or `GET /admin/activity` (learner activity) | `action`, `actor`, `entity`, `createdAt` | ✅ |

**Approach:** keep the 5 cards and 2 lists. "Active courses 4 / Mathematics" becomes "Published courses" from `GET /courses`. Each attention item becomes a link with a count.

### 3.2 Users — `/admin/users` (existing) plus a new `/admin/users/[id]`

| Action | Endpoint | Request fields (validation) | Status |
|---|---|---|---|
| List, search, filter | `GET /admin/users?role&divisionId&gradeLevel&schoolId&isApproved&isActive&isActivated&search&page&limit` | Response: `id, username, email, firstName, lastName, role, isActive, isApproved, activatedAt, division, gradeLevel, school, points, lastLoginAt, provider` | ✅ |
| View | `GET /admin/users/:id` | same | ✅ |
| Create with password (active immediately) | `POST /admin/users` | <ul><li>`firstName`, `lastName` 1–100</li><li>`username` 3–30 `[a-z0-9._-]`</li><li>`email`</li><li>`password` (8–100, a letter and a digit)</li><li>`role?`</li><li>`gradeLevel` (required for students)</li><li>`schoolId?`</li><li>`homeLocation?` 2–200</li></ul> | ✅ |
| Invite (activation e-mail) | `POST /admin/users/invite` | `firstName`, `lastName`, `email`, `username?`, `role?`, `gradeLevel` (students), `schoolId?` or `schoolName` + `schoolLocation`, `homeLocation?` | ✅. Invitees need the e-mailed link, and the backend runs SMTP in **DRY_RUN** (see §7) |
| CSV import | `POST /admin/users/import?dryRun=true\|false` (multipart, ≤1 MB, ≤1000 rows; header `firstName,lastName,email[,role,gradeLevel,schoolName,schoolLocation,homeLocation,username]`) | Dry run first, then import; per-row errors | ✅ |
| Edit | `PATCH /admin/users/:id` | Any of the create fields, all optional. A role change ends the user's sessions | ✅ |
| Suspend or reactivate; approve | `PATCH /admin/users/:id/status` | `{ isActive?, isApproved? }` (ends sessions on suspend) | ✅ |
| Resend invitation | `POST /admin/users/:id/resend-invitation` | — | ✅ |
| Send password-reset link | `POST /admin/users/:id/send-password-reset` | Admins never see or set others' passwords after creation | ✅ |
| Delete | `DELETE /admin/users/:id` | Confirm dialog | ✅ (backend rules decide what can be deleted) |
| Create another admin | `POST /admin/users` with `role: ADMIN` (or `POST /auth/register/admin`) | — | ✅ |

**Approach:**
- Keep the table and pills, and map them to backend filters.
- **Status is derived:** `isActive=false` → Suspended; `activatedAt=null` → Awaiting setup; `isApproved=false` → Awaiting approval; otherwise Active.
- Add create, invite and import dialogs, and a detail and edit page.
- Mentors are linked to their scopes (§3.3).

### 3.3 Mentors — `/admin/mentors` (existing)

| Action | Endpoint | Fields | Status |
|---|---|---|---|
| Mentor list and figures | `GET /admin/users?role=MENTOR` and/or `GET /admin/reports/mentors` (status, scopes, per-person figures) | — | ✅ |
| Scopes (course × division) | `GET /admin/mentor-assignments?mentorId&courseId&divisionId&isActive`, `POST /admin/mentor-assignments {mentorId,courseId,divisionId}`, `DELETE /admin/mentor-assignments/:id` | — | ✅ |
| Mentor applications | `GET /mentor-requests?status`, `PATCH /mentor-requests/:id/approve`, `PATCH /mentor-requests/:id/reject` (no body) | — | ✅ |
| Workload | `GET /admin/reports/mentor-activity` (+ `.csv`), `/admin/reports/mentor-workload.csv` | — | ✅ |

**Approach:**
- Replace the "one division + course string" model with a **list of scopes** per mentor, using an add/remove "Course access" dialog (the button already exists).
- Add an "Applications" tab.
- "Needs attention" is derived: no active scopes, or awaiting setup.

### 3.4 Students and schools — `/admin/students` (existing), `/admin/schools` (new, read-only)

| Need | Endpoint | Status |
|---|---|---|
| Student list with figures | `GET /admin/reports/students?status&q&academicYearId&divisionId&courseId&from&to` → `name, username, email, gradeLevel, division, school, status, enrollmentStatus, submissions, resultsPublished, points, lastLoginAt` (+ `.csv`) | ✅ |
| Edit student details (grade, school, home location) | `PATCH /admin/users/:id` | ✅ |
| Schools list and detail | `GET /schools?page&limit` (`name, location, _count`), `GET /schools/:id` | ✅ read-only |
| Create, edit or delete schools | — | ❌ **No endpoint.** Schools are created implicitly through invitations or CSV import (`schoolName` + `schoolLocation`) and student self-registration |
| Enrolment correction, academic years | `/admin/academic-years*`, `/admin/enrollments/:id` | 🚫 **Excluded by owner instruction** ("do not add academic enrollment features"). Not planned |

**Approach:**
- Students page: real list and figures. Replace the mock "Assignment Activity" bar with submissions and published results. Row → user detail.
- Schools: a read-only list page linked from Students. No create or edit controls.

### 3.5 Divisions and courses — existing pages

| Action | Endpoint | Fields | Status |
|---|---|---|---|
| List divisions | `GET /admin/divisions` → `code, name, description, isActive, gradeLevels, _count{students, mentorAssignments}` | — | ✅ |
| Edit division | `PATCH /admin/divisions/:id` | `name` 2–100, `description` 0–1000, `isActive` | ✅ |
| "Accepting new students" toggle | — | — | 🚫 Hide (owner decision; no field) |
| Courses list | `GET /courses` (`status`, `counts`, `discussionsEnabled`) + `GET /admin/reports/course-participation` | — | ✅ |
| Edit course | `PATCH /admin/courses/:id` | `title` 3–200, `description` 10–2000, `sortOrder`, `discussionsEnabled` | ✅ |
| Publish, unpublish, archive course | `PATCH /admin/courses/:id/publish\|unpublish\|archive` | — | ✅ (creating or deleting courses is not supported by design: 4 fixed courses) |
| Course × division availability checkboxes | — | — | ❌ Remove (all 4 courses apply to both divisions) |

**Approach:** keep the cards, table and edit modal. Fix the Senior description bug by loading the real data. Note that `_count.mentorAssignments` counts scopes, not people.

### 3.6 Assignments: approval, publishing, closing, archiving — `/admin/assignments` (existing) plus a new `/admin/assignments/[id]`

| Action | Endpoint | Body | Allowed from | Status |
|---|---|---|---|---|
| List | `GET /assignments?courseId&divisionId&status&academicYearId&createdById&q&deadlineFrom&deadlineTo&page&limit` (`_count.submissions`, `rejectionNote`, `resultsPublishedAt`) + `GET /admin/reports/assignments` (`expected`, `submitted`, `late`, `missing`, `byStage`, average) | — | — | ✅ |
| Detail and history | `GET /assignments/:id`, `GET /assignments/:id/history`, brief files | — | — | ✅ |
| **Publish** | `PATCH /assignments/:id/publish` | — | PENDING_APPROVAL | ✅ (notifies the division's students) |
| **Reject (return to mentor)** | `PATCH /assignments/:id/reject` | `rejectionNote` 5–1000 | PENDING_APPROVAL | ✅ |
| Unpublish | `PATCH /assignments/:id/unpublish` | — | PUBLISHED with 0 submissions | ✅ |
| **Close** | `PATCH /assignments/:id/close` | `note?` 1–1000 | PUBLISHED | ✅ |
| Reopen | `PATCH /assignments/:id/reopen` | `note?`, `deadline?` (ISO) | CLOSED | ✅ |
| **Archive** | `PATCH /assignments/:id/archive` | — | any | ✅ |

**Approach:**
- Tabs mapped to real states: **Awaiting approval** (PENDING_APPROVAL, default when non-empty), Published, Closed, Returned (REJECTED), Drafts (read-only, mentors' work), Archived.
- Keep the review-progress column, sourced from `/admin/reports/assignments`.
- Fix the page copy: admins approve and publish; mentors create.
- The detail page shows the actions allowed for the current state, the history, and the submissions (§3.7).

### 3.7 Submissions and distribution to mentors — new section on `/admin/assignments/[id]`

| Action | Endpoint | Body | Status |
|---|---|---|---|
| All submissions of an assignment | `GET /submissions?assignmentId&courseId&divisionId&mentorId&studentId&status&page&limit` → `student, status, review{mentor,status,score…}, revisions, files, isLate, resultRelease` | — | ✅ |
| **Distribute** (bulk) | `POST /assignments/:id/distribute` | `strategy?` `BALANCED\|ROUND_ROBIN` (default from settings), `mentorIds?[]` (≤100; only active mentors of the scope) | ✅ |
| Assign one | `PATCH /submissions/:id/assign` | `mentorId` | ✅ |
| **Reassign** | `PATCH /submissions/:id/reassign` | `mentorId` (starts a new review cycle) | ✅ |
| Distribution history | `GET /assignments/:id/distribution-batches` | — | ✅ |
| Files, history, review cycles | `GET /submissions/:id`, `…/history`, `…/reviews`, `…/attachments/:aid/file`, `…/feedback-files/:aid` | — | ✅ |

**Approach:**
- Submissions table on the assignment detail: status filter (Awaiting distribution = SUBMITTED, Assigned, In review, Submitted to admin, …).
- A "Distribute" dialog (strategy, optional mentor subset, chosen from `GET /admin/mentor-assignments?courseId&divisionId&isActive=true`).
- Per-row assign or reassign.

### 3.8 Review approval and send-back — `/admin/results/[id]` (existing) plus a new `/admin/submissions/[id]`

| Action | Endpoint | Body | Allowed from | Status |
|---|---|---|---|---|
| Review to approve (score, feedback, files, mentor) | `GET /submissions/:id`, `GET /submissions/:id/reviews` | — | — | ✅ |
| **Approve** | `PATCH /submissions/:id/approve` | `coordinationNote?` 2–2000 (internal, admin-only) | SUBMITTED_TO_ADMIN | ✅ |
| **Send back to mentor** | `PATCH /submissions/:id/reject` | `rejectionReason` 5–2000 | SUBMITTED_TO_ADMIN | ✅ (→ mentor sees SENT_BACK with the reason) |

**Approach:**
- `/admin/results/[id]` uses the real assignment `id`. Its table lists submissions with review status.
- Rows awaiting approval link to `/admin/submissions/[id]`, which is also a backend notification link target.
- That page is read-only for score and feedback (**admins never grade**), with Approve and Send back.

### 3.9 Result approval and publication — `/admin/results` (existing)

| Action | Endpoint | Body | Status |
|---|---|---|---|
| Overview per assignment | `GET /admin/reports/results-publication?…` (+ `.csv`) | — | ✅ |
| **Publish one** | `PATCH /submissions/:id/publish` | — | ✅ (APPROVED → PUBLISHED; points recomputed) |
| **Publish all approved of an assignment** | `POST /assignments/:id/results/publish` | `note?` | ✅ |
| Release history | `GET /assignments/:id/result-releases` | — | ✅ |
| Correct after publication (send back to mentor) | `PATCH /submissions/:id/reopen` | `reopenNote` 5–2000 | ✅ (admins never edit scores) |
| Result history | `GET /submissions/:id/result-history` | — | ✅ |
| Leaderboard recompute | `POST /admin/leaderboard/recompute` | — | ✅ (maintenance; place it on Settings) |

**Approach:**
- The button style is driven by data: "Review & Publish" when approved results exist, otherwise "View".
- A confirm dialog shows how many results will be published.

### 3.10 Learning resources (admin) — new tab under `/admin/courses`

| Action | Endpoint | Status |
|---|---|---|
| All resource actions in any course × division | The same endpoints as the mentor portal (`/courses/:courseId/resources*`). Admins hold `resources.manage` for every scope | ✅ |

**Approach:** **reuse** the phase 4 `ResourcesTab` and `ResourceForm` components with an admin course × division selector (all 8 scopes) instead of `/me/teaching`. There's no new API code; only the scope source changes.

### 3.11 Reports and audit — existing pages

| Need | Endpoint | Status |
|---|---|---|
| Report cards | `GET /admin/reports/{students,mentors,enrollment,course-participation,assignments,reviews,results-publication,mentor-activity}` with `academicYearId, divisionId, courseId, from, to` (+ `status, q` on user reports) | ✅ (`enrollment` shown read-only as a report; no enrolment editing) |
| CSV downloads | Every `…/*.csv` plus `mentor-workload.csv`, `results.csv`, `student-progress.csv` (authenticated blob, like the existing file downloads) | ✅ |
| Audit log | `GET /admin/audit-logs?category&action&actorId&actorRole&entity&entityId&from&to&page&limit`, `…/:id`, `…/actions`, `…/export.csv` | ✅. Categories: USERS, ENROLLMENT, MENTOR_ASSIGNMENTS, ASSIGNMENTS, SUBMISSIONS, DISTRIBUTION, REVIEWS, RESULTS, MODERATION, SETTINGS, ACADEMIC_YEARS, COURSES, SECURITY, DATA_EXPORTS, STUDY_GROUPS, OTHER |

**Approach:** keep the report cards and audit table. Map the filters to real parameters; the timeframe select becomes `from`/`to`. Replace the "Access" and "System" categories with the backend list, and add a detail drawer and CSV export.

### 3.12 Moderation — new `/admin/moderation`

| Action | Endpoint | Status |
|---|---|---|
| Reports queue and detail | `GET /admin/moderation/reports?status&reason&targetType`, `GET …/:id` | ✅ |
| Resolve | `POST /admin/moderation/reports/:id/resolve` `{action: HIDE\|DELETE\|LOCK\|NONE, …}` | ✅ |
| Hide or restore a comment; thread ops | `PATCH /comments/:id/hide\|restore`, `PATCH /threads/:id/{lock,unlock,hide,restore,archive,pin,unpin}` | ✅ |
| Hidden comments; action log | `GET /admin/comments/hidden`, `GET /admin/moderation/actions` | ✅ |

**Approach:** a new page with a sidebar link. The dashboard's "reported content" count links to it, and `/admin/moderation/reports/:id` is a backend notification link target.

### 3.13 Settings and other admin features

| Feature | Endpoint | Status / plan |
|---|---|---|
| Platform settings | `GET`/`PATCH /admin/settings`. 16 keys: registration (self-signup, approval, e-mail verification), assignment defaults, resubmission-request days, default distribution strategy, e-mail on/off, leaderboard visibility, platform name, support contact | ✅. New `/admin/settings` page, generated from the registry metadata (type, min/max, options). The sidebar "Settings" button already exists. **Owner question below:** admin platform settings in phase 5, or with the phase 6 profile settings? |
| Bulk e-mail | `POST /admin/email/send`, `GET /admin/email/jobs*`, `GET /admin/email/users`, `POST …/:id/retry` | ✅, but SMTP is in DRY_RUN locally. **Owner decision** whether it is in scope (optional) |
| Notifications (admin's own) | `GET /notifications*`, `/me/notification-settings` | ✅. **Phase 6** (inbox, deep links, preferences), as planned |
| Learner activity log | `GET /admin/activity`, `…/summary` | ✅. Optional: dashboard feed or reports |

---

## 4. Investigation: `student.s5`'s submission to the Junior "Sample set"

Investigated **read-only**: GET requests as `student.s5` and `mentor.junior`, and reading backend seed and migration files. **Nothing was modified.**

| Fact | Evidence |
|---|---|
| Submission `693d11b7-fd0e-4271-8447-e2ef6d25b32d`, status IN_REVIEW, one attempt (`work2.pdf`) | `GET /me/submissions` (s5), `GET /submissions/:id` (mentor.junior) |
| The assignment "Sample set" (`709ff6eb…`) belongs to **Algebra · JUNIOR**, CLOSED | `GET /assignments/:id` |
| `student.s5` is **S5, SENIOR**, in one enrolment (2026-2027, SENIOR, ACTIVE) and was never Junior | `GET /me`, `GET /me/enrollments` |
| Timeline: s5 user created 23:19:41 (seed) → "Sample set" created **23:49:54.399** → s2 submitted **23:49:54.498** → s5 submitted **23:49:54.640** → enrolments created by the migration 23:55:56 | API timestamps |
| The review is cycle 1, IN_PROGRESS, assigned to `mentor.junior`, with one event "ASSIGNED — *Migrated from the previous review model*" | `GET /submissions/:id/reviews` |
| That note is written by migration `20261104000000_academic_structure_reviews_moderation`, which converted pre-existing submissions into the new review model | `prisma/migrations/…/migration.sql` (line ~641) |
| The demo seed creates users and scopes only, **no assignments or submissions** | `prisma/seed.ts` |
| Today the API refuses this: `POST /submissions` by s5 for the Junior assignment → **404** | Phase 3 API test |

**Conclusion.**
- The record was created before the current academic-structure model existed, apparently by a development script: two students submitted within 250 ms of the assignment being created.
- The current submit rules, which enforce the student's division, were not involved. The record is a **legacy data artefact, not a frontend or API defect**.
- The exact script that created it could not be identified from the repository, so that point is *not determinable from the code*.

**Effects today:**
- `/mentor/reviews` shows it to `mentor.junior` as "1 review to do".
- `student.s5` sees it in `GET /me/submissions` but cannot open the assignment (404).
- It is counted in analytics: "Sample set: 2 submissions", "submission rate 200%" for a 1-student division.

**Phase 5 admin views to confirm (read-only):**
- `GET /submissions?assignmentId=709ff6eb…`
- `GET /admin/users/{s5}`
- `GET /admin/audit-logs?entity=Submission&entityId=693d11b7…`
- `GET /admin/reports/assignments` (expected vs submitted)

**Owner decision needed (no change until then).** The backend has **no delete-submission endpoint**. The options available through the API are:
- (a) leave it as is and document it;
- (b) admin reassigns or cancels the review (`PATCH …/reassign` to another mentor). This still leaves the submission;
- (c) clean it up at database level, which is outside this frontend project and would be a backend or data task.

---

## 5. Admin actions needed for the outstanding end-to-end tests

Uses the existing `[TEST]` records. Each step **changes data**, so the owner confirms before it starts. Recommended assignment: **`a266c16c-4f68-4b32-9d59-f225cacd6fcc`** ("[TEST] Phase 4 wizard assignment 1793912390610 (edited)"). It **allows resubmission** (up to 2), so the mentor's "return for revision" path can be tested too. `f0b37379…` does *not* allow resubmission.

| # | Actor | Action | Endpoint | Verifies |
|---|---|---|---|---|
| 1 | mentor.junior | Submit for approval | `PATCH /assignments/:id/submit` | Phase 4 |
| 2 | **admin** | **Publish** | `PATCH /assignments/:id/publish` | Phase 5 approval; students notified |
| 3 | student.s2 | Submit text plus a file | `POST /submissions` | **Phase 3 outstanding test** |
| 4 | student.s2 | Resubmit before review (allowed) | `POST /submissions` | Phase 3 resubmission |
| 5 | **admin** | **Distribute** to mentor.junior | `POST /assignments/:id/distribute` (or `PATCH /submissions/:id/assign`) | Phase 5 distribution |
| 6 | mentor.junior | Start review → **Return for revision** (note, due date) | `PATCH …/start-review`, `…/request-resubmission` | **Phase 4 outstanding** |
| 7 | student.s2 | Resubmit after the request | `POST /submissions` | Phase 3 resubmission-requested state |
| 8 | mentor.junior | Mark (score, feedback, file) → Send to admin | `PATCH …/mark`, `…/submit-to-admin` | **Phase 4 grading** |
| 9 | **admin** | **Send back** with a reason | `PATCH /submissions/:id/reject` | Phase 5 send-back; mentor sees SENT_BACK |
| 10 | mentor.junior | Resume → re-mark → Send to admin | `…/start-review`, `…/mark`, `…/submit-to-admin` | Phase 4 cycle 2 |
| 11 | **admin** | **Approve** | `PATCH /submissions/:id/approve` | Phase 5 |
| 12 | **admin** | **Publish results** | `POST /assignments/:id/results/publish` | Phase 5; student notified |
| 13 | student.s2 | Sees the result, feedback and files; leaderboard points change | `GET /me/results/:id`, `/leaderboard/me` | Phase 3 results after a real release |
| 14 | **admin** | Close the assignment (and optionally reopen) | `PATCH …/close` / `…/reopen` | Phase 5 |

Side effects to accept:
- `student.s2`'s points and rank will change; they are a seeded demo account.
- Notifications are created for s2, the mentor and the admins.
- Admin actions are written to the append-only audit log.

---

## 6. Test data to preserve (no deletion or modification without owner approval)

| Record | Id | State |
|---|---|---|
| [TEST] Algebra practice book (BOOK, published) | `538a6567-3e98-41d2-9e38-8d26763ce4f9` | unchanged |
| [TEST] Unpublished note (NOTE) | `90679339-20b4-4eab-98ba-d83e6eb8ac50` | unchanged |
| [TEST] Draft assignment (no resubmission) | `f0b37379-fb90-4515-85b2-b9bdb2a05830` | DRAFT |
| [TEST] Phase 4 wizard assignment …5775112 (edited) | `a7a543f0-7b81-499a-8f8c-781ca1c0dbc3` | DRAFT |
| [TEST] Phase 4 wizard assignment …2390610 (edited) — **proposed for the end-to-end test** | `a266c16c-4f68-4b32-9d59-f225cacd6fcc` | DRAFT |
| Soft-deleted "[TEST] comment …" rows | — | not listed by the API; an admin can enumerate them via moderation views |
| Legacy s5 submission | `693d11b7-…` | do not touch (§4) |

Phase 5 tests will add new `[TEST]` records (for example a test user created with a password, a CSV dry run that creates nothing). Every one will be listed in `INTEGRATION_PROGRESS.md`.

---

## 7. Credentials and test accounts needed (none guessed or tried)

| Need | Why | Owner action |
|---|---|---|
| **An admin username and password** | All phase 5 testing. The seeded `admin` password is generated at seed time and is not the one in the backend guide (one attempt in phase 2; no further attempts) | Provide them out of band (not in chat logs if possible), or create a dedicated test admin. **The password should not be written into the repo or the docs** |
| (Optional) A second admin | Tests that an admin cannot act outside the rules and that admin data is isolated | Owner creates it, or approves the frontend test creating `[TEST]` admin `admin.test` via `POST /admin/users` |
| E-mail delivery for invitations and resets | Activation and reset links are e-mailed. Locally SMTP is **DRY_RUN**, so invite and import cannot be completed end to end | Either run Mailpit or SMTP (backend config, owner), or accept that invite/import are tested up to "invitation queued", and use "create with password" for runnable accounts |
| Existing demo accounts | `mentor.junior`, `mentor.senior`, `student.s2`, `student.s5` (demo-seed password, see `README.md`) | none |

---

## 8. Unresolved limitations and owner decisions

| # | Item | Default proposal |
|---|---|---|
| D1 | `student.s5` legacy submission (§4): leave, reassign, or a data clean-up outside the frontend | Leave it and document it; show it as is in admin views |
| D2 | Run the §5 end-to-end workflow on `a266c16c…` (changes data, s2 points, notifications, audit log) | Yes, once admin credentials exist |
| D3 | Admin **platform settings** page (`/admin/settings`): in phase 5, or together with the phase 6 Settings and Help work? | Phase 5 (admin feature); profile and preferences stay in phase 6 |
| D4 | **Bulk e-mail** (`/admin/email`) in scope? SMTP is DRY_RUN locally | Out of scope for phase 5 unless requested |
| D5 | **Moderation** page | In scope (supported, and a notification target) |
| D6 | **Schools:** read-only list (no create or edit API) | Read-only page linked from Students |
| D7 | **Academic years and enrolments** | Excluded (owner instruction). Only the read-only enrolment *report* is shown |
| D8 | "Accepting new students", course × division checkboxes | Hidden or removed (owner decision / no field) |
| D9 | Admin-created test user for user-management tests (`[TEST]` account, deletable afterwards) | **Owner decision: no new test users without approval** |
| D10 | Legacy `app/components/Sidebar.tsx` (unused, dead links) | Remove in the final cleanup (phase 7), not phase 5 |

Backend limitations (no backend changes in this phase):
- no school create or edit;
- no delete-submission;
- no assignment delete (B10);
- no server-side sort (B5);
- e-mail is DRY_RUN locally;
- notifications are polling only (phase 6).

---

## 9. Implementation sequence (each step committed after its tests pass)

| Step | Scope | Main endpoints | Depends on |
|---|---|---|---|
| 5.0 | **Foundation:** `lib/api/admin.ts`, `lib/queries/admin.ts`, admin query keys, shared admin UI (status badges, confirm dialog, note dialog, CSV download button); admin sidebar gains Moderation, Applications and Settings (if D3); admin shell collapses on phones (as student and mentor) | — | admin credentials for testing |
| 5.1 | **Dashboard:** real metrics, "Needs attention" links, recent activity | `/admin/dashboard`, `/admin/reports/overview`, `/admin/audit-logs` | 5.0 |
| 5.2 | **Users:** list, filters, paging, detail and edit, create, invite, CSV import (dry run → import), status, resend, reset link, delete | `/admin/users*` | 5.0 |
| 5.3 | **Mentors and applications:** scopes per mentor, applications approve or reject | `/admin/mentor-assignments*`, `/mentor-requests*`, `/admin/reports/mentors` | 5.2 |
| 5.4 | **Students and schools:** student report list, link to user detail, read-only schools | `/admin/reports/students`, `/schools*` | 5.2 |
| 5.5 | **Divisions and courses:** edit division, edit/publish/unpublish/archive course; admin **resources** tab reusing phase 4 components | `/admin/divisions*`, `/admin/courses/*`, `/courses/:id/resources*` | 5.0 |
| 5.6 | **Assignments:** approval queue, detail with publish/reject/unpublish/close/reopen/archive and history | `/assignments*` admin ops | 5.0 |
| 5.7 | **Submissions and distribution:** table on the assignment detail, distribute dialog, assign/reassign, batches | `/submissions`, `/assignments/:id/distribute`, `…/distribution-batches` | 5.6, 5.3 |
| 5.8 | **Review approval:** `/admin/submissions/[id]`, approve or send back; `/admin/results/[id]` real data | `/submissions/:id*` | 5.7 |
| 5.9 | **Result publication:** results overview, publish one or all, releases, reopen | `/admin/reports/results-publication`, `…/results/publish`, `…/publish`, `…/reopen` | 5.8 |
| 5.10 | **Reports and audit:** real filters, CSV downloads, audit filters, detail, export | `/admin/reports/*`, `/admin/audit-logs*` | 5.0 |
| 5.11 | **Moderation** (D5) and **Settings** (D3) | `/admin/moderation/*`, `/comments|threads` ops, `/admin/settings` | 5.0 |
| 5.12 | **End-to-end workflow run** (§5) and the investigation views (§4); final regression of the student and mentor suites | all of the above | 5.1–5.9, D2 |

---

## 10. Tests that must pass before phase 5 is marked complete

All are run against the running backend with real data. API suites go through the `:3001` proxy; browser suites use headless Edge, paced for the backend rate limits (10 sign-ins/min, 30 refreshes/min).

### A. Admin authentication and permissions
1. The admin signs in → `/admin/dashboard`. Reload keeps the session. Sign out ends it.
2. `GET /me/permissions` (admin) contains the admin set and **not** `reviews.grade` or `assignments.prepare`.
3. Admin token: `POST /assignments` → 403, `PATCH /submissions/:id/mark` → 403, `POST /submissions` → 403 (admins never grade or create).
4. Student and mentor tokens on every admin route used by the UI → 403 (extends the phase 3 and 4 suites).
5. Student or mentor opening `/admin/*` → own portal; admin opening `/student/*` or `/mentor/*` → `/admin/dashboard`.

### B. Dashboard
6. Every dashboard figure equals the corresponding field of `/admin/dashboard` and `/admin/reports/overview`.
7. Each "Needs attention" link opens the matching filtered queue.

### C. Users, mentors, students, schools
8. List filters (role, status, division, search) send the right query and show the API's rows. Paging works.
9. Create a `[TEST]` student with a password → appears and can sign in (once, paced). Validation errors (username pattern, password policy, required grade) appear beside the fields.
10. Edit details; suspend → that user's session ends (their next request 401 → login); reactivate.
11. Send a password-reset link and resend an invitation → success message (delivery DRY_RUN).
12. CSV import **dry run** shows per-row results and creates nothing. A real import only if the owner agrees.
13. Mentor scopes: add a scope → the mentor's `/me/teaching` shows it → remove it. Applications approve or reject (if any exist).
14. Students list matches `/admin/reports/students`. The schools list is read-only and has no edit controls.

### D. Divisions, courses, resources
15. Edit a division's description (then restore it). The Senior text is correct. No "accepting students" toggle.
16. Course edit and publish/unpublish reflect in the student `/courses` (an unpublished course disappears for students; then restore).
17. Admin resource tab: admin can manage resources in any scope. Students see only published ones.

### E. Assignment approval and publishing
18. A PENDING_APPROVAL assignment is in "Awaiting approval". **Reject with a note** → mentor sees "Returned" and the note → mentor edits and resubmits.
19. **Publish** → status PUBLISHED. Students of that division see it (`canSubmit` true); the other division does not.
20. Close → students can no longer submit. Reopen (with a new deadline) → they can again. Unpublish is offered only with 0 submissions. Archive is read-only afterwards.

### F. Submissions and distribution
21. The student submits (phase 3 outstanding) → it appears in the admin submissions table as "Awaiting distribution".
22. **Distribute** → the submission is ASSIGNED to the chosen mentor. The mentor's `/mentor/reviews` shows it; the other mentor doesn't.
23. Reassign → the new mentor has it, the old one doesn't, and the history shows a new cycle.

### G. Grading approval and send-back
24. The mentor marks and sends to admin (phase 4 outstanding) → the admin sees score and feedback **read-only**.
25. **Send back** with a reason → the mentor sees SENT_BACK and the reason → resumes, re-marks, re-sends.
26. **Approve** (with an optional coordination note, which students never see).

### H. Result publication
27. **Publish results** → the student sees score, percentage, points, feedback and files. Leaderboard points and rank update. The notification arrives.
28. Release history lists the publication. Reopen sends it back to the mentor, the student no longer sees the old result, and the history records it.

### I. Isolation after each workflow step
29. At each step of §5: the other student (s5) cannot see s2's submission or result (404). `mentor.senior` cannot see the Junior assignment or submissions. Mentors and students cannot call the admin actions (403).

### J. Errors, reports, audit, responsiveness
30. Invalid state transitions (for example publishing twice) show the backend's 409 message. Validation details sit beside fields. 5xx shows `requestId`.
31. Report filters change the data. Every CSV download returns 200 with a file name. The audit log filters by category and shows the actions performed in these tests.
32. Every admin page at 390 px: no horizontal page scroll, content ≥ 300 px.
33. Regression: the student suite (51), auth (19), mentor (57) and the API suites still pass. `tsc`, `eslint` and `next build` are clean.
34. No mock data remains in `app/admin/`. No `alert()`, no `href="#"`, no dead links. The backend is unchanged.

---

**Status (2026-11-05):** plan approved by the owner, with these decisions:
- **D1:** leave the s5 record.
- **D2:** prepare the workflow but do not run it.
- **D3:** settings are in scope.
- **D4:** bulk e-mail is excluded.
- **D5:** moderation is in scope.
- **D6:** schools are read-only.
- **D7:** no enrolment management.
- **D8:** remove the unsupported controls.
- **D9:** no new test users without approval.
- **D10:** clean up the legacy sidebar in phase 7.

## 11. Implementation status (2026-11-06)

Steps **5.0–5.11 are implemented**, one commit each. Step **5.12** (final integration and regression) has been run as far as possible without admin credentials. Details, endpoints and test results per step are in `INTEGRATION_PROGRESS.md` → Phase 5.

**Deviations from this plan,** each verified against the backend:

| Plan item | What was done | Why |
|---|---|---|
| Division `isActive` (§3.5) | Shown read-only, not offered as a switch | The DTO accepts it, but nothing in the backend acts on it, so a switch would do nothing |
| Reports "assignment" filter (§3.11) | Removed | The reports have no assignment parameter; per-assignment figures are on `/admin/results/[id]` |
| Reports "resource views" | Replaced by "late submissions" | No admin report provides resource views |
| Thread pin and unpin (§3.12) | Not offered | The report payload doesn't say whether a thread is pinned, so the right action can't be chosen |
| Dashboard "Needs attention" | Also shows "Reported discussion content" | From `/admin/dashboard` → `reportedContent.open` |

**Test status (§10):**
- **Done:** the non-admin parts of A4 and A5, the static parts of J33 and J34 (tsc, ESLint, build; no mocks, no `alert()`, no `href="#"`, every linked route exists), and the read-only regression.
- **Waiting for admin credentials:** A1–A3 and B–J (`api-admin.mjs admin`, `e2e-admin.mjs admin`).
- **Waiting for owner approval:** the data-changing parts, namely the §5 workflow (`e2e-workflow.mjs`, dry run by default) and C9–C13, D15–D17, E18–E20, F21–F23, G24–G26 and H27–H28.

**Phase 5 is not marked complete** until those tests have run or their limits are accepted by the owner.
