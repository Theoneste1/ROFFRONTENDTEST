# ROF LMS — Integration Progress

Last updated: 2026-11-05

## Phase status

| # | Phase (owner's order) | Status |
|---|---|---|
| — | Audit (frontend, backend, mapping, gaps, roadmap) | ✅ Done |
| 1 | Foundation and API integration | ✅ Done, tested against the running backend |
| 2 | Authentication and application shell | ✅ Done (Help/Settings links and the notification bell come in phase 6) |
| 3 | Student portal | ⏭ Next |
| 4 | Mentor portal | ⏸ |
| 5 | Admin portal | ⏸ (needs admin credentials for testing; see Issues) |
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

## Module tracker

| Module | Wired to API | Tested against backend | Notes |
|---|---|---|---|
| Foundation (API client, Query, errors, UI states) | ✅ | ✅ | |
| Auth pages (login, activate, forgot/reset) | ✅ | ✅ (success paths of activate/reset pending a real token) | |
| Shell (user, sign out) | ✅ | ✅ | Bell, Help, Settings in phase 6 |
| Student: dashboard | ☐ | ☐ | |
| Student: courses and course detail | ☐ | ☐ | |
| Student: assignments list | ☐ | ☐ | |
| Student: assignment detail, submission, discussion | ☐ | ☐ | |
| Student: results | ☐ | ☐ | |
| Student: leaderboard | ☐ | ☐ | Study-group toggle → division/school |
| Student: live sessions | — | — | To be removed |
| Mentor: scope selector, dashboard | ☐ | ☐ | |
| Mentor: assignments list, detail, wizard | ☐ | ☐ | Consolidate 3 wizards |
| Mentor: review queue and grading | ☐ | ☐ | Consolidate 2 trees |
| Mentor: course resources | ☐ | ☐ | |
| Mentor: course analytics | ☐ | ☐ | |
| Mentor: students, student list, messaging | — | — | Hidden (owner decision) |
| Mentor: live sessions | — | — | To be removed |
| Admin: all modules | ☐ | ☐ | Needs admin credentials |
| Notifications inbox and deep links | ☐ | ☐ | |
| Discussions | ☐ | ☐ | |
| Settings / profile / help | ☐ | ☐ | |

## Change log

- 2026-11-05: Audit documents created.
- 2026-11-05: Phases 1–2 implemented and tested (foundation, authentication, shell).
