# ROF LMS — Frontend ↔ Backend Integration Mapping

Audit date: 2026-11-05. **Integration status for every module is "Not connected"**: the frontend makes no API calls.

Backend readiness:

- ✅ **Ready**: the endpoints exist and cover the UI.
- 🟡 **Partial**: the endpoints exist, but some UI features or fields have no backend source.
- ❌ **None**: no backend support.
- ⚫ **Removed**: the backend deliberately removed or disabled the feature.

All paths are under `/api/v1`.

## 1. Integration matrix: existing frontend modules

| # | Frontend module (files) | Existing UI | Backend support (endpoints) | Backend readiness | Integration status | Required action |
|---|---|---|---|---|---|---|
| 1 | **Authentication** | none (portal chooser at `app/page.tsx`) | `/auth/login`, `refresh`, `logout`, `logout-all`, `password`, `register/student`, `activation/inspect`, `activate`, `resend-activation`, `forgot-password`, `reset-password`; `GET /me`, `/me/permissions` | ✅ | Not built | **Build** login, activate, forgot and reset password, and register; add an API client, session provider and role guards to the 3 layouts |
| 2 | **Shell: navbars and sidebars** (`app/*/dashboard/components/{Navbar,Sidebar}.tsx`) | Complete (static) | `GET /me`, `/notifications/unread-count`, `POST /auth/logout` | ✅ | Not connected | Show the real user, add a notification badge (poll every 30–60 s), and wire Sign Out. Settings links to a new profile page, and Help uses `GET /support` |
| 3 | **Student dashboard** (`student/dashboard/page.tsx`) | Complete (static) | `GET /me`, `/me/courses`, `/me/assignments`, `/leaderboard/me`, `/notifications` | 🟡 | Not connected | Integrate. Quote, badges and calendar events have no backend; calendar can be derived from assignment deadlines |
| 4 | **Student courses** (`student/courses/page.tsx`) | Complete (static) | `GET /me/courses`, `GET /courses` | ✅ | Not connected | Integrate, routing by course `id` instead of invented slugs. "Lecture 1" and the badge have no source |
| 5 | **Student course detail** (`student/courses/[course]/page.tsx`) | Partial | `GET /courses/:id`, `/courses/:courseId/resources?type=`, `…/file`, `POST /courses/:id/complete`, `/courses/:courseId/threads` | 🟡 | Not connected | Integrate the Books (BOOK/EBOOK) and Past Papers (PAST_PAPER) tabs and add downloads. "Ask a question" posts a course thread. Mentor office hours, Learning Circle and completion time have **no backend**. Add `notFound()` |
| 6 | **Student assignments list** (`student/assignments/*`) | Partial | `GET /me/assignments` (`q`, `courseId`, deadline range, paging; `displayStatus`, `canSubmit`) | 🟡 | Not connected | Integrate and map statuses to `displayStatus`. Filtering by display status and sorting must be done **client-side on the current page**, since there is no server support |
| 7 | **Student assignment detail and submission** (`student/assignments/[id]/*`) | Partial | `GET /assignments/:id`, `…/file`, `…/attachments/:id/file`, `POST /submissions` (multipart), `GET /submissions/:id/history`, `GET /me/results/:submissionId` | 🟡 | Not connected | Integrate: add a real file input and validation, and drive resubmission from `canSubmit` and `resubmissionDueAt`. Steps checklist, deliverables, evaluation criteria and estimated time have **no backend** |
| 8 | **Assignment discussion tab** (same page) | Partial | `GET/POST /assignments/:assignmentId/threads`, `/threads/:id/comments`, `/comments/:id/replies`, `…/reactions` (LIKE/HELPFUL/CONFUSED), `…/report` | 🟡 | Not connected | Integrate, adapting the flat feed to threads with comments. Heart and laugh reactions become LIKE, HELPFUL and CONFUSED |
| 9 | **Student results** (`student/assignments/results/page.tsx`) | Partial | `GET /me/results?courseId=`, `/me/results/:submissionId`, feedback files | ✅ | Not connected | Integrate and add a row link to a result detail. Sorting is client-side. Show no reply box (`repliesAllowed=false`) |
| 10 | **Student leaderboard** (`student/leaderboard/*`) | Partial | `GET /leaderboard`, `/leaderboard/me`, `/leaderboard/schools` | 🟡 | Not connected | Integrate. Replace the "National / Study Group" toggle with Division / School rankings, since study groups are switched off. Remove the debug line |
| 11 | **Student live sessions** (`student/live-sessions/page.tsx`) | Complete (mock) | — | ⚫ Removed | — | **Remove the page and its nav link** (decision needed) |
| 12 | **Mentor dashboard** (`mentor/dashboard/page.tsx`) | Partial | `GET /me/teaching`, `/assignments?createdById=`, `/mentor/reviews`, `/analytics/courses/:courseId` | 🟡 | Not connected | Integrate by composing stats from these calls. There is no single dashboard endpoint |
| 13 | **Mentor assignments list** (`mentor/assignments/page.tsx`) | Partial | `GET /assignments?createdById=&status=` | ✅ | Not connected | Integrate, with tabs mapped to DRAFT, PENDING_APPROVAL, REJECTED, PUBLISHED and CLOSED. Show `rejectionNote` |
| 14 | **Mentor assignment wizard** (`mentor/assignments/create*`) | Partial ×3 | `POST /assignments` (multipart), `POST …/attachments`, `PATCH …/submit`, `…/recall`, `PATCH /assignments/:id` | 🟡 | Not connected | Consolidate into **one** wizard (based on `create/resources`) and add the deadline, division, points vs maximumMarks, maxResubmissions and late-submission fields. Replace "Publish" with "Save draft" and "Submit for approval". Assignment type, rubric, submission type and originality check have **no backend** |
| 15 | **Mentor assignment detail** (`mentor/assignments/[id]/page.tsx`) | Partial | `GET /assignments/:id`, `…/history`, `PATCH /assignments/:id` | 🟡 | Not connected | Integrate and add an edit route. **Delete has no backend**; use recall to draft instead |
| 16 | **Mentor submission review list** (`[id]/assignmentReview/*`; duplicate `[id]/submissions/*`) | Partial ×2 | `GET /mentor/reviews?assignmentId=&status=`, `GET /submissions/:id/file` | 🟡 | Not connected | Keep one tree. Mentors see **only the submissions assigned to them**, so "Not submitted" and "total" counts must come from `/analytics/courses/:courseId`. Messaging, CSV export and report download have **no backend** |
| 17 | **Mentor grading page** (`…/[submissionId]/*`) | Partial | `GET /submissions/:id`, `…/history`, `…/reviews`, `…/file`, `…/revisions/:n/file`; `PATCH …/start-review`, `…/mark` (multipart score, feedback, files), `…/submit-to-admin`, `…/request-resubmission` `{note, dueAt}`, `…/withdraw-resubmission-request` | ✅ | Not connected | Integrate the real pipeline: start → mark → submit to admin, plus resubmission with note and due date. Show the admin's send-back note |
| 18 | **Mentor courses: Books and Past Papers** (`mentor/courses/components/{BooksTab,PastPapersTab}.tsx`) | Partial | `GET/POST /courses/:courseId/resources`, `PATCH/DELETE`, `…/publish\|unpublish\|archive\|restore`, attachments | ✅ | Not connected | Integrate with a course × division selector fed by `/me/teaching`. Add publish state and menu actions |
| 19 | **Mentor upload book** (`mentor/courses/upload-book/page.tsx`) | Complete form | `POST /courses/:courseId/resources` then `POST …/attachments` | ✅ | Not connected | Integrate. Fix "Resource Type" to the BOOK/EBOOK/NOTE/PAST_PAPER/ATTACHMENT values and add division, author, year and tags. Reuse it for past papers |
| 20 | **Mentor course analytics** (`mentor/courses/components/OverviewTab.tsx`) | Partial | `GET /analytics/courses/:courseId` (students aggregate, per-assignment stats with score distribution, resources, review pipeline), `GET /leaderboard` | 🟡 | Not connected | Integrate the Overview and Reports sub-tabs. The Grades gradebook, the per-student Students tab, lessons progress and the activity feed have **no backend**. Remove the "Live Session" item and the `href="#"` links |
| 21 | **Mentor students page** (`mentor/students/page.tsx`) | Partial (unlinked) | none for mentors (`/admin/reports/students` is admin-only) | ❌ | — | **Decision:** hide or remove it, or request a backend endpoint (see Gap B1) |
| 22 | **Mentor student list filter and messaging** (`mentor/courses/studentlist/**`) | Partial / complete flow | none | ❌ | — | **Decision:** remove it, or request backend work (Gaps B1, B2) |
| 23 | **Mentor live sessions** (`mentor/live-sessions/page.tsx`) | Complete (mock) | — | ⚫ Removed | — | **Remove the page and its nav link** (decision needed) |
| 24 | **Admin dashboard** (`admin/dashboard/page.tsx`) | Complete (static) | `GET /admin/dashboard`, `/admin/reports/overview`, `/admin/activity` | ✅ | Not connected | Integrate and turn the attention items into links (assignments awaiting approval, reviews awaiting approval, results awaiting publication, mentor requests, reports) |
| 25 | **Admin users** (`admin/users/*`) | Partial | `GET/POST /admin/users`, `GET/PATCH/DELETE /admin/users/:id`, `…/status`, `invite`, `import?dryRun`, `resend-invitation`, `send-password-reset` | ✅ | Not connected | Integrate with server-side filters, search and pagination. Add a user detail page and create, invite and CSV-import dialogs. Derive status from `isActive`, `isApproved` and `activatedAt` |
| 26 | **Admin mentors** (`admin/mentors/page.tsx`) | Partial | `GET /admin/users?role=MENTOR`, `GET/POST/DELETE /admin/mentor-assignments`, `GET /mentor-requests`, `PATCH …/approve\|reject`, `/admin/reports/mentors` | ✅ | Not connected | Integrate. Change the UI model from one division per mentor to a **list of course × division scopes**. Add a mentor-applications view. "Needs attention" is derived (no scopes) |
| 27 | **Admin students** (`admin/students/page.tsx`) | Partial | `GET /admin/reports/students` (paged, includes submissions and results), `/admin/users?role=STUDENT`, `/admin/academic-years/:id/enrollments`, `PATCH /admin/enrollments/:id` | ✅ | Not connected | Integrate and add grade, school and enrolment status |
| 28 | **Admin divisions** (`admin/divisions/page.tsx`) | Complete (static) | `GET /admin/divisions`, `PATCH /admin/divisions/:id` (`name, description, isActive`) | 🟡 | Not connected | Integrate. "Accepting new students" has **no field** (decision: map to `isActive` or drop). Fix the Senior description bug |
| 29 | **Admin courses** (`admin/courses/page.tsx`) | Partial | `GET /courses`, `PATCH /admin/courses/:id` (`title, description, sortOrder, discussionsEnabled`), `…/publish\|unpublish\|archive`, `/admin/reports/course-participation` | 🟡 | Not connected | Integrate: use `status` instead of an active switch and add `discussionsEnabled`. The per-course division checkboxes have **no backend** (all 4 courses apply to both divisions), so remove them |
| 30 | **Admin assignments** (`admin/assignments/page.tsx`) | Partial | `GET /assignments`, `/admin/reports/assignments`, `PATCH …/publish\|reject\|unpublish\|close\|reopen\|archive`, `…/history`, `POST …/distribute`, `GET …/distribution-batches` | ✅ | Not connected | Integrate and add an assignment detail page with an approval queue (PENDING_APPROVAL), publish/reject, close/reopen and distribution. Fix the "Create official assignments" copy |
| 31 | **Admin results** (`admin/results/page.tsx`, `results/[id]/page.tsx`) | Partial | `/admin/reports/results-publication`, `GET /submissions?assignmentId=`, `PATCH /submissions/:id/approve\|reject\|publish\|reopen\|assign\|reassign`, `POST /assignments/:id/results/publish`, `GET …/result-releases` | ✅ | Not connected | Integrate and use the `[id]` param. Add approve and send-back per review, bulk publish, and reassign |
| 32 | **Admin reports** (`admin/reports/page.tsx`) | Partial | 9 report endpoints plus `.csv` variants | ✅ | Not connected | Integrate the filters (academic year, division, course, from/to) and add CSV download buttons (authenticated blob fetch) |
| 33 | **Admin audit log** (`admin/audit-log/page.tsx`) | Partial | `GET /admin/audit-logs`, `…/:id`, `…/actions`, `…/export.csv` | ✅ | Not connected | Integrate: use the backend categories, server filters and pagination, add a detail drawer and export |

## 2. Backend features with **no frontend UI** (pages to add)

| Backend capability | Endpoints | Suggested location |
|---|---|---|
| Public auth pages | `/auth/activation/inspect`, `/auth/activate`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/register/student`, `/auth/resend-activation` | `/login`, `/activate`, `/forgot-password`, `/reset-password`, `/register` |
| Mentor application | `POST /mentor-requests`, `GET /schools/search`, `GET /divisions` | `/apply-mentor` (public) |
| Profile and password | `GET/PATCH /me`, `PATCH /auth/password`, `/auth/logout-all` | `/<role>/settings` |
| Notifications inbox and preferences | `/notifications*`, `/me/notification-preferences`, `/me/notification-settings` | Navbar dropdown plus `/<role>/notifications` |
| Notification deep links | backend links: `/assignments/:id`, `/results/:submissionId`, `/courses/:courseId/resources/:id`, `/discussions/:threadId`, `/mentor/reviews[/:submissionId]`, `/mentor/assignments/:id`, `/admin/assignments/:id`, `/admin/submissions/:id`, `/admin/moderation/reports/:id` | Redirect routes that map to the role-prefixed pages (decision Q5) |
| Course discussions | `/courses/:courseId/threads`, `/threads/:id*` | Discussion tab on the student and mentor course pages, plus `/discussions/[threadId]` |
| Mentor review queue (cross-assignment) | `GET /mentor/reviews` | `/mentor/reviews` (the backend links here) |
| Mentor notes, e-books and attachments | resources `type=NOTE\|EBOOK\|ATTACHMENT` | Extra filter in the Books tab |
| Course completion | `POST /courses/:id/complete` | "Mark course complete" on the student course page |
| Admin: academic years and enrolments | `/admin/academic-years*`, `/admin/enrollments/:id` | `/admin/academic-years` |
| Admin: settings | `GET/PATCH /admin/settings` | `/admin/settings` (the sidebar already has a Settings button) |
| Admin: moderation | `/admin/moderation/*`, `/admin/comments/hidden`, `/threads/:id/:op`, `/comments/:id/hide\|restore` | `/admin/moderation` |
| Admin: bulk e-mail | `/admin/email/*` | `/admin/email` (optional) |
| Admin: submissions distribution and approval | `/submissions*`, `/assignments/:id/distribute` | `/admin/assignments/[id]`, `/admin/submissions/[id]` |
| Admin: schools, activity log, leaderboard recompute | `/schools`, `/admin/activity*`, `/admin/leaderboard/recompute` | Optional, low priority |

## 3. Field and terminology mapping (frontend mock → backend)

| Frontend term | Backend equivalent |
|---|---|
| Course slug `algebra`, `number-theory` … | `Course.id` (UUID) plus `code` ALGEBRA, NUMBER_THEORY … |
| Calculus, Trigonometry, Linear Algebra, "Geometry 101" | Not courses; only the 4 courses exist |
| Learning Circle, Cohort, G10–G12, "Advanced Division" | `Division` (JUNIOR/SENIOR) plus `GradeLevel` S1–S6 |
| Student assignment status (Needs Revision, In Review, Completed …) | `displayStatus`: Not Started / Submitted / Pending Review / Resubmission Requested / Reviewed |
| Mentor assignment tabs (Upcoming/Active/Completed) | `AssignmentStatus` DRAFT / PENDING_APPROVAL / REJECTED / PUBLISHED / CLOSED / ARCHIVED |
| Admin assignment status (Open, Reviewing, Results Ready …) | `AssignmentStatus` plus report `byStage` |
| Review status Reviewed / Not Reviewed | `SubmissionStatus` / `ReviewStatus` |
| "Total Points" | `points` (leaderboard) **and** `maximumMarks` (score ceiling): two fields |
| User `name`, `status` | `firstName` and `lastName`; status derived from `isActive`, `isApproved` and `activatedAt` |
| Mentor `division` + `courses` string | List of `MentorAssignment` { course, division, isActive } |
| Book "type" PDF/Link/PNG | `ResourceType` plus file MIME type from `FileObject` |
| Reactions ❤ 👍 😂 | LIKE, HELPFUL, CONFUSED |
| Leaderboard National / Study Group | Division leaderboard / school leaderboard |
| Audit categories Access / System | USERS, SECURITY, SETTINGS, ACADEMIC_YEARS, … |
| "Instructor" | Mentor |

## 4. Backend gaps (require approval before any backend change)

The backend is read-only in this phase. For each gap the **default recommendation is a frontend-only resolution** (remove, hide, or derive). A backend change is only proposed where the feature has clear product value.

| ID | Missing functionality | Affected frontend | Why it matters | Frontend-only option | Proposed backend change (needs approval) |
|---|---|---|---|---|---|
| B1 | Mentor-scoped student list (names, grade, school, per-student submission and score stats) | `mentor/students`, `mentor/courses/studentlist`, OverviewTab Students and Grades | Mentors can't see who is in their course × division or who hasn't submitted | Hide these pages and show aggregates from `/analytics/courses/:id` | `GET /mentor/students?courseId&divisionId&q&page`, scoped by `MentorAssignment`, without e-mails |
| B2 | Mentor → student messaging | `mentor/courses/studentlist/message/**`, "Message Students" buttons | Direct contact | Remove; point mentors to course or assignment discussion threads (mentors can post threads) | A messaging or "announcement" endpoint that creates Notifications for selected students |
| B3 | Mentor view of all submissions of their assignment (incl. "not submitted") | `assignmentReview` stats | Today a mentor sees only submissions distributed to them | Use `/analytics` submission rate plus `/mentor/reviews` | Optional `GET /assignments/:id/submissions` for the author (scoped) |
| B4 | Mentor CSV and grade export | Review page "Export Grades", "Download Report" | Convenience | Remove the buttons | Mentor-scoped CSV |
| B5 | Server-side sorting on lists | All tables with "Sort By" | Sorting across pages | Sort only within the loaded page, or drop sort controls | `sortBy` / `order` params on list DTOs |
| B6 | Student filter by `displayStatus` | Student assignments filter | Filter across pages | Filter client-side (assignment volume per student is small) | `displayStatus` query param |
| B7 | Mentor info and office hours on a course for students | Student course detail mentor card | Contact info | Remove the card or show the course thread link | Expose scope mentors on `GET /courses/:id` |
| B8 | Assignment type, rubric, submission type, originality check, steps, deliverables | Mentor wizard, student assignment detail | Richer briefs | Put them in `instructions` text; remove the controls | New Assignment fields (schema change) |
| B9 | Division "accepting new students", per-course division availability | Admin divisions and courses | Not modelled | Map to `isActive`, or remove | New fields |
| B10 | Delete assignment | Mentor assignment detail | Clean-up | Recall to draft, or admin archive | `DELETE /assignments/:id` for DRAFT only |
| B11 | Live sessions | Student and mentor live-sessions pages | Deliberately removed by the backend | **Remove the pages** | None recommended (it was removed on purpose) |
| B12 | Study-group leaderboard | Student leaderboard toggle | Module switched off | Replace with division and school | Re-register `StudyGroupsModule` (not recommended) |
| B13 | Gamification (badges, streaks, quote, "lessons" progress) | Student dashboard, leaderboard podium, mentor overview | Decorative | Remove, or derive from points | None recommended |
