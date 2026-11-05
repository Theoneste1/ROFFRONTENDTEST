# ROF LMS — Integration Progress

Last updated: 2026-11-05

## Phase status

| # | Phase (owner's order) | Status |
|---|---|---|
| — | Audit (frontend, backend, mapping, gaps, roadmap) | ✅ Done |
| 1 | Foundation and API integration | ✅ Done, tested against the running backend |
| 2 | Authentication and application shell | ✅ Done (Help/Settings links and the notification bell come in phase 6) |
| 3 | Student portal | ✅ Done, tested against the running backend (one flow pending admin; see Phase 3) |
| 4 | Mentor portal | ✅ Approved by the owner. Final mentor suite 57/57; grading end to end **pending manual verification** (needs admin) |
| 5 | Admin portal | 🔄 In progress (plan approved 2026-11-05; see Phase 5). Admin-authenticated tests wait for credentials |
| 6 | Notifications, discussions, other supported modules | ⏸ |
| 7 | Testing and final QA | ⏸ (continuous) |

## Owner decisions (2026-11-05)

| Topic | Decision | Where applied |
|---|---|---|
| Design reference | Existing frontend is the design reference; the backend API Guide is the backend reference | All phases |
| Live sessions | **Remove completely** | Phases 3 and 4 (student and mentor) |
| Mentor student lists, messaging | **Hide** until backend support exists | Phase 4 |
| Assignment rubric, assignment type | **Hide** | Phase 4 |
| Division "accepting new students" | **Hide** | Phase 5 |
| Badges, streaks | **Hide** (no backend support) | Phases 3 and 4 |
| Study groups | Stay disabled | Phase 3 (leaderboard toggle) |
| Duplicates | Consolidate after choosing the best copy; keep useful parts | Phase 4 |
| Setup | npm install, baseline commit, port 3001, `/api` proxy | ✅ Phase 1 |
| Backend `APP_URL` | The owner changes it (see below) | Owner action |
| Notification links | Redirect routes per role | Phase 6 |
| Root page | Login; signed-in users go to their portal | ✅ Phase 2 |
| Data fetching | TanStack Query | ✅ Phase 1 |

## ⚠ Owner action required: backend `APP_URL`

In `ROFBACKENDTEST/.env`, change:

```
APP_URL=http://localhost:5173   →   APP_URL=http://localhost:3001
```

This makes the e-mailed activation and password-reset links open this frontend (`/activate?token=…`, `/reset-password?token=…`). Restart the backend after changing it. `CORS_ORIGINS` can stay as it is: with the proxy, the browser never calls the API origin directly.

---

## Phase 1: Foundation and API integration

### What was implemented

- **Setup**
  - `.gitignore` reviewed: `.env*` was already excluded, and `!.env.example` was added so the example can be committed.
  - Baseline commit `3e1c5a1` of the untouched app, and `cd4ad77` for the audit documents.
  - Dependencies installed. `npm ci` failed because the lockfile was out of sync on optional `@emnapi/*` packages, so `npm install` refreshed the lockfile.
  - Added `@tanstack/react-query@^5`.
  - `dev` and `start` now run on port 3001; added a `typecheck` script.
- **Proxy:** `next.config.ts` rewrites `/api/:path*` to `API_PROXY_TARGET` (default `http://localhost:3000`).
- **API client** (`lib/api/client.ts`):
  - In-memory access token, `credentials: 'include'`, and one refresh-and-retry on 401.
  - **Single-flight refresh, serialised across tabs with Web Locks.** This matters because the backend rotates refresh tokens and revokes the whole session on reuse.
  - Session-expired listeners.
  - Query-string builder.
  - JSON and FormData bodies.
  - Network errors become `ApiError(0, NETWORK_ERROR)`.
  - Authenticated blob download with `Content-Disposition` file names (`apiBlob`, `saveFile`, `openFile`).
- **Errors** (`lib/api/errors.ts`): `ApiError` carries `status`, `code`, `details` and `requestId`. `fieldErrors()` maps `VALIDATION_FAILED` details onto form fields; `errorMessage()` produces user-facing text.
- **Types** (`lib/api/types.ts`): roles, permissions, `Page<T>`, the error body, `CurrentUser`, the auth responses, and `SupportInfo`.
- **TanStack Query:** `lib/query/client.ts` sets defaults (no retry on 4xx except 408/429, 30 s stale time), and `lib/query/keys.ts` is the query-key registry.
- **Shared UI** (`app/components/ui/`): `Spinner`, `FullPageLoader`, `LoadingBlock`, `ErrorState` (shows `requestId`), `EmptyState`, `Alert`, `TextField`, `PasswordField`, and `Button` (loading/disabled). They use the existing colours (`#2B2BB2`, `#e2e8f0`, slate inputs).

### Endpoints integrated

`POST /auth/refresh`, `GET /me`, `GET /me/permissions`

### Tests

| Check | Result |
|---|---|
| `tsc --noEmit` | ✅ Pass |
| `next build` | ✅ Pass (37 routes) |
| `eslint` | ✅ No new problems. The 17 baseline problems (6 errors, 11 warnings) are all in untouched pages and are fixed as each page is integrated |
| Proxy plus cookie through port 3001 (curl) | ✅ Cookie `rof_refresh`, path `/api/v1/auth`, HttpOnly. Refresh rotates; logout revokes |

---

## Phase 2: Authentication and application shell

### What was implemented

- **Session provider** (`lib/auth/session.tsx`):
  - Silent refresh on load.
  - `user` and `permissions` come from TanStack Query.
  - `login`, `logout`, `logoutEverywhere`, `can(permission)` and `retry`.
  - Signing out in one tab signs out the others (BroadcastChannel).
- **Role routing** (`lib/auth/roles.ts`): each role has one portal. The `next=` redirect is accepted only for internal paths inside the user's own portal.
- **`RoleGate`** (`app/components/auth/RoleGate.tsx`) wraps `app/admin/layout.tsx`, `app/mentor/layout.tsx` and `app/student/layout.tsx`:
  - Signed out → `/login?next=…`.
  - Wrong role → the user's own portal.
  - Error → retry card.
- **Public pages** (`app/(auth)/`, shared branded layout):
  - **`/login`:** username or e-mail; the "Invalid username or password" message plus a "Forgot your password?" hint after repeated failures (the guide's lockout advice); an `ACCOUNT_NOT_ACTIVATED` message with a link to resend; duplicate-submit guard.
  - **`/forgot-password`:** neutral confirmation (no account enumeration).
  - **`/reset-password?token=`:** password policy checked client-side (8–100 characters, a letter and a number, the same as the backend); confirm field; `INVALID_RESET_TOKEN` handled; tells the user every session was ended.
  - **`/activate?token=`:**
    - Inspects the link, then shows the username and masked e-mail.
    - Asks for a password only when `requiresPassword` is true.
    - Needs an explicit click, so mail-client link scanners can't use up the one-time link.
    - An invalid or missing token shows the resend-activation form.
- **Root `/`:** replaces the "Choose your portal" page. It redirects to the user's portal, or to `/login`.
- **Root layout:** page `metadata` (title template "… · ROF LMS") and the providers.
- **Shell, in all three portals:**
  - Navbars show the signed-in user's real name and e-mail, through `app/components/shell/NavbarUser.tsx`. This replaces "Admin User", "Mentor Name" and "Hope Zawadi"; the original avatar colours are kept.
  - Sidebar **Sign Out** now works, through `app/components/shell/SignOutButton.tsx`.
  - The rest of the shell markup is unchanged.

### Endpoints integrated

`POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all` (session API; UI arrives with the settings page in phase 6), `/auth/forgot-password`, `/auth/reset-password`, `/auth/activation/inspect`, `/auth/activate`, `/auth/resend-activation`, `PATCH /auth/password` (API only; UI in phase 6), `GET /me`, `GET /me/permissions`, `GET /support` (API only; UI in phase 6)

### Tests run against the real backend

Backend: the existing `node dist/main.js` with its local `prisma dev` database `rof`, unchanged. Browser: headless Edge driven over the DevTools protocol (script kept outside the repo).

| Scenario | Result |
|---|---|
| Signed-out visit to a portal → `/login?next=…` | ✅ |
| Wrong password → "Invalid username or password", stays on login | ✅ |
| Student login → back to the requested page, real name in navbar | ✅ |
| Reload → session restored from the refresh cookie | ✅ |
| Student opening `/admin/dashboard` → sent to the student portal | ✅ |
| `/` and `/login` while signed in → own portal | ✅ |
| Sign Out → `/login`; portal requires login again (cookie revoked) | ✅ |
| Mentor login honours `?next=/mentor/assignments` | ✅ |
| `next=` outside the user's portal ignored | ✅ |
| **3 tabs restoring the session at the same moment** → all signed in, session not revoked | ✅ |
| Sign out in one tab → other tabs go to `/login` | ✅ |
| Invalid activation link → "Link not valid" plus resend form | ✅ |
| Reset page without a token or with an unknown token → "Link not valid" | ✅ |
| Reset form enforces the password policy before sending | ✅ |
| Forgot password → neutral confirmation | ✅ |
| No uncaught exceptions or console errors | ✅ |
| Logins for `student.s2`, `student.s5`, `mentor.junior`, `mentor.senior` | ✅ |

### Not yet tested (outstanding)

- **Admin login.** The seeded admin password in this database is not `Admin12345`; the seed generates it unless `SEED_ADMIN_PASSWORD` is set. I stopped after one attempt to avoid the 5-attempt lockout. **The owner needs to provide admin credentials before phase 5.**
- **Successful activation and password reset with a real e-mailed token.** The backend runs with SMTP in DRY_RUN mode, so no mail is delivered. The failure paths are tested. The success paths need a real token, either from Mailpit (Docker stack) or from an invited test account.
- **Access token expiring mid-session (15 min) → transparent refresh-and-retry.** The logic exists and the refresh call itself is tested; a long-running browser check is still to do.

### Issues and notes

- After Sign Out the URL is `/login?next=<previous page>`, because the portal guard redirects before the button's own navigation. This is harmless (the next sign-in of the same role returns there) and can be left.
- Help and Settings buttons in the sidebars are still placeholders. They are wired in phase 6 (profile, password, notification preferences, `/support`).
- The notification bell is still static; it is wired in phase 6.

### Files changed (phases 1–2)

New:
- `lib/api/{client,errors,types,auth}.ts`
- `lib/query/{client,keys}.ts`
- `lib/auth/{session.tsx,roles.ts}`
- `app/providers.tsx`
- `app/components/ui/{feedback,form}.tsx`
- `app/components/auth/{RoleGate,NewPasswordFields}.tsx`
- `app/components/shell/{NavbarUser,SignOutButton}.tsx`
- `app/(auth)/layout.tsx`
- `app/(auth)/login/{page,LoginForm}.tsx`
- `app/(auth)/forgot-password/{page,ForgotPasswordForm}.tsx`
- `app/(auth)/reset-password/{page,ResetPasswordForm}.tsx`
- `app/(auth)/activate/{page,ActivateAccount}.tsx`
- `.env.example`

Modified:
- `next.config.ts`, `package.json`, `package-lock.json`, `.gitignore`, `README.md`
- `app/layout.tsx`, `app/page.tsx`
- `app/{admin,mentor,student}/layout.tsx`
- `app/{admin,mentor,student}/dashboard/components/{Navbar,Sidebar}.tsx`

---

## Phase 3: Student portal

### What was implemented

Every student page now reads and writes real backend data, keeps its existing layout and colours, and has loading, error, empty and success states. All mock arrays in `app/student/` are gone.

| Page | What it does now |
|---|---|
| **Dashboard** `/student/dashboard` | <ul><li>Greeting, points and problems solved come from `/me`.</li><li>The 4 course cards use `/courses` and `/me/courses`, with the course's progress label.</li><li>"Current Assignments" lists open, not-yet-reviewed assignments with deadline chips.</li><li>The ranking card shows **division** rank "#r of N" and the points needed to pass the student above.</li><li>The calendar is now a working month view: prev/next work, deadline dots, red for due within 3 days.</li><li>"Recent Alerts" shows the latest notifications.</li><li>The motivational quote is kept as static copy; the badge/streak alert was removed.</li></ul> |
| **Courses** `/student/courses` | <ul><li>The 4 fixed courses with backend descriptions, counts and progress.</li><li>Shows the student's division (Junior S1–S3 / Senior S4–S6).</li><li>Links use the course UUID.</li></ul> |
| **Course detail** `/student/courses/[id]` | <ul><li>Tabs: Overview, Books (BOOK/EBOOK), Past Papers (PAST_PAPER), **Notes & Materials** (NOTE/ATTACHMENT, new so every backend resource type is reachable) and **Discussion** (new).</li><li>Resource files open or download through authenticated fetch.</li><li>"Mark course as completed" calls `POST /courses/:id/complete`.</li><li>"Ask a question" opens the course discussion.</li><li>Unknown or out-of-scope id → "Course not found".</li></ul> |
| **Assignments** `/student/assignments` | <ul><li>Backend `displayStatus` badges.</li><li>Search (`q`, debounced; Ctrl/⌘+K focuses it), course filter and pagination run on the server.</li><li>Status filter and sort apply to the loaded page (no backend support for them).</li><li>Empty state, and "no matches" for filters.</li></ul> |
| **Assignment detail** `/student/assignments/[id]` | <ul><li>Shows instructions, course, division, marks and points, resubmission and late rules, and brief files.</li><li>**Submission panel:** typed answer and/or up to 10 files (20 MB each, checked before sending), drag and drop, optional note, the existing confirm and success modals, duplicate-submit guard, backend error codes shown. It is offered only when `canSubmit`; resubmission requests show the mentor's note and due date.</li><li>**Submission history:** every attempt with its files and the request log.</li><li>**Results tab:** only after publication. Shows score, percentage, points awarded, mentor feedback and files, earlier versions, and a link to the discussion (no replies, per the backend).</li><li>**Discussion tab:** topics, comments, replies, LIKE/HELPFUL/CONFUSED reactions, edit or delete own comments, report.</li></ul> |
| **Results** `/student/assignments/results` | <ul><li>Published results with a course filter applied by "Apply", arrange by date, score or name, and pagination.</li><li>Rows open the assignment's Results tab.</li></ul> |
| **Leaderboard** `/student/leaderboard` | <ul><li>Students / Schools toggle for the student's division.</li><li>Podium, your rank, total points and next milestone, ranking list with Prev/Next.</li></ul> |
| **Shell** | <ul><li>"Live Sessions" removed.</li><li>The dashboard link label is now "Dashboard".</li><li>The sidebar starts collapsed on phones.</li></ul> |

### Consolidated or removed (owner decisions)

| Removed | Why |
|---|---|
| `app/student/live-sessions/page.tsx` and its sidebar link | Live sessions were removed from the backend (owner decision 2026-11-05) |
| `app/student/assignments/[id]/components/StepCheckbox.tsx` plus the "Steps", "Deliverables" and "Evaluation Criteria" sections | No backend support (`INTEGRATION_MAPPING.md` §5, B8) |
| `app/student/courses/[course]/components/CourseTabs.tsx` | It was already unused (dead code). The tabs are in `CourseDetail.tsx` |
| Course "Learning Circle", "Recommendation", "Avg. completion time", mentor office hours card | No backend support (B7). Replaced by real fields: division, discipline, progress, counts, discussion status |
| Leaderboard "Study Group" toggle, podium badge titles ("THE G.O.A.T"…) | Study groups disabled (B12); badges hidden (B13) |
| Results page "Filters" and "Sort By" buttons | They duplicated the Course and Arrange-by controls next to them |

### Fix found during testing (affects the phase 2 pages)

While the dev server was slow, a click on **Reset password** before React had hydrated made the browser do a native GET submit, which **put the password in the URL**. The fix has two parts:
- The shared `Button` stays disabled until hydration (`lib/hooks/useHydrated.ts`).
- All public account forms use `method="post"`.

A regression check now asserts that no password or e-mail ever appears in a URL.

### Endpoints integrated

- **Courses:** `GET /courses`, `GET /courses/:id`, `GET /me/courses`, `POST /courses/:id/complete`.
- **Resources:** `GET /courses/:courseId/resources`, `GET /courses/:courseId/resources/:resourceId/attachments/:attachmentId/file`.
- **Assignments:** `GET /me/assignments` (`q`, `courseId`, `page`, `limit`), `GET /assignments/:id`, `GET /assignments/:id/attachments/:attachmentId/file`.
- **Submissions:** `POST /submissions` (multipart `assignmentId`, `answerText`, `note`, `files`), `GET /submissions/:id`, `GET /submissions/:id/history`, `GET /submissions/:id/attachments/:attachmentId/file`.
- **Results:** `GET /me/results` (`courseId`, `page`, `limit`), `GET /me/results/:submissionId`, `GET /me/results/:submissionId/feedback-files/:attachmentId`.
- **Leaderboard:** `GET /leaderboard`, `GET /leaderboard/me`, `GET /leaderboard/schools`.
- **Notifications:** `GET /notifications`.
- **Discussions:** `GET`/`POST /courses/:courseId/threads`, `GET`/`POST /assignments/:assignmentId/threads`, `GET`/`POST /threads/:id/comments`, `GET /comments/:id/replies`, `PATCH`/`DELETE /comments/:id`, `POST /comments/:id/reactions`, `POST /comments/:id/report`.

### Tests run against the real backend (2026-11-05)

Backend: the unchanged `node dist/main.js` on the local `rof` database. Accounts: `student.s2` (Junior) and `student.s5` (Senior). Browser: headless Edge over the DevTools protocol (test scripts kept outside the repo).

| # | Owner's requirement | Result | Evidence |
|---|---|---|---|
| 1 | Dashboard loads the correct information | ✅ | Real name, 30 points and 1 problem solved (`/me`); 4 courses; division rank "#1 of 1"; the real notification "New Algebra material"; no mock strings |
| 2 | Courses display for the student's division | ✅ | 4 courses; "Junior division · S1–S3"; counts from the API (Algebra: 1 resource, 1 assignment) |
| 3 | Resources can be accessed | ✅ | The published `[TEST]` book appears under Books; file download → **200** via authenticated fetch; Past Papers empty state; unknown course → "Course not found" |
| 4 | Available assignments are displayed | ✅ | "Sample set" with backend status "Reviewed"; search sends `q=` (200) and shows "No assignments match"; status filter works both ways |
| 5 | Students can submit assignments | ⚠ **Partly tested** | The multipart request is accepted by the backend's validation, and the backend answered **409 `ASSIGNMENT_CLOSED`** for the closed assignment (shown to the user). The UI correctly hides the form when `canSubmit` is false. **A successful submission still needs an open published assignment, and only an admin can publish one.** This will be re-tested once admin credentials are available |
| 6 | Submission status displayed correctly | ✅ | `displayStatus` badge and "Your Submission" card (submitted time, attempts); form hidden for a closed assignment |
| 7 | Submission history and revisions | ✅ | "Attempt 1" with `work.pdf` (download 200) |
| 8 | Released results displayed correctly | ✅ | 15/20, 75%, +30 points, feedback "Good work" by Jean Mentor, `feedback.pdf`; results list row opens the Results tab |
| 9 | Leaderboard reflects the backend | ✅ | "Eric S." #1 with 30 points (Junior); Schools tab "Demo Secondary School"; `student.s5` sees only Senior ("Grace S.") |
| 10 | No access to another student's information | ✅ | As `student.s5`, the API answered **404** for s2's submission, history, result, submitted file, feedback file, the Junior assignment and the Junior resource, and **403** for admin routes. In the UI, s5 opening the Junior assignment sees "Assignment not found", and the Junior resource and s2's result are not shown |
| — | Discussions | ✅ | Post a comment, LIKE toggles, reply, delete own reply and comment |
| — | Live sessions removed | ✅ | No sidebar link; `/student/live-sessions` → 404 |
| — | Phone width (390 px) | ✅ | All 9 student views: no horizontal page scroll; content area 310 px |
| — | Errors | ✅ | No 5xx responses; no app console errors |
| — | Auth regression (phases 1–2) | ✅ 19/19 | Includes the new "no password in URL" check |
| — | `tsc` / `next build` | ✅ | — |
| — | `eslint` | ✅ for the student portal | The 8 baseline problems in student pages are fixed. 9 remain, all in untouched mentor pages |

Browser suite totals: student **51/51**, auth **19/19**.

### Test data and remaining issues

See **Phase 3 review** below for the verified inventory of test records and the current list of remaining issues. It supersedes what was written here at the end of phase 3.

### Files

New:
- `lib/api/{learning,assessment,community}.ts`
- `lib/queries/{learning,assessment,community}.ts`
- `lib/format.ts`
- `lib/hooks/{useNow,useHydrated}.ts`
- `app/components/ui/{FileButton,Pagination}.tsx`
- `app/components/discussions/DiscussionPanel.tsx`
- `app/student/components/studentUi.tsx`
- `app/student/dashboard/components/DeadlineCalendar.tsx`
- `app/student/courses/[course]/CourseDetail.tsx`
- `app/student/assignments/[id]/AssignmentDetail.tsx`
- `app/student/assignments/[id]/components/{SubmissionHistoryCard,ResultPanel}.tsx`

Modified:
- `lib/api/types.ts`, `lib/query/keys.ts`
- `app/layout.tsx` (`suppressHydrationWarning` on `<html>`, for attributes the browser injects)
- `app/components/ui/form.tsx`, the 4 `app/(auth)` forms (`method="post"`)
- `app/student/components/StudentShell.tsx`, `app/student/dashboard/{page.tsx,components/Sidebar.tsx}`
- `app/student/courses/{page.tsx,[course]/page.tsx}`
- `app/student/assignments/{page.tsx,components/*,[id]/page.tsx,[id]/components/SubmissionPanel.tsx,results/page.tsx}`
- `app/student/leaderboard/{page.tsx,components/*}`

Deleted:
- `app/student/live-sessions/page.tsx`
- `app/student/assignments/[id]/components/StepCheckbox.tsx`
- `app/student/courses/[course]/components/CourseTabs.tsx`

---

## Phase 3 review (2026-11-05): student portal verification

This review re-checked the student portal against the running backend and the local `rof` database. No mentor-portal work was started.

**No application code changed during the review.** The only changes are this documentation and two new labelled test records (see "Test data").

### Status at a glance

| Category | Items |
|---|---|
| ✅ **Implemented and tested** | <ul><li>Dashboard, courses, course detail (resources, completion, discussion), assignments list, assignment detail (brief, status, history, result, discussion), results list, leaderboard (students and schools).</li><li>Sign-in and session handling: refresh, expiry, revocation, rate limit.</li><li>Role and data isolation.</li><li>Phone layout.</li></ul> |
| ⚠ **Implemented but not fully tested** | <ul><li>**Submitting and resubmitting work.** The UI, multipart request, client-side checks and the closed-assignment error are verified. A *successful* submission has not been made, because it needs an open assignment published by an admin.</li><li>**Resubmission-requested state.** The UI is built (mentor note and due date, resubmit form), but it needs a mentor request (phase 4).</li></ul> |
| ⏳ **Waiting for manual verification** | <ul><li>Full submit → resubmit flow with a real published assignment (owner arranging admin credentials).</li><li>Activation and password-reset *success* paths with a real e-mailed token: the backend runs with SMTP in DRY_RUN, so no mail is delivered.</li></ul> |
| ❌ **Not implemented (planned)** | <ul><li>Clickable notification items and deep-link routes (phase 6).</li><li>Help and Settings sidebar buttons (phase 6).</li><li>Notification inbox page (phase 6).</li></ul> |
| 🚫 **Intentionally excluded (owner decisions / no backend support)** | <ul><li>Live sessions.</li><li>Study-group leaderboard.</li><li>Badges and streaks.</li><li>Assignment steps, deliverables and evaluation criteria.</li><li>Mentor office hours.</li><li>Server-side sort and status filter (the API has none).</li></ul> |

### How each page gets and shows its data

All requests go through `lib/api/client.ts` (`/api/v1/*`, proxied to the backend), via the TanStack Query hooks in `lib/queries/*`. Responses are cached under the keys in `lib/query/keys.ts`. Every page shows a spinner while loading, an error card with "Try again" and the backend `requestId` on failure, and an explicit empty state.

| Page | Requests | What is shown | Mutations and invalidation |
|---|---|---|---|
| `/student/dashboard` | <ul><li>`GET /me` (session)</li><li>`GET /courses`</li><li>`GET /me/courses`</li><li>`GET /me/assignments?limit=50`</li><li>`GET /leaderboard/me`</li><li>`GET /leaderboard?page&limit=100` (the row above the student, only when rank > 1)</li><li>`GET /notifications?limit=5`</li></ul> | <ul><li>Name, points, problems solved.</li><li>4 course cards with progress label.</li><li>Open, not-yet-reviewed assignments sorted by deadline (status `PUBLISHED`, `displayStatus` ≠ Reviewed).</li><li>"#rank of N" in the student's division, and the points needed to pass the student above.</li><li>Calendar with deadline dots.</li><li>Latest 5 notifications.</li></ul> | — |
| `/student/courses` | `GET /courses` | The 4 courses with description, `counts` (published content of the student's division), `displayStatus` | — |
| `/student/courses/[id]` | <ul><li>`GET /courses/:id`</li><li>`GET /courses/:id/resources` (split by `type` into Books, Past Papers, Notes & Materials)</li><li>`GET …/attachments/:aid/file` (on click)</li><li>`GET /courses/:id/threads`, `GET /threads/:id/comments`, `GET /comments/:id/replies`</li></ul> | <ul><li>Overview: division, discipline, progress, counts, discussion on/off.</li><li>Resource cards (title, author, year, source, description, tags, files).</li><li>Discussion.</li></ul> | <ul><li>`POST /courses/:id/complete` → invalidates `courses.*`.</li><li>Thread and comment mutations → invalidate `discussions.*`.</li></ul> |
| `/student/assignments` | `GET /me/assignments?q&courseId&page&limit=50` | Table: title, course and division, deadline (local time), `displayStatus` badge, Start/View link. Status filter and sort apply on the loaded page | — |
| `/student/assignments/[id]` | <ul><li>`GET /assignments/:id`</li><li>`GET /submissions/:id`</li><li>`GET /submissions/:id/history`</li><li>`GET /me/results/:submissionId` (only when `displayStatus` = Reviewed)</li><li>file endpoints for brief, submission and feedback files</li><li>assignment threads</li></ul> | <ul><li>Instructions, rules, files.</li><li>The submission form when `canSubmit`, otherwise a status card.</li><li>Every attempt with its files.</li><li>Score, percentage, points, feedback, mentor, files, earlier versions.</li></ul> | `POST /submissions` (multipart) → invalidates `assignments.*`, `submissions.*`, `notifications.*` |
| `/student/assignments/results` | `GET /me/results?courseId&page&limit=20` | Published results; rows link to the assignment's Results tab | — |
| `/student/leaderboard` | <ul><li>`GET /leaderboard?page&limit=20`</li><li>`GET /leaderboard/me`</li><li>`GET /leaderboard/schools?page&limit=20`</li></ul> | Podium (top 3), your rank, total points, next milestone, rankings; schools tab | — |

### Authentication and authorization (frontend side)

- **Session:**
  - The access token is kept in memory only.
  - The refresh token is the backend's httpOnly cookie `rof_refresh`, which the browser sends through the same-origin proxy.
  - On load, `POST /auth/refresh` restores the session.
  - On any 401, the client refreshes once and retries. If that fails, every tab returns to `/login?next=…`.
  - Refreshes are single-flight within a tab and serialised across tabs, because tokens rotate and a reused one revokes the session.
- **Portal guard:** `RoleGate` in `app/student/layout.tsx` renders the portal only for `role === "STUDENT"`. Signed-out users go to `/login`; other roles go to their own portal.
- **Hiding is not security.** Every rule is enforced again by the backend on every request. The student UI never calls mentor or admin endpoints; the review confirmed that a student who opens mentor or admin URLs triggers no such requests.

### How student-specific data access is enforced

| Layer | Mechanism | Verified by |
|---|---|---|
| **Backend (authoritative)** | Role guard (403) and scope or ownership checks (404 "not found or not yours") on every route. Students' division is taken from their account, not from query parameters | API suite (45/45): cross-student, cross-division, unpublished, unreleased, mentor and admin routes |
| **Frontend: which endpoints** | The student pages use only "me"-scoped or division-scoped endpoints (`/me/*`, `/courses`, `/leaderboard`) and ids the API itself returned | Code review; API log during the browser runs |
| **Frontend: how a 404 is shown** | Shown as "not found or not available to you", never revealing existence | Browser: DRAFT, other-division and unknown ids |
| **Frontend: privacy** | Other students appear as the API sends them: first name + last initial, no username, no e-mail | API and browser leaderboard checks |

### Loading, error, empty and success states

| State | Implementation |
|---|---|
| **Loading** | `LoadingBlock` or `Spinner` for every query. Lists keep previous data while refetching (dimmed) |
| **Error** | `ErrorState` with a readable message (`errorMessage`), the backend `requestId`, and Try again. Files show an inline error under the file button |
| **Not found** | Course and assignment "not found" cards with a back link |
| **Empty** | <ul><li>Dashboard: "You're all caught up" and "No notifications yet".</li><li>"No assignments yet" vs "No assignments match".</li><li>"No books / past papers / notes uploaded yet".</li><li>"No results yet".</li><li>"No rankings yet".</li><li>Discussion "No comments yet".</li></ul> |
| **Success** | <ul><li>Submission confirm and success modals (original design).</li><li>"Mark course as completed" updates in place.</li><li>The comment appears at once.</li><li>Report: "Thanks — an administrator will review this comment."</li></ul> |
| **Validation** | <ul><li>Client checks mirror the backend: file size and count, text lengths, password policy.</li><li>Backend `VALIDATION_FAILED` details map onto fields (`fieldErrors`) or show as the first message.</li><li>`409`/`413`/`415`/`429`/`5xx` have specific messages.</li></ul> |

### Verification results (this review)

| Suite | Result | Covers |
|---|---|---|
| API security and data access (`api-security.mjs`) | **45/45** | <ul><li>Own data and division.</li><li>Per-division, published-only counts.</li><li>DRAFT assignment and unpublished note → 404 and absent from lists.</li><li>Unreleased result → 404, no score in the in-review submission.</li><li>s5 → s2 submission, history, result, files → 404.</li><li>Other division's assignment and resource → 404.</li><li>Senior leaderboard and threads requested by a Junior → own division only.</li><li>16 mentor and admin routes → 403.</li><li>No token, tampered token, refresh without cookie → 401.</li></ul> |
| Student browser suite (`e2e-student.mjs`) | **51/51** | Requirements 1–10 from the phase 3 brief, discussions, live-session removal, no 5xx, no console errors |
| Review browser suite (`e2e-review.mjs`) | **22/22** | <ul><li>DRAFT and unpublished note not visible in the UI.</li><li>Published-only counts.</li><li>Student opening 4 mentor/admin URLs → own dashboard, with no mentor/admin API calls.</li><li>Dashboard numbers equal `/me` and `/leaderboard/me`.</li><li>**Revoked session** (sign out everywhere from another device) → 401, refresh 401 → `/login?next=…`.</li><li>**Rate limit:** 10 sign-ins accepted, the 11th shows "Too many requests…", normal sign-in works again after a minute.</li></ul> |
| Access-token expiry (`e2e-expiry-sim.mjs`) | **6/6** | <ul><li>The next protected request is answered with the backend's own 401 body, which is exactly what an expired 15-minute token returns. Then **one** real `POST /auth/refresh` → 200, the original request is retried → 200, the page renders, and the user stays signed in.</li><li>If the refresh is also rejected → `/login?next=…`, with a single refresh attempt and no loop.</li><li>A real 15-minute wait (`e2e-expiry.mjs`) was tried twice. The headless tab is reported as hidden and throttled, and the DevTools session stalled, so the run could not finish. That's a harness limitation, not an app result.</li><li>That the backend rejects an invalid or expired token is covered by the API suite (tampered token → 401).</li></ul> |
| Error handling with real backend errors (`validation-check.mts`) | **11/11** | `VALIDATION_FAILED` → field mapping and message; `ASSIGNMENT_CLOSED`; network, 429 and 5xx messages; `requestId` kept |
| Auth suite (`e2e-auth.mjs`, phase 2) | **19/19** (last run) | Includes "no password or e-mail ever in a URL" |
| Phone width 390 px | **9/9 pages** | No horizontal page scroll; content 310 px |
| `tsc --noEmit` | ✅ | |
| `next build` | ✅ | Production build compiles; the live-sessions route is gone |
| `eslint` | ✅ for student, auth, shared and lib code | 9 problems remain, all in mentor pages not yet touched (baseline) |
| Mock data scan | ✅ | No mock arrays or placeholder people in `app/student`, `app/components`, `app/(auth)`, `lib` |
| Link scan | ✅ | Every student link targets an existing route. The only dead links are in the unused legacy `app/components/Sidebar.tsx` (not rendered anywhere; candidate for removal in the cleanup phase) |
| Non-functional controls | ⚠ 2 known | Help and Settings in the student sidebar (phase 6) |
| Backend untouched | ✅ | `ROFBACKENDTEST` git working tree clean. The only change from this work is the runtime upload `storage/resources/2026/11/…pdf` (the test files). The `.env` `APP_URL=http://localhost:3001` change and the backend's recent deployment commits are the owner's |

The test scripts are kept outside the repository, in the session scratchpad, and can be added to the repo on request.

### Remaining issues (not completed)

1. **Submission workflow:** a successful submit and resubmit has not been verified end to end. The owner is arranging admin credentials to publish an assignment. The mentor-requested resubmission part will be tested after phase 4.
2. **Notifications:** notification items on the dashboard are displayed but not clickable or linked. Deep links and the inbox are planned for phase 6.
3. **Help and Settings:** these sidebar buttons are not implemented yet (phase 6).
4. **Sign-in rate limit:** the backend allows 10 sign-in attempts per minute per address. **Verified:** normal sign-in works, the 11th attempt shows "Too many requests. Please wait a moment and try again." and the user stays on the login page, and sign-in works again after a minute. This is backend behaviour, not a defect.
5. **Server-side limits:** the status filter and sort (Assignments) and arrange-by (Results) apply to the loaded page (up to 50 and 20 items), because the API has no such parameters (gaps B5, B6).
6. **Data observation, not a defect:** `student.s5` (Senior) has an in-review submission for the Junior assignment "Sample set". The backend hides that assignment from s5 (404), so this submission does not appear anywhere in s5's portal. It looks like seed or test history (for example, a student moved between divisions). **Owner decision: investigate during the admin-portal phase (phase 5)** using the admin submission and enrolment views. Do not change the record before then.

### Test data currently in the local database

These were created by the frontend tests through the real API, all labelled `[TEST]`. None have been deleted or modified since creation; they are still useful for phases 4–5.

| Record | Id | Created | Purpose and notes |
|---|---|---|---|
| Resource **"[TEST] Algebra practice book"**: Junior Algebra, BOOK, **published**, file `test-resource.pdf` | `538a6567-3e98-41d2-9e38-8d26763ce4f9` | 2026-11-05 16:24 UTC by `mentor.junior` | Verifies student resource listing and download. Its stored file is in `ROFBACKENDTEST/storage/resources/2026/11/` |
| Notification **"New Algebra material"** (`resource.published`) to `student.s2`, unread | `cc578281-7bb4-4695-a9e6-ea9b5702ed27` | 16:24 UTC, created by the backend when the book was published | Shown in the dashboard's Recent Alerts. Only Junior students (s2) received it |
| Resource **"[TEST] Unpublished note (not visible to students)"**: Junior Algebra, NOTE, **unpublished** | `90679339-20b4-4eab-98ba-d83e6eb8ac50` | 17:29 UTC by `mentor.junior` (this review) | Verifies unpublished resources are hidden. Useful for the phase 4 publish/unpublish UI |
| Assignment **"[TEST] Draft assignment (not visible to students)"**: Junior Algebra, **DRAFT**, deadline 2026-12-31, 10 points / 10 marks | `f0b37379-fb90-4515-85b2-b9bdb2a05830` | 17:29 UTC by `mentor.junior` (this review) | Verifies drafts are hidden. **It can be used for the outstanding submission test:** mentor submits it for approval (phase 4) → admin publishes → student submits |
| Discussion comments **"[TEST] comment …"** and their replies on "Questions about this assignment" | — | One comment and one reply per test run (about 7 runs) | The tests deleted each one. The backend soft-deletes them (status `DELETED`, content replaced with "[deleted]") and **excludes them from listings**: the thread now shows 0 comments to students. They can only be enumerated with an admin account. *(Correction: the end-of-phase-3 notes said they "remain as [deleted] placeholders"; they don't appear in the UI at all.)* |

No other data was changed. The existing seed records ("Sample set", its submissions and result, and the "General discussion" thread with its 2 comments) were only read.

### Git review

| Commit | Content |
|---|---|
| `71f049d` Fix: never submit auth forms natively before hydration | `useHydrated`, `Button` disabled until hydration, `method="post"` on the 4 public forms, `suppressHydrationWarning` on `<html>` |
| `8886a44` Student portal | The student pages (including the deletions of `live-sessions/page.tsx`, `StepCheckbox.tsx`, `CourseTabs.tsx`), shared discussion, file and pagination components, `lib/api/*`, `lib/queries/*`, `lib/format.ts`, `lib/hooks/useNow.ts`, types and query keys |
| `7a9d99e` Docs | `INTEGRATION_PROGRESS.md`, `INTEGRATION_MAPPING.md` |

**History regrouped (2026-11-05, owner-approved, not pushed).** The original commits `e76ca3b` / `d566848` / `1ab111f` had the three phase 3 deletions inside the security-fix commit. They were re-created as `71f049d` / `8886a44` / `7a9d99e`, reusing the original messages and authorship:
- Before regrouping, the old history was saved as branch `backup/before-regroup`.
- `git diff backup/before-regroup HEAD` is empty: the file tree is byte-identical, so no work was lost.
- The backup branch can be deleted once the owner is satisfied.

**Secrets check:**
- The full history was scanned for env files, keys, tokens, JWTs, database URLs and passwords. The only env file ever committed is `.env.example`, which contains `API_PROXY_TARGET=http://localhost:3000` only.
- `.env.local` is ignored.
- The only password strings in the repo are the public demo-seed password `Demo1234`, which the backend's own README and API guide already document.

---

## Phase 4: Mentor portal

### Status at a glance

| Category | Items |
|---|---|
| ✅ **Implemented and tested** | <ul><li>Dashboard.</li><li>Assignments: list, create/edit wizard, detail, submit for approval, recall.</li><li>Course analytics (Overview, Reports).</li><li>Resources: upload, edit, publish, unpublish, archive, restore, delete, download.</li><li>Review queue and review list, grading page (view, validation, files).</li><li>Mentor scope isolation; role routing; phone layout.</li></ul> |
| ⚠ **Implemented but not fully tested** | <ul><li>**Grading actions:** start review, save mark (score, feedback, files), send review to admin, request or withdraw resubmission.</li><li>The UI follows the backend pipeline. No submission was available to grade, because the only one assigned to a mentor is `student.s5`'s, reserved for the phase 5 investigation; it was viewed only.</li><li>These need an admin to publish an assignment and distribute student work.</li></ul> |
| ⏳ **Waiting for manual verification** | Full assignment → result flow once admin credentials exist: mentor submits → admin publishes → student submits → admin distributes → mentor grades → admin approves and publishes → student sees the result; plus resubmission requested by a mentor |
| 🚫 **Hidden / excluded (owner decisions)** | <ul><li>Mentor student list, student-list filter and messaging: moved to `app/mentor/_unsupported/` (not routable).</li><li>Assignment type, rubric, submission type, originality check.</li><li>Live sessions removed.</li></ul> |
| ❌ **Not implemented (planned)** | <ul><li>Help and Settings (phase 6).</li><li>Clickable notifications (phase 6).</li><li>Deleting an assignment (no backend route; B10).</li></ul> |

### Pages and how they use the backend

| Page | Requests | Notes |
|---|---|---|
| `/mentor/dashboard` | <ul><li>`GET /me/teaching`</li><li>`GET /analytics/courses/:id?divisionId` (each scope)</li><li>`GET /assignments`</li><li>`GET /mentor/reviews`</li><li>`GET /notifications`</li></ul> | Students in scope, active assignments (due this week, awaiting approval), reviews to do, average published score, recent activity, upcoming deadlines, quick links |
| `/mentor/assignments` | `GET /assignments?courseId&divisionId&status&q&page&limit`, `GET /mentor/reviews` (counts) | Tabs: All, Drafts (DRAFT + REJECTED), Pending Approval, Published, Closed (CLOSED + ARCHIVED). Grouped tabs filter the loaded page. Shows the admin's note on returned assignments |
| `/mentor/assignments/create`, `/[id]/edit` | <ul><li>`POST /assignments` (multipart with brief files)</li><li>`PATCH /assignments/:id` (JSON)</li><li>`POST`/`DELETE …/attachments`</li><li>`PATCH …/submit`</li></ul> | One 5-step wizard, then the original success screen. Validation mirrors the backend rules (title 3–200, instructions 10–10,000, future deadline, marks 1–10,000, points 0–10,000, resubmissions 0–50). Editing is offered only in DRAFT/REJECTED. Course and division are fixed after creation |
| `/mentor/assignments/[id]` | `GET /assignments/:id`, `…/history`, `GET /mentor/reviews?assignmentId`, analytics | Actions by state: Edit / Submit for approval (DRAFT/REJECTED), Recall (PENDING_APPROVAL), Review Submissions (PUBLISHED/CLOSED/ARCHIVED). Files, settings, history timeline |
| `/mentor/assignments/[id]/assignmentReview` | `GET /mentor/reviews?assignmentId`, analytics | Engagement (division totals from analytics; review counts for work assigned to this mentor), search, status filter, sort, table |
| `…/assignmentReview/[submissionId]` | <ul><li>`GET /submissions/:id`, `…/reviews`</li><li>`PATCH …/start-review`, `…/mark` (multipart: score, mentorFeedback, feedbackFiles), `…/submit-to-admin`, `…/request-resubmission`, `…/withdraw-resubmission-request`</li><li>`DELETE …/review/attachments/:id`</li><li>file downloads</li></ul> | Actions follow the review status: ASSIGNED/SENT_BACK → Start review; IN_PROGRESS/MARKED → Save mark, Send to admin, Return for revision (only if the assignment allows resubmission); RESUBMISSION_REQUESTED → Withdraw. Shows attempts, review cycles and events, and the admin's send-back note |
| `/mentor/reviews`, `/mentor/reviews/[submissionId]` | `GET /mentor/reviews`, `GET /submissions/:id` | Queue across assignments (course and status filters, paging). The `[submissionId]` route forwards to the grading page; it is the backend notification link format |
| `/mentor/courses` | analytics, `GET /courses/:id/resources?divisionId&includeArchived`, `GET /leaderboard?divisionId`, `GET /assignments` | Scope selector; Overview and Reports sub-tabs; Books / Past Papers / Notes & Materials (one shared table) with row actions |
| `/mentor/courses/upload-book` | `POST /courses/:id/resources` (multipart), `PATCH …/:rid`, `POST`/`DELETE …/attachments`, `PATCH …/publish` | Create or edit any of the 5 resource types: author, source, year, tags, files (≤50 MB each), "publish now" |

### Consolidated, removed or hidden

| Item | Action | Useful parts kept |
|---|---|---|
| Three wizards: `create`, `create/instructions`, `create/resources` | Replaced by one `AssignmentWizard` (create and edit). The two extra routes were deleted | Stepper and controlled form from `create/resources`; success screen from `create` |
| `[id]/submissions/**` (duplicate of `assignmentReview`) | Deleted | The `assignmentReview` tree was kept and wired. Its success popup (the only difference) was kept |
| `BooksTab` + `PastPapersTab` | Replaced by one `ResourcesTab` | Books table design and search; Past Papers year and type filters; sort |
| `OverviewTab` Students / Grades / Activity / Outcomes sub-tabs | Removed | Overview and Reports (cards, score distribution, top students) now use real analytics |
| `live-sessions` and its sidebar link | Deleted | — (replaced in the sidebar by **Reviews**) |
| `students`, `courses/studentlist/**` | Moved to `app/mentor/_unsupported/` (not routable, with a README) | Code kept for when the backend supports it |

### Fixes found during testing

1. **Sign-in robustness (affects every portal).** Each full page load restores the session with `POST /auth/refresh`, and the backend allows 30 per minute per IP. A `429` was treated as "signed out". `lib/api/client.ts` now retries transient failures (429, 5xx, network) with backoff, using `Retry-After` when present; only 401/403 sign the user out.
2. **Mentor sidebar on phones** now starts collapsed, matching the student portal.

### Tests run against the real backend

| Suite | Result | Covers |
|---|---|---|
| API scope and role checks (`api-mentor.mjs`) | **26/26** | <ul><li>Each mentor teaches only their division.</li><li>Mentor permissions never include publish or approve.</li><li>The Senior mentor is refused the Junior draft, resources, analytics and another mentor's submission, and cannot create in the Junior scope (403 `NOT_ASSIGNED_TO_SCOPE`; nothing created) or start that review.</li><li>A mentor token gets 403 for publish, approve, publish result, distribute, the admin submission list, admin pages, and student-only routes.</li></ul> |
| Mentor browser suite (`e2e-mentor.mjs`), final run with the corrected test | **57/57** | First run: 54/57; the 3 failures are explained in the next row. <ul><li>Dashboard (real figures; 1 review to do).</li><li>Removed routes return 404 (live sessions, students, studentlist, submissions duplicate, extra wizard).</li><li>Assignment tabs.</li><li>Wizard validation on each step, brief file, save draft (201), detail and history.</li><li>Edit (prefilled, PATCH 200, "Edited").</li><li>Course analytics (Sample set, avg 75%).</li><li>Resource upload validation, upload (201), hidden from students, publish (students then see it), unpublish, edit, archive, restore, delete (200).</li><li>Review queue, review list, deep link, grading page (view only), "Save Mark" with empty fields → client errors and no request, student file download (200).</li><li>Mentor opening student/admin URLs → own dashboard.</li><li>Senior mentor: own name, nothing to review, Junior assignment "not found", other mentor's submission "not available", Senior scope only.</li><li>No 5xx; no console errors.</li></ul> |
| Step F (submit for approval → recall) | ✅ | The 3 first-run failures were a **test** bug: a case-insensitive wait matched the new title "(edited)" while the page was still on the wizard's success screen, so the test clicked before the detail page was shown. The wait now checks the detail page's URL. Confirmed by a separate replay of the identical path (`PATCH …/submit` 200 → "Pending approval" → `PATCH …/recall` 200 → Draft) and by the full **57/57** re-run |
| Student suite (regression after the client change) | **51/51** | — |
| Auth suite (regression) | **19/19** | — |
| Phone width 390 px | **11/11 mentor pages** | No horizontal scroll; content 310 px |
| `tsc` / `next build` | ✅ | — |
| `eslint` | ✅ | 1 warning, in the hidden, non-routable `_unsupported/studentlist` mock page |

### Test data created in phase 4

| Record | Id | State | Notes |
|---|---|---|---|
| Assignment **"[TEST] Phase 4 wizard assignment 1793905775112 (edited)"**, Junior Algebra | `a7a543f0-7b81-499a-8f8c-781ca1c0dbc3` | **DRAFT** | Created and edited by the first suite run. Submitted for approval and recalled 3 times (debugging the step F failure). Has a brief file `test-resource.pdf`. Each submit sent the admins an "assignment submitted" notification |
| Assignment **"[TEST] Phase 4 wizard assignment 1793912390610 (edited)"**, Junior Algebra | `a266c16c-4f68-4b32-9d59-f225cacd6fcc` | **DRAFT** | Created and edited by the final 57/57 run. Submitted for approval and recalled once (one admin notification). Has a brief file `test-resource.pdf` |
| Resources **"[TEST] Phase 4 book … (edited)"** (one per suite run) | — | **Deleted** by the suite | Each was published and unpublished once, and publishing notified Junior students ("New Algebra material"). They no longer appear in any resource list |

Either draft assignment can be used for the outstanding end-to-end test (submit for approval → admin publishes → student submits → admin distributes → mentor grades).

No existing records were modified. `student.s5`'s in-review submission was only viewed.

### Git (phase 4)

| Commit | Content |
|---|---|
| `5cb150e` Fix: retry session refresh on rate limit or server error instead of signing out | `lib/api/client.ts` only |
| `ed300bd` Mentor portal: integrate assignments, reviews, resources and analytics | 55 files: all mentor pages and components, `lib/api/mentor.ts`, `lib/queries/mentor.ts`, `FilePicker`, types and query keys, and the deletions and moves (duplicate trees, extra wizards, live sessions, Books/Past Papers tabs, `_unsupported/`) |
| `278f3a7` Docs: phase 4 mentor portal progress and test results | `INTEGRATION_PROGRESS.md` |

- **Regrouped (2026-11-05, not pushed).** The first commits (`d60096a` / `8532850` / `d1ab4cb`) had the staged mentor deletions and moves inside the sign-in fix commit. They were re-created with the original messages and authorship. The old history is saved as branch `backup/before-phase4-regroup`, and `git diff backup/before-phase4-regroup HEAD` is empty (identical tree).
- **Working tree clean after committing.**
- **Secrets check:** the full history was scanned for env files, keys, tokens, JWTs, database URLs and passwords. The only env file ever committed is `.env.example` (`API_PROXY_TARGET` only), and `.env.local` is git-ignored.
- **Backend:** `ROFBACKENDTEST` was not modified.

### Remaining issues

1. **Grading and the full results workflow are pending manual verification. They have not been tested end to end.** Start review, save mark, send to admin, request or withdraw resubmission, then admin approval and publication, need an admin-published assignment and student work distributed to a mentor (see the status table). The phase 3 submission and resubmission test is waiting for the same thing.
2. The grouped tabs (Drafts, Closed) and resource status filters work on the loaded page; the API filters one status at a time (B5).
3. Mentors see only submissions distributed to them. "Not submitted" and totals come from course analytics (B3).
4. No mentor CSV or grade export (B4), messaging (B2) or student list (B1): hidden.
5. Help, Settings and clickable notifications are planned for phase 6.

### Files

New:
- `lib/api/mentor.ts`, `lib/queries/mentor.ts`
- `app/components/ui/FilePicker.tsx`
- `app/mentor/components/mentorUi.tsx`
- `app/mentor/assignments/components/AssignmentWizard.tsx`
- `app/mentor/assignments/create/CreateAssignment.tsx`
- `app/mentor/assignments/[id]/{AssignmentOverview.tsx,edit/*}`
- `app/mentor/assignments/[id]/assignmentReview/{ReviewList.tsx,[submissionId]/GradingView.tsx}`
- `app/mentor/reviews/**`
- `app/mentor/courses/components/ResourcesTab.tsx`
- `app/mentor/courses/upload-book/ResourceForm.tsx`
- `app/mentor/_unsupported/README.md`

Modified:
- `lib/api/types.ts`, `lib/query/keys.ts`, `lib/api/client.ts` (refresh retry)
- `app/mentor/layout.tsx`, `app/mentor/dashboard/{page.tsx,components/Sidebar.tsx}`
- `app/mentor/assignments/{page.tsx,create/page.tsx,[id]/page.tsx}`
- `app/mentor/assignments/[id]/assignmentReview/**`
- `app/mentor/courses/{page.tsx,components/CoursesContent.tsx,components/OverviewTab.tsx,upload-book/page.tsx}`

Deleted:
- `app/mentor/assignments/create/{instructions,resources}/page.tsx`
- `app/mentor/assignments/[id]/submissions/**`
- `app/mentor/live-sessions/page.tsx`
- `app/mentor/courses/components/{BooksTab,PastPapersTab}.tsx`

Moved:
- `app/mentor/students` → `app/mentor/_unsupported/students`
- `app/mentor/courses/studentlist/**` → `app/mentor/_unsupported/studentlist/**`

---

## Phase 5: Admin portal

Plan: `PHASE5_ADMIN_PLAN.md` (approved by the owner on 2026-11-05).

Approved decisions:
- **D1:** leave the legacy s5 submission unchanged and documented.
- **D2:** prepare the end-to-end workflow, but run nothing that changes data without approval.
- **D3:** platform settings are in scope.
- **D4:** bulk e-mail is excluded.
- **D5:** moderation is in scope.
- **D6:** schools are read-only.
- **D7:** no academic-year or enrolment management.
- **D8:** remove the unsupported controls.
- **D9:** no new test users without approval.
- **D10:** the legacy sidebar is cleaned up in phase 7.

### Steps

| Step | Scope | Status | Commit |
|---|---|---|---|
| 5.0 | Foundation: admin API module, query keys and hooks, shared admin UI, shell collapses on phones | ✅ | see Git (phase 5) |
| 5.1 | Dashboard | ✅ code; ⏳ admin-authenticated test | see Git (phase 5) |
| 5.2 | Users | ✅ code; ⏳ admin-authenticated test | see Git (phase 5) |
| 5.3 | Mentors and applications | ✅ code; ⏳ admin-authenticated test | see Git (phase 5) |
| 5.4 | Students and schools (read-only) | ✅ code; ⏳ admin-authenticated test | see Git (phase 5) |
| 5.5 | Divisions, courses, resources | ✅ code; ⏳ admin-authenticated test | see Git (phase 5) |
| 5.6 | Assignment approval and management | ✅ code; ⏳ admin-authenticated test | see Git (phase 5) |
| 5.7 | Submissions and distribution | ✅ code; ⏳ admin-authenticated test | see Git (phase 5) |
| 5.8 | Review approval and send-back | ✅ code; ⏳ admin-authenticated test | see Git (phase 5) |
| 5.9 | Result publication | ✅ code; ⏳ admin-authenticated test | see Git (phase 5) |
| 5.10 | Reports and audit log | ✅ code; ⏳ admin-authenticated test | see Git (phase 5) |
| 5.11 | Moderation and platform settings | ✅ code; ⏳ admin-authenticated test | see Git (phase 5) |
| 5.12 | Final integration and regression | ✅ everything possible without admin credentials; ⏳ admin suites and approved workflow | see Git (phase 5) |

### 5.0 Foundation

Files:
- `lib/api/admin.ts`: admin endpoints, grouped by area, plus `downloadCsv`.
- `lib/queries/admin.ts`: hooks, plus `useInvalidateAdmin`. Admin actions change many views, so mutations invalidate the whole `admin` namespace.
- `lib/query/keys.ts`: the `admin` namespace.
- `lib/api/types.ts`: admin types, taken from `docs/api/response-schemas.json`.
- `app/admin/components/adminUi.tsx`, in the original admin style: page header, card, pill filters, debounced search, select filter, table card (scrolls inside the card), assignment and submission badges, CSV button, modal, confirm dialog with an optional validated note, notice, metric card.
- `app/admin/components/AdminShell.tsx`: the sidebar starts collapsed on phones, as in the student and mentor portals.

Tests:

| Check | Result |
|---|---|
| `tsc --noEmit`, ESLint (changed files), `next build` | ✅ |
| API isolation (`api-admin.mjs nonadmin`): student and mentor tokens on 24 admin read routes (including 3 CSV exports and `/schools`) and 15 admin mutations (non-existent ids, empty settings body) | ✅ 78/78 refused with 403 (re-run after 5.4) |
| Admin part of `api-admin.mjs`: permissions, every read route 200, admin refused for create, submit and grade, legacy s5 record read-only | ⏳ Waiting for admin credentials. It reads `ROF_ADMIN_USER` and `ROF_ADMIN_PASSWORD` from the environment and stores nothing |

### 5.1 Dashboard

`app/admin/dashboard/page.tsx` keeps the original layout (5 cards, Needs attention, Recent activity). All data is real:

| Element | Source |
|---|---|
| Greeting | Time of day and the admin's first name (`/me`) |
| Total students, Total mentors (active / awaiting setup) | `GET /admin/dashboard` |
| Junior and Senior students | `GET /admin/dashboard` → `students.byDivision` |
| Published courses | `GET /courses` (status `PUBLISHED`) |
| Needs attention | `GET /admin/reports/overview` → `actionRequired`. Only non-zero items are shown; each links to its queue (assignments awaiting approval, submissions to distribute, reviews awaiting approval, results to publish, mentor applications, students awaiting approval). Failed e-mails is shown without a link, because bulk e-mail is excluded (D4) |
| Recent activity | `GET /admin/audit-logs?limit=6`, with a link to the audit log |

The queue links pass filters (`?status=`, `?tab=applications`) that the later steps read.

Shared: `app/admin/components/auditText.ts` turns audit entries into readable text and is reused by the audit log in 5.10.

Tests:

| Check | Result |
|---|---|
| `tsc`, ESLint | ✅ |
| `e2e-admin.mjs nonadmin`: signed-out redirect to `/login?next=`; mentor on `/admin/*` lands on the mentor dashboard and sends no admin API request; student lands on the student dashboard | ✅ 9/9 |
| `e2e-admin.mjs admin` (prepared): each card equals the API; attention items match the non-zero `actionRequired`; links stay inside `/admin`; no mock strings; 390 px layout | ⏳ Waiting for admin credentials |

### 5.2 Users

Pages:
- `/admin/users`: the original table and pills, now on real data.
  - Filters are kept in the URL: role pills; status (active, suspended, awaiting setup, awaiting approval, mapped to `isActive`, `isActivated` and `isApproved`); division; search (`search=`, debounced); paging.
  - Actions: **Add user** (with password), **Invite** (activation e-mail) and **Import CSV**.
- `/admin/users/[id]`: account details and **Edit details**, which sends only the changed fields. Actions depend on the account's state:
  - approve;
  - resend invitation (not yet activated);
  - send password-reset link (activated);
  - suspend or reactivate;
  - delete. The backend allows deletion only without academic history (409 `USER_HAS_HISTORY` is shown).
  - The admin's own account cannot be suspended or deleted and its role cannot be changed, as the backend enforces.
- **CSV import** always runs a dry run first (`?dryRun=true`, creates nothing) and lists the errors by row. The **Invite N users** button appears only after a successful check.

Rules applied on the form (from the DTOs):
- Name 1–100 characters.
- Username 3–30 characters, `[a-z0-9._-]`.
- A valid e-mail.
- Password: the backend policy, create only. Admins never set another user's password later; they send a reset link.
- Grade is required for students.
- Home location and school name 2–200 characters.
- Backend validation messages are shown beside the fields.
- Schools are chosen from `GET /schools/search`. An invitation may name a new school, which the backend creates.

Endpoints:
- `GET`/`POST /admin/users`
- `POST /admin/users/invite`
- `POST /admin/users/import`
- `GET`/`PATCH`/`DELETE /admin/users/:id`
- `PATCH /admin/users/:id/status`
- `POST /admin/users/:id/{resend-invitation,send-password-reset}`
- `GET /admin/divisions`
- `GET /schools/search`

Tests:

| Check | Result |
|---|---|
| `tsc`, ESLint, routes compile on the dev server | ✅ |
| `api-admin.mjs nonadmin`: user routes refused for student and mentor | ✅ (part of 74/74) |
| `e2e-admin.mjs admin` (prepared, read-only): table rows equal the API; pills, search and dashboard link send the right query; empty and invalid create form shows field errors and **sends no request**; import offers no Invite before a dry run; detail page; edit with no change sends no PATCH; unknown id; own account has no suspend or delete; 390 px | ⏳ Waiting for admin credentials |
| Creating, inviting, importing, suspending or deleting a real account | **Not run.** These need owner approval (D9: no new test users). The UI is ready |

### 5.3 Mentors and applications

`/admin/mentors` keeps the original table, pills and "Course access" button.

**Mentors tab** (`GET /admin/reports/mentors`):
- Shows each mentor's real course × division access, open reviews, status (active, inactive, awaiting setup) and last sign-in.
- The ⚠ icon means no course access or not yet set up.
- Filters: division pills, status select and search (`q=`), all kept in the URL. CSV export.
- The mock's "one division plus a course string" model is replaced by the backend's list of scopes.

**Course access** dialog (`?mentor=<id>`, also linked from the user page):
- Lists the active scopes (`GET /admin/mentor-assignments?mentorId&isActive=true`).
- Adds one (`POST`; re-activates an earlier grant) or removes one (`DELETE`).
- When the removed scope had open reviews, it reports `openReviewsToReassign` with a pointer to reassignment.
- A duplicate is caught before any request.

**Applications tab** (`?tab=applications`; the pending count is shown on the tab):
- `GET /mentor-requests?status=` with Pending, Approved, Rejected or All.
- Approve (`PATCH …/approve` creates the mentor account; the result message notes e-mail verification) and reject, each behind a confirm dialog.

The "More options" button with its `alert()` is removed; the row links to the user account page instead.

Tests:

| Check | Result |
|---|---|
| `tsc`, ESLint, routes compile | ✅ |
| `api-admin.mjs nonadmin`: mentor-assignment and mentor-request routes refused | ✅ (part of 74/74) |
| `e2e-admin.mjs admin` (prepared, read-only): rows equal the report; mentor.junior's 4 courses; division pill sends `divisionId`; dialog scopes equal the API; a duplicate add sends no request; `?tab=applications` sends `status=PENDING`; no mock names; 390 px | ⏳ Waiting for admin credentials |
| Adding or removing a scope; approving or rejecting an application | **Not run.** These change data and need owner approval for a specific record |

### 5.4 Students and schools

**`/admin/students`** (`GET /admin/reports/students`):
- Shows name, username, last sign-in, e-mail, division and grade, school and status.
- "Assignment activity" shows the backend's real figures: submissions, published results and points. The mock progress bar had no backend total behind it.
- Filters: division pills, status and search, kept in the URL. CSV export (`students.csv`).
- Each row links to the user page, where grade, school and home location are edited (`PATCH /admin/users/:id`).
- The `alert()` "more" menu is removed.

**`/admin/schools`** and **`/admin/schools/[id]`** (read-only, D6):
- `GET /schools` with search and paging.
- `GET /schools/:id` with the school's students, paged, each linking to the user page.
- No create, edit or delete controls, because the backend has no such endpoints.

Not added (D7): academic-year and enrolment management.

Tests:

| Check | Result |
|---|---|
| `tsc`, ESLint, routes compile | ✅ |
| `api-admin.mjs nonadmin`, extended with `/schools` and `mentors.csv` | ✅ 78/78 |
| `e2e-admin.mjs admin` (prepared): rows equal the report; s2's activity figures; no mock names; schools equal `GET /schools` with no edit controls; school detail; 390 px | ⏳ Waiting for admin credentials |

### 5.5 Divisions, courses and learning resources

**`/admin/divisions`**: the original two cards on `GET /admin/divisions`.
- Grades, student count, and the number of mentors with access in that division (distinct mentors from the active scopes).
- The four courses, with links to the division's students and mentors.
- **Name and description** are editable (`PATCH /admin/divisions/:id`; 2–100 and ≤ 1,000 characters). Only changed fields are sent.
- **Removed** (D8): "Accepting new students", which has no backend field.
- **Not offered:** the backend `isActive` flag. It is accepted by the DTO but nothing in the backend acts on it, so a switch would do nothing. An inactive division would show "Marked inactive".
- Fixed: the copy-pasted Senior description now comes from the API.

**`/admin/courses`**: cards, table and edit modal on real data.
- Cards: published courses (`/courses`), students and open assignments (`/admin/dashboard`), and mentors with access (active scopes).
- Table: students per course (`/admin/reports/course-participation`), mentors per course, and status.
- **Edit modal:** title (3–200 characters), description (10–2,000 characters) and **course discussions** (`discussionsEnabled`, a real setting), via `PATCH /admin/courses/:id`.
- **Visibility actions**, each confirmed, replace the fake "Course active" switch: Publish, Unpublish (hides all content from students) and Archive (`PATCH /admin/courses/:id/{publish,unpublish,archive}`).
- **Removed** (D8): the course × division checkboxes. Both divisions always study all four courses.

**`/admin/courses/resources`** and **`…/upload-book`**: admins manage resources in **any** course × division (all 8 scopes), using the **phase 4 mentor components** (`ResourcesTab`, `ResourceForm`).
- To make them reusable, they gained an optional `basePath`, and `ResourceForm` gained an optional `scopeList`.
- `useTeachingScopes(enabled)` can now be switched off.
- Mentor behaviour is unchanged (defaults), and the read-only regression below confirms it.

Tests:

| Check | Result |
|---|---|
| `tsc`, ESLint (only the known `_unsupported` warning), all routes compile (admin and mentor) | ✅ |
| `e2e-admin.mjs nonadmin`, now with a **mentor resources regression** (read-only): Books tab lists the `[TEST]` book; "Upload a Book" link; form renders with the mentor's scopes; back keeps scope and tab; row Edit opens the edit form (nothing saved); no Senior scopes for mentor.junior | ✅ 15/15 |
| `e2e-admin.mjs admin` (prepared): division cards and descriptions equal the API; no "accepting" toggle; save without changes sends no PATCH; course rows; modal without division checkboxes; course save without changes sends no PATCH; 8 scopes; admin sees the unpublished `[TEST]` note; admin upload link; 390 px | ⏳ Waiting for admin credentials |
| Editing a division or course, changing course visibility, uploading or changing a resource | **Not run.** These change shared data and need owner approval |

### 5.6 Assignment approval and management

**`/admin/assignments`** (`GET /assignments`; admins see every state):
- Status pills map to the backend states: Awaiting approval (with count), Published, Closed, Returned to mentor, Drafts and Archived.
- Course and division selects, search (`q=`) and paging, all kept in the URL.
- Columns: submissions "submitted / expected" and review progress (approved + published of those submitted), joined by id from `GET /admin/reports/assignments`. CSV export.
- The copy now says mentors prepare and admins approve. There is no "create" button: admins cannot create assignments.

**`/admin/assignments/[id]`**:
- Details, instructions, brief files (authenticated download), the rejection note when returned, submission figures from the report, and the history (`GET /assignments/:id/history`).
- **Only the actions the backend allows in the current state** are offered, each confirmed:

| State | Actions |
|---|---|
| PENDING_APPROVAL | **Approve & publish**, only while the deadline is in the future; otherwise a notice says to return it. **Return to mentor** with a required note of 5–1,000 characters |
| PUBLISHED | **Close submissions** (optional note); **Unpublish**, only with 0 submissions |
| CLOSED | **Reopen**, with a new deadline required when the old one passed and late work is not accepted (validated before sending) |
| Every state except ARCHIVED | **Archive** |

Endpoints:
- `PATCH /assignments/:id/{publish,reject,unpublish,close,reopen,archive}`
- `GET /assignments`, `GET /assignments/:id`, `GET /assignments/:id/history`
- `GET /admin/reports/assignments` (+ `.csv`)

Tests:

| Check | Result |
|---|---|
| `tsc`, ESLint, routes compile | ✅ |
| `api-admin.mjs nonadmin`: publish, reject, close and archive refused for student and mentor | ✅ (part of 78/78) |
| `e2e-admin.mjs admin` (prepared, read-only): rows equal the API; no create button; Drafts pill sends `status=DRAFT`; dashboard link; the `[TEST]` draft offers only Archive; the closed "Sample set" offers Reopen and Archive. The reopen dialog refuses a missing deadline without sending; the test submits only when the dialog marks the deadline as required, and "Sample set" is past its deadline with no late work. An empty return note is refused without sending; history; 390 px | ⏳ Waiting for admin credentials |
| Publishing, returning, closing, reopening, unpublishing or archiving a real assignment | **Not run.** These are part of the §5 workflow and need owner approval |

### 5.7 Submissions and distribution

A **Submissions** section on `/admin/assignments/[id]` for published, closed and archived assignments.
- **Table** (`GET /submissions?assignmentId&status&page`): student and grade; submission time, attempts and a late badge; mentor; status (admin labels); score out of the maximum marks.
- **Status pills**, one backend status each: awaiting distribution, with mentor, in review, marked, awaiting approval, sent back, resubmission requested, approved, published.
- **Distribute N submissions** (shown only when submissions are waiting): `POST /assignments/:id/distribute`.
  - Strategy: the platform default, balanced or round robin.
  - An optional subset of the mentors with access to the course × division (`/admin/mentor-assignments?courseId&divisionId&isActive=true`).
  - The result reports the count per mentor.
- **Assign** (status SUBMITTED, `PATCH /submissions/:id/assign`) and **Reassign** (ASSIGNED, IN_REVIEW, MARKED or REJECTED, `PATCH /submissions/:id/reassign`).
  - The current mentor is excluded.
  - The dialog explains that reassignment closes the current review and starts a new cycle.
  - When no other mentor has access, it says so.
- **Distribution history** (`GET /assignments/:id/distribution-batches`).
- Nothing is offered on archived assignments.
- The link to the review page is added in 5.8.

The **legacy s5 submission** (D1) appears here as it is: IN_REVIEW, with mentor.junior. Reassign is offered because the backend allows it. **Nothing was done to it**, and the test only opens and cancels the dialog.

Tests:

| Check | Result |
|---|---|
| `tsc`, ESLint, route compiles | ✅ |
| `api-admin.mjs nonadmin`: distribute and assign refused for student and mentor | ✅ (part of 78/78) |
| `e2e-admin.mjs admin` (prepared, read-only): rows equal the API; s5 row unchanged (IN_REVIEW, mentor.junior); no Distribute button without waiting work; published rows offer no assign; reassign dialog excludes the current mentor; cancel sends nothing; s5 still IN_REVIEW afterwards; status pill sends `status=SUBMITTED` | ⏳ Waiting for admin credentials |
| Distributing, assigning or reassigning real submissions | **Not run.** These are §5 workflow steps 5–6 and need owner approval |

### 5.8 Review approval and send-back

**`/admin/submissions/[id]`** (new; also the target of the backend's "review awaiting approval" notifications):

- **Mentor review, read-only** (admins never grade, so there are no score or feedback inputs): mentor, score out of the maximum, percentage, cycle, timestamps, feedback and feedback files, an earlier send-back reason, and the internal coordination note.
- **Student's work:** every attempt with time, late badge, the student's note, typed answer and files (authenticated downloads).
- **Decision:**
  - **Approve review**, only from SUBMITTED_TO_ADMIN (`PATCH /submissions/:id/approve`), with an optional internal coordination note of 2–2,000 characters.
  - **Send back to mentor**, from SUBMITTED_TO_ADMIN or APPROVED (`PATCH /submissions/:id/reject`), with a required reason of 5–2,000 characters.
  - Otherwise the card explains what the submission is waiting for.
- **Review cycles** (`GET /submissions/:id/reviews`): each cycle with its mentor, status, score and events.

**`/admin/results/[id]`** (the mock ignored `id`):
- Real assignment header.
- Callout with the not-yet-approved counts by stage.
- Cards: submitted, reviewed (approved + published), pending and average score, from `/admin/reports/assignments`.
- "Mentor reviews" table (`GET /submissions?assignmentId&status`) with pills and paging. Rows open the review page.

The assignment page's submissions table now links each row to its review page ("Review" when awaiting approval).

Tests:

| Check | Result |
|---|---|
| `tsc`, ESLint, routes compile | ✅ |
| `api-admin.mjs nonadmin`: approve and send back refused for student and mentor | ✅ (part of 78/78) |
| `e2e-admin.mjs admin` (prepared, read-only): the s5 page shows review, cycles and work with no decision buttons (in review); no grading inputs anywhere; the published submission has no decision buttons; an empty send-back reason is refused without sending (when a review awaits approval); results cards equal the report; rows link to the review page | ⏳ Waiting for admin credentials |
| Approving or sending back a real review | **Not run.** These are §5 workflow steps 9 and 11 and need owner approval |

### 5.9 Result publication

**`/admin/results`**: the original table on `GET /admin/reports/results-publication`.
- Columns: reviewed out of submitted, "awaiting approval", ready (approved), and published status with the last publication date.
- The summary line shows results published, releases, and results waiting. CSV export.
- **The action follows the data:** "Review & Publish" (filled when approved results are waiting, outlined when reviews await approval), otherwise "View". The mock's `alert()` buttons are gone.

**`/admin/results/[id]`**: a **Publication** panel.
- **Publish N results** appears only when approved results exist (`POST /assignments/:id/results/publish`, optional internal note). The confirmation states that only approved results are released.
- The result reports what was published and what is not yet ready.
- Release history comes from `GET /assignments/:id/result-releases`.

**`/admin/submissions/[id]`**:
- **Publish result** when APPROVED (`PATCH /submissions/:id/publish`).
- **Reopen result** when PUBLISHED (`PATCH /submissions/:id/reopen`, required reason of 5–2,000 characters). This withdraws the result and its points from the student and sends it back to the mentor; admins never edit scores.
- **Result history** (`GET /submissions/:id/result-history`): every publication, and who withdrew it and why.

Publishing or reopening refreshes the student results, leaderboard and mentor caches in the same browser.

Tests:

| Check | Result |
|---|---|
| `tsc`, ESLint, routes compile | ✅ |
| `api-admin.mjs nonadmin`: publish and publish-all refused; now also `assignments.csv` and `results-publication.csv` | ✅ 82/82 |
| `e2e-admin.mjs admin` (prepared, read-only): rows equal the report; action labels follow the data; Sample set published state; publish button only with approved results; release history; s2's published result offers Reopen with history; an empty reopen reason is refused without sending; s2 still PUBLISHED afterwards; 390 px | ⏳ Waiting for admin credentials |
| Publishing or reopening a real result | **Not run.** These are §5 workflow steps 12–13 (and an optional reopen) and need owner approval |

### 5.10 Reports and audit log

**`/admin/reports`**: the original filter bar and four cards on real data.

Filters:
- Course → `courseId`.
- Division → `divisionId`.
- Period (last 30 days, last 7 days, all time) → `from=` as a plain date. The backend reads a date as the whole day.
- **Removed:** the mock's "assignment" select, because the reports have no assignment parameter. Per-assignment figures are on `/admin/results/[id]`.

| Card | Figures | Source |
|---|---|---|
| Student Activity | Active out of total students; submissions; late submissions | `/admin/dashboard` |
| Assignment Performance | Submission rate (submitted out of expected); review completion (approved + published out of submissions); average published score | `/admin/reports/assignments`, `/admin/reports/results-publication` |
| Mentor Review Activity | With mentors; awaiting your approval; completed; average review time | `/admin/dashboard`, `/admin/reports/reviews` |
| Division Overview | Participation per division, averaged across the four courses, with student counts | `/admin/reports/course-participation` |

The mock's "resource views" figure has no admin report behind it, so it was replaced by late submissions.

**Exports card:** every backend CSV (students, mentors, enrolment as a read-only report, course participation, assignments, reviews, results publication, results per submission, mentor activity, mentor workload, and student progress per division), using the current filters. The backend **records every export in the audit log** (`EXPORT_REPORT`), and the page says so.

**`/admin/audit-log`**: the original table (When, Actor, Role, Action, Target, Category) on `GET /admin/audit-logs`, newest first, 25 per page.
- **Filters:** the backend categories (the main ones as pills, the rest in "Other categories…"; the mock's "Access" and "System" categories don't exist in the backend); action search (`action=`, contains); actor role; from and to dates. All kept in the URL.
- **Details** dialog (`GET /admin/audit-logs/:id`) with the recorded metadata.
- **CSV export** (`/admin/audit-logs/export.csv`) with the same filters.

Tests:

| Check | Result |
|---|---|
| `tsc`, ESLint, routes compile | ✅ |
| `api-admin.mjs nonadmin`: reports, audit log and exports refused | ✅ (part of 82/82) |
| `e2e-admin.mjs admin` (prepared): no sample text; 3 real filters; the course filter sends `courseId` to all four reports; "all time" sends no `from`; Students CSV returns 200; audit rows equal the API; the export appears in the log; category pill; details dialog; no mock entries; 390 px | ⏳ Waiting for admin credentials. **Note:** the CSV checks add `EXPORT_REPORT` audit entries; the audit log is append-only by design |

### 5.11 Moderation and platform settings

**`/admin/moderation`** (D5; new sidebar link "Moderation"). Tabs are kept in the URL:
- **Reports** (`GET /admin/moderation/reports`): status pills (Open by default, with its count on the tab), reason and target selects. Shows the snapshot excerpt, the thread, the reporter and the date.
- **Hidden comments** (`GET /admin/comments/hidden`), with **Restore** (`PATCH /comments/:id/restore`).
- **Moderation log** (`GET /admin/moderation/actions`).

**`/admin/moderation/reports/[id]`** (also the backend's "content reported" notification target):
- Shows the reported snapshot, the current text when edited, author, thread and content status, other reports of the same content, and the resolution.
- **Resolve** (`POST …/resolve`, only while the report is OPEN, optional note): Hide content, Delete content, Lock thread (when there is a thread), or Dismiss. When the content is already deleted, only Dismiss is offered, as the backend requires.
- **Thread actions**, only those allowed from the thread's state (`PATCH /threads/:id/{lock,unlock,hide,restore,archive}`).
- After resolution, a hide or restore of the comment is available.
- Pin and unpin are not offered, because the report payload doesn't say whether a thread is pinned.

**`/admin/settings`** (D3; the sidebar "Settings" button is now a link):
- All backend settings (`GET /admin/settings`), grouped by category and **generated from the registry metadata**: switches, number fields with min, max and unit, selects for options, text, e-mail and URL fields with their length limits.
- Shows each setting's default, a "Use default" button, and who changed it last and when.
- Validated before sending. **Only changed keys are sent** (`PATCH /admin/settings`, `{ key: value }`). The backend audits every change.
- **Maintenance:** Recompute leaderboard (`POST /admin/leaderboard/recompute`), behind a confirm dialog.
- Profile and personal preferences stay in phase 6.

The **dashboard** now shows "Reported discussion content" (`reportedContent.open`), linked to moderation.

Tests:

| Check | Result |
|---|---|
| `tsc`, ESLint, routes compile | ✅ |
| `api-admin.mjs nonadmin`: moderation reports and actions, hidden comments and settings (GET and PATCH) refused | ✅ (part of 82/82) |
| `e2e-admin.mjs admin` (prepared, read-only): open reports equal the API; hidden and log tabs; report detail (when a report exists); unknown report id; every setting rendered with API values; save without changes sends no PATCH; an out-of-range number is refused without sending; sidebar links; 390 px | ⏳ Waiting for admin credentials |
| Resolving a report, hiding or restoring content, changing a setting, recomputing points | **Not run.** These change shared data and need owner approval |

### 5.12 Final integration and regression (2026-11-06)

| Check | Result |
|---|---|
| `tsc --noEmit` (whole project) | ✅ |
| ESLint (whole project) | ✅ 0 errors; 1 known warning in the hidden `app/mentor/_unsupported/studentlist` |
| `next build` | ✅ All 22 admin routes are built |
| Static sweep of `app/admin` | ✅ No `alert()`, no `href="#"`, no mock names or figures. Every linked `/admin/...` route exists |
| `api-security.mjs` (student role) | ✅ 45/45 |
| `api-mentor.mjs` (mentor scopes) | ✅ 26/26 |
| `api-admin.mjs nonadmin` (student and mentor on 26 admin read routes and 15 admin mutations) | ✅ 82/82 |
| `e2e-auth.mjs` | ✅ 19/19 |
| `e2e-admin.mjs nonadmin`: portal isolation and the mentor resources regression | ✅ 15/15 |
| `e2e-workflow.mjs` (plan §5) | Prepared. **Dry run only**: it prints the 14 steps and sends nothing. It runs only with `--execute`, `ROF_WORKFLOW_APPROVED=yes` and the admin credentials |
| `api-admin.mjs admin`, `e2e-admin.mjs admin` | ⏳ Waiting for admin credentials |
| `e2e-student.mjs`, `e2e-mentor.mjs` | Not re-run: they create `[TEST]` records, which needs approval |

The backend is unchanged. The `[TEST]` records and the legacy s5 submission are untouched: every check above is read-only, or a refused write.

### Git (phase 5)

Phase 5 has one commit per step on `main`, not pushed:

| Step | Commit |
|---|---|
| 5.0 | `d918668` |
| 5.1 | `3eb879e` |
| 5.2 | `85204f7` |
| 5.3 | `084d1a4` |
| 5.4 | `1c2b3da` |
| 5.5 | `97d7445` |
| 5.6 | `0576ca0` |
| 5.7 | `f86a803` |
| 5.8 | `82870bf` |
| 5.9 | `ac3e3a8` |
| 5.10 | `26d8d78` |
| 5.11 | `5e6a85d` |

Step 5.12 (this documentation) follows. No secrets, `.env` files or credentials were committed. The only password string in the repository is still the public demo-seed one.

### Tests that still need admin credentials or owner approval

**How the prepared suites receive the credentials.** They read `ROF_ADMIN_USER` and `ROF_ADMIN_PASSWORD` from the environment of the shell that runs them. Nothing is written to files, the repository or the logs, and each suite signs in **once**.

| Suite (scratchpad) | Needs | What it does |
|---|---|---|
| `api-admin.mjs admin` | Admin credentials | Read-only. Admin permissions, including the absence of `reviews.grade`, `assignments.prepare` and `submissions.submit`. Every admin read route returns 200, and CSVs arrive as attachments. Admin gets 403 for creating an assignment, submitting and grading. The legacy s5 record is read-only and still IN_REVIEW |
| `e2e-admin.mjs <edge> admin` | Admin credentials | Read-only browser checks for steps 5.1–5.11 (listed in each step above). Dialogs are opened and refused client-side or cancelled. **CSV checks add `EXPORT_REPORT` audit entries** |
| `e2e-workflow.mjs --execute` | Admin credentials **and owner approval** (D2); it also needs `ROF_WORKFLOW_APPROVED=yes` | **Changes data:** the plan §5 workflow on `[TEST] …2390610`, with isolation checks at each step. A dry run (the default) only prints the steps and sends nothing |

Needs owner approval before running:
- the end-to-end workflow (§5);
- test-user creation (D9);
- a real CSV import;
- editing a division or course;
- course visibility;
- resource changes;
- scope changes;
- application decisions;
- moderation actions;
- settings changes;
- leaderboard recompute.

The UI for all of these is implemented and validated client-side, but none has been executed.

Regression suites that create test records were not re-run, because new test data needs approval:
- `e2e-student.mjs` creates and soft-deletes a `[TEST]` comment;
- `e2e-mentor.mjs` creates a `[TEST]` assignment and resource.

The read-only mentor regression in `e2e-admin.mjs nonadmin` covers the shared mentor components changed in 5.5.

---

## Module tracker

| Module | Wired to API | Tested against backend | Notes |
|---|---|---|---|
| Foundation (API client, Query, errors, UI states) | ✅ | ✅ | |
| Auth pages (login, activate, forgot/reset) | ✅ | ✅ (success paths of activate/reset pending a real token) | |
| Shell (user, sign out) | ✅ | ✅ | Bell, Help, Settings in phase 6 |
| Student: dashboard | ✅ | ✅ | |
| Student: courses and course detail | ✅ | ✅ | Includes resources, completion, course discussion |
| Student: assignments list | ✅ | ✅ | |
| Student: assignment detail, submission, discussion | ✅ | ⚠ | A successful submit needs an admin-published open assignment |
| Student: results | ✅ | ✅ | |
| Student: leaderboard | ✅ | ✅ | Students / Schools (division) |
| Student: live sessions | — | — | ✅ Removed |
| Mentor: scope selector, dashboard | ✅ | ✅ | |
| Mentor: assignments list, detail, wizard | ✅ | ✅ | 3 wizards consolidated into 1 |
| Mentor: review queue and grading | ✅ | ⚠ | 2 trees consolidated; grading actions need admin-distributed work |
| Mentor: course resources | ✅ | ✅ | Upload, edit, publish, unpublish, archive, restore, delete |
| Mentor: course analytics | ✅ | ✅ | |
| Mentor: students, student list, messaging | — | — | ✅ Hidden in `app/mentor/_unsupported/` |
| Mentor: live sessions | — | — | ✅ Removed |
| Admin: dashboard, users, mentors, students, schools | ✅ | ⏳ | Non-admin isolation tested; admin-authenticated suites prepared, waiting for credentials |
| Admin: divisions, courses, resources | ✅ | ⏳ | Mentor components reused; mentor regression ✅ |
| Admin: assignments, submissions, distribution, review approval, results | ✅ | ⏳ | Workflow script prepared; run needs approval (D2) |
| Admin: reports, audit log, moderation, settings | ✅ | ⏳ | |
| Admin: academic years and enrolments | — | — | Excluded (D7); read-only enrolment CSV only |
| Admin: bulk e-mail | — | — | Excluded (D4) |
| Notifications inbox and deep links | ☐ | ☐ | |
| Discussions | ✅ (component) | ✅ | Course and assignment threads done; `/discussions/[threadId]` deep link in phase 6 |
| Settings / profile / help | ☐ | ☐ | |

## Change log

- 2026-11-05: Audit documents created.
- 2026-11-05: Phases 1–2 implemented and tested (foundation, authentication, shell).
- 2026-11-05: Phase 3 (student portal) implemented and tested; auth forms hardened against pre-hydration submits.
- 2026-11-05: Phase 4 (mentor portal) implemented and tested; session refresh now retries on 429/5xx. Final mentor suite 57/57; commits regrouped (5cb150e, ed300bd, 278f3a7).
- 2026-11-05/06: Phase 5 (admin portal) steps 5.0–5.11 implemented, one commit per step (d918668 … 5e6a85d). Non-admin isolation and mentor regression pass. Admin-authenticated tests are prepared and waiting for credentials; the data-changing workflow is waiting for owner approval.
