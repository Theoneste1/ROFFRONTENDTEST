# Phase 6 — Notifications, Discussions, Profile, Settings and Help: Plan

Prepared 2026-11-06, after the owner approved phase 6. The owner asked for the plan to be presented and implementation to continue without waiting for another approval, as long as the work stays within the phase 6 brief.

Sources inspected:
- Backend: `src/notifications/*` (controller, service, listener, notification types), `src/discussions/*`, `src/users/users.controller.ts` (`/me`), `src/users/dto/update-user.dto.ts` (`UpdateMeDto`), `src/auth/dto/password.dto.ts`, `src/auth/auth.service.ts` (`changePassword`, `PROFILE_SELECT`), `src/settings/settings.controller.ts` (`/support`), `docs/api/routes.json`.
- Frontend: the three navbars and sidebars, `DiscussionPanel`, `lib/api/community.ts`, `lib/queries/community.ts`, `lib/auth/session.tsx`, `RoleGate`, the student course and assignment pages, and the mentor course workspace.
- Live data (read-only `GET` requests): unread counts, notification lists, preferences, settings and `/me` for `student.s2`, `student.s5`, `mentor.junior` and `mentor.senior`, plus `GET /support`.

## 1. Backend support (verified in the source)

| Area | Endpoints | Roles | Notes |
|---|---|---|---|
| Inbox | `GET /notifications` (`page`, `limit`, `unreadOnly`, `category`, `type`), `GET /notifications/:id` | all | Always scoped to the caller. Newest first. Each item has `category`, `type`, `title`, `body`, `data` (ids), `link`, `isRead`, `readAt`, `createdAt` |
| Unread badge | `GET /notifications/unread-count` → `{ unread, byCategory }` | all | **Polling only**: the backend has no push |
| Read state | `PATCH /notifications/:id/read`, `PATCH /notifications/:id/unread`, `POST /notifications/read` (≤ 100 ids), `POST /notifications/read-all` | all | Another user's id is a silent no-op |
| E-mail preferences | `GET/PUT /me/notification-preferences` | all | Per category; `ACCOUNT` is locked on. E-mail is DRY_RUN locally |
| Per-type switches | `GET/PATCH /me/notification-settings`, `POST …/reset` | mentor, admin | In-app and e-mail switch per type; `emailAvailable: false` means in-app only. Students have no per-type switches (backend design) |
| Threads | `GET /threads/:id`, `GET/POST /threads/:id/comments` (`parentId` for replies, one level), `GET /comments/:id/replies`, `PATCH/DELETE /comments/:id`, `POST /comments/:id/reactions`, `POST /comments/:id/report`, `POST /threads/:id/report` | all | Access = the caller can view the thread's course × division or assignment. Hidden or deleted threads and comments → 404 for non-admins. Students see other students as "first name + initial" |
| Course / assignment threads | `GET/POST /courses/:courseId/threads` (mentors and admins pass `divisionId`), `GET/POST /assignments/:assignmentId/threads` | all | `DISCUSSIONS_DISABLED` (409) when the course has discussions turned off |
| Profile | `GET /me`, `PATCH /me` | all | **Editable fields: `firstName` (1–100), `lastName` (1–100), `homeLocation` (2–200).** Username, e-mail, role, division, grade, school and avatar are not editable through `/me` |
| Password | `PATCH /auth/password` (`currentPassword`, `newPassword`) | all | Wrong current password → 400 `WRONG_PASSWORD`. On success the backend **revokes every refresh token**, including the current one, so the user must sign in again |
| Sign out everywhere | `POST /auth/logout-all` | all | Already wired in the session provider |
| Support | `GET /support` → `platformName`, `email`, `phone`, `hours`, `helpUrl`, `message` | public | **Read-only.** There is **no support-request or ticket endpoint**. Locally, every field except `platformName` is empty |

Notification `link` values written by the backend (`notification.listener.ts`):

| Event | Recipient | `link` | `data` |
|---|---|---|---|
| assignment.submitted_for_review | admins | `/admin/assignments/:id` | assignmentId |
| assignment.published | students | `/assignments/:id` | assignmentId, courseId |
| assignment.published / .rejected | the mentor who prepared it | `/mentor/assignments/:id` | assignmentId |
| submission.received, resubmission requested / withdrawn | student | `/assignments/:assignmentId` | submissionId, assignmentId |
| submissions.assigned | mentor | `/mentor/reviews?assignmentId=:id` | assignmentId |
| review.returned | admins | `/admin/submissions/:id` | submissionId, assignmentId |
| review.rejected, result.reopened | mentor | `/mentor/reviews/:submissionId` | submissionId |
| results.published | student | `/results/:submissionId` | submissionId, assignmentId |
| resource.published | students | `/courses/:courseId/resources/:resourceId` | resourceId, courseId |
| discussion.thread_created, discussion.comment_posted | mentors / authors | `/discussions/:threadId` | threadId (+ commentId, courseId or assignmentId) |
| moderation.content_reported | admins | `/admin/moderation/reports/:id` | reportId |
| moderation.content_moderated | the author | none | action, threadId and/or commentId (the thread is opened when it is still visible) |
| moderation.reports_resolved | the reporters | none | — (not clickable) |

The same `link` is appended to `APP_URL` in e-mails, so **the role-neutral paths must exist as real frontend routes** (owner decision Q5: redirect routes per role).

## 2. Implementation steps

Each step is committed after its checks pass.

| Step | Scope | Frontend pages and components | Endpoints | Expected functionality |
|---|---|---|---|---|
| **6.0** | Phase 5 documentation finalization and this plan | `INTEGRATION_PROGRESS.md`, `PHASE5_ADMIN_PLAN.md`, `PHASE6_PLAN.md` | — | Implementation and verification statuses kept separate |
| **6.1** | Foundation | `lib/api/community.ts` (notifications, preferences, settings), `lib/api/auth.ts` (`meApi.update`), `lib/queries/community.ts`, `lib/queries/account.ts`, `lib/query/keys.ts`, `lib/notifications/links.ts` (one resolver: notification → in-app route for the signed-in role) | all of §1 | One place that turns a backend `link` or `data` into a role-correct route |
| **6.2** | Deep-link redirect routes | `app/assignments/[id]`, `app/results/[submissionId]`, `app/courses/[courseId]/resources/[resourceId]`, `app/discussions/[threadId]` (one shared client redirect component) | `GET /me/results/:id` (to find a result's assignment) | Signed out → `/login?next=…` (then back). Signed in → the role's own page. A link that does not fit the role → the role's notification inbox with a message, never another portal |
| **6.3** | Notification bell and inbox | `app/components/notifications/NotificationBell.tsx` (in all 3 navbars), `NotificationList`, `app/{student,mentor,admin}/notifications/page.tsx` | unread-count (polled every 60 s while the tab is visible), list, read, unread, read-all | Badge with the unread count; dropdown with the latest items; inbox with All/Unread and category filters, paging, mark read/unread, mark all read. Clicking an item marks it read and opens its destination. Dashboard notification widgets become clickable |
| **6.4** | Discussions | `app/{student,mentor,admin}/discussions/[threadId]/page.tsx` (one shared `ThreadPage`), `DiscussionPanel` (exports its thread view; adds "Report topic"), a **Discussion** tab on the mentor course workspace, a "View discussion" link on the admin report detail, `?resource=` support on the student course page | threads, comments, replies, reactions, reports | Thread page with context link, comments, one level of replies, reactions, edit and delete of own comments, report. Locked thread → read-only. 404 → "not available" without leaking anything |
| **6.5** | Profile and personal settings | `app/{student,mentor,admin}/profile/page.tsx` (one shared `ProfilePage`), sidebar **Settings** (student, mentor) and the navbar user block (all roles) link to it. The admin sidebar **Settings** stays the platform settings page, which links to "My profile" | `/me`, `PATCH /me`, `PATCH /auth/password`, `/auth/logout-all`, notification preferences and settings | Profile view; edit first name, last name and home location only; change password (then sign in again); sign out everywhere; e-mail preferences per category; per-type switches for mentors and admins |
| **6.6** | Help and support | `app/(auth)/support/page.tsx` (public, same card layout as sign-in); sidebar **Help** links to it in all roles; link from the sign-in page | `GET /support` | Shows the configured contact details. When nothing is configured, says so (and admins get a link to the platform settings). **No support form**: the backend has no endpoint for one |
| **6.7** | Final regression and documentation | `INTEGRATION_PROGRESS.md` Phase 6 section | — | Tests, limitations and outstanding items recorded |

## 3. Testing approach

All against the running, unchanged backend, through the `:3001` proxy. Browser tests use headless Edge over the DevTools protocol, as in phases 3–5, paced for the rate limits.

**Read-only (run without approval):**
- API: every phase 6 read route for student, mentor and senior mentor; a student gets 403 on the mentor/admin notification settings; another user's thread or comment → 404; a Senior student on a Junior thread → 404; unknown notification id → 404.
- Browser: bell count equals `unread-count`; dropdown and inbox rows equal `GET /notifications`; filters send the right query; every item's `href` resolves to an existing role page; each redirect route for each role (signed out, wrong role, right role); the thread deep link `/discussions/:threadId` for the mentor (real notification) and the out-of-scope mentor and student (not available); profile values equal `/me`; profile and password forms refuse invalid input **without sending a request**; `/support` shows `GET /support`; Help and Settings links in all sidebars; 390 px layouts; no console errors, no 5xx.
- Regression: the read-only parts of the student, mentor and admin non-admin suites; `tsc`, ESLint, `next build`.

**Data-changing (prepared, run only with the owner's approval):** superseded by `VERIFICATION_PLAN.md` §2 (D2's replier changed to admin, required/optional split).

| Test | What it changes | Reversible? |
|---|---|---|
| Mark one notification read, then unread; mark all read | `readAt` on the tester's own notifications | Mostly: unread restores `readAt = null`; "mark all read" can only be undone item by item |
| Post a `[TEST]` comment and a reply on an existing thread, react, edit, delete | New comment rows (soft-deleted afterwards), reactions, and **notifications to the thread author** | Soft-deleted rows remain in the database |
| Report a comment or topic | A content report that admins see in moderation | Needs an admin to dismiss |
| Edit the profile (for example home location), then restore it | `firstName` / `lastName` / `homeLocation` on a demo account | Yes (restored to the original value) |
| Change a password, then change it back | Password hash; **every session of that account is signed out**; audit entries | Yes, if changed back |
| Change e-mail preferences or per-type switches, then reset | Preference and setting rows | Yes (`reset` for settings; PUT back for preferences) |

## 4. Dependencies and blockers

| Item | Effect | Owner action |
|---|---|---|
| Admin credentials | Admin bell, inbox, thread page, profile and settings cannot be verified signed in as admin | Provide credentials (as for phase 5) |
| Approval for the data-changing tests in §3 | Mark-read, posting, reporting, profile edit, password change and preferences are implemented and validated client-side but not executed | Approve the tests, all or some |
| E-mail is DRY_RUN locally | E-mail preferences save, but no e-mail is delivered | None needed for phase 6 |
| No support-ticket endpoint | `/support` shows contact details only | Decide whether a support form is ever needed (backend work) |
| Support contact details are empty locally | `/support` shows the "not configured" state | An admin can fill them in under platform settings (`support.*`) |
| No push / websocket | Unread count is polled every 60 s | None |
| No avatar upload, no username/e-mail change through `/me` | Those profile fields are read-only | None (backend design) |

## 5. Explicitly not done (owner decisions and backend limits)

- No live sessions, study groups, direct messaging or mentor student lists.
- No support submission form and no placeholder support backend.
- No thread rename or delete UI (the backend allows authors to do this; the original design has no control for it). Can be added on request.
- No admin thread moderation on the thread page: moderation stays on `/admin/moderation` (phase 5).

## 6. Implementation status (2026-11-06)

All steps 6.0–6.7 are implemented, one commit each (see `INTEGRATION_PROGRESS.md` → Phase 6). Read-only verification is done for students and mentors. Data-changing checks wait for the owner's approval, and admin checks wait for credentials.

Deviations from this plan:

| Plan item | What was done | Why |
|---|---|---|
| A link that does not fit the role → the role's inbox with a message | A "This link isn't available" card, with links to the dashboard and the notifications | Clearer than landing on the inbox with nothing selected; still never another portal |
| Bell placement | Visible on phones too (the original hid it below 640 px) | Otherwise phones have no way to reach notifications |
| Mentor discussions | Also on published assignments, not only the course workspace | Assignment discussion notifications need a place to land; drafts have none |
| Sign-out | Fixed a double redirect found by the 6.5 suite (`3736d06`) | Two simultaneous navigations; Next logged an aborted fetch |
| Consolidation | `PortalNavbar`, `SidebarUtilities`, shared `PageFrame` / `FilterPills`, `PublicCard` | Owner rule: consolidate duplicates (three identical navbars and sidebar footers) |
