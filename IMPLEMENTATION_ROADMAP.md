# ROF LMS — Implementation Roadmap

Audit date: 2026-11-05. Phases 1–4 (assessment, backend assessment, mapping, gap analysis) are **complete**; see `FRONTEND_AUDIT.md`, `BACKEND_AUDIT.md` and `INTEGRATION_MAPPING.md`. Phases 5–8 below are the plan.

**Update 2026-11-05:** The owner approved the plan. Their decisions are recorded in `INTEGRATION_PROGRESS.md`, and the resulting hidden or removed features are listed in `INTEGRATION_MAPPING.md` §5. Execution follows the owner's phase order: (1) foundation, (2) auth and shell, (3) student, (4) mentor, (5) admin, (6) notifications, discussions and other modules, (7) testing and QA. Steps 0–2 below are **done**.

## Guiding rules

- Wire existing pages; don't redesign them. Keep the shells, cards, tables and colours.
- When duplicates exist, keep the most complete copy and delete the others, stating which in each change.
- Make no backend changes. Resolve gaps on the frontend (hide, derive or remove) unless a backend change is approved.
- Every module is "done" only after it has been tested against the running backend with the seeded demo accounts.
- Read the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code (per `AGENTS.md`). This includes routing, `proxy` (the old middleware), rewrites, and client/server components.

## Phase 5 — Implementation plan (dependency order)

### Step 0 — Prerequisites (needs approval: installs dependencies)

1. `npm install` in the frontend. Then run `npm run build` and `npm run lint` to record a baseline of existing errors.
2. Make an initial git commit of the untouched frontend, so every later change is reviewable.
3. Set up the dev environment. Recommended: run the API on `:3000` and Next on `:3001`. Add a `rewrites()` entry in `next.config.ts` that proxies `/api/:path*` to `http://localhost:3000/api/:path*`. The browser then sees one origin: CORS is not needed, the `SameSite=Strict` refresh cookie works, and no backend code changes. The backend `.env` needs `APP_URL=http://localhost:3001` so e-mailed links open the frontend. That is a config value, not code, and needs approval.
4. Add `.env.local` with `API_URL` (proxy target).

### Step 1 — Foundation (blocks everything)

| Task | Output |
|---|---|
| API client: base URL, bearer token in memory, `credentials: 'include'`, one refresh-and-retry on 401, typed `ApiError` keyed on `code`, `requestId` | `lib/api/client.ts` |
| Types from `docs/api/openapi.json` (enums as unions; responses) | `lib/api/types.ts` |
| Thin endpoint modules per area (auth, me, courses, assignments, submissions, …) | `lib/api/*.ts` |
| Session provider: bootstraps with `POST /auth/refresh` on load, exposes `user`, `permissions`, `login`, `logout` | `lib/auth/SessionProvider.tsx` |
| Role guard in each role layout: redirect to `/login` when unauthenticated, and to the user's own portal on a role mismatch (the backend still enforces everything) | `app/{admin,mentor,student}/layout.tsx` |
| Shared UI states: `Loading`, `ErrorState` (shows `requestId`), `EmptyState`, `Pagination`, `ConfirmDialog`, `Toast`. These follow the existing card, button and colour style | `app/components/ui/*` |
| File helpers: authenticated blob download using `Content-Disposition`; client-side size and type pre-checks | `lib/api/files.ts` |
| Date formatting in the user's locale (UTC in, Africa/Kigali context) | `lib/format.ts` |

### Step 2 — Authentication and shell

1. `/login` replaces the portal chooser: the root `/` sends a signed-in user to their role's dashboard, and everyone else to `/login`.
2. Public pages: `/activate`, `/forgot-password`, `/reset-password`, `/register` (student), and optionally `/apply-mentor`.
3. The navbars in all 3 roles show the real name, e-mail and role. Add the notification bell with unread-count polling and a dropdown.
4. The sidebars get a working Sign Out and a Settings page (profile, change password, sign out everywhere, notification preferences). Help reads `GET /support`.

### Step 3 — Student portal (smallest surface, validates the foundation)

1. Dashboard: `/me`, `/me/courses`, `/me/assignments`, `/leaderboard/me`, `/notifications`.
2. Courses list and course detail, keyed by `courseId`. Resources by type, with download, mark complete, and course discussion.
3. Assignments list with `displayStatus` badges and client-side filter, search (`q`) and pagination.
4. Assignment detail:
   - Real brief and attachments.
   - Submission with text and files, validated against backend rules.
   - Resubmission driven by `canSubmit` and `resubmissionDueAt`.
   - Revision history.
   - Results tab only when `PUBLISHED`.
   - Discussion tab using threads.
5. Results list and detail, with feedback files and no reply box.
6. Leaderboard: division ranking, pagination, my rank, and a school-ranking toggle.

### Step 4 — Mentor portal

1. Teaching scope selector (course × division from `/me/teaching`), shared across mentor pages.
2. Dashboard composed from `/assignments?createdById`, `/mentor/reviews` and `/analytics/courses/:id`.
3. Assignments list with lifecycle tabs, plus a detail page (history, edit, submit for approval, recall).
4. **One** assignment wizard. Map it to `CreateAssignmentDto`; save it as a draft, then submit it for approval.
5. Review queue (`/mentor/reviews`) and the grading page: start review, mark with score, feedback and files, submit to admin, request or withdraw resubmission.
6. Course resources: the Books and Past Papers tabs plus the upload form, covering create, attach, publish, unpublish, archive, restore and delete.
7. The course analytics tab (Overview and Reports) reads `/analytics/courses/:id`.

### Step 5 — Admin portal

1. Dashboard from `/admin/dashboard`, with actionable attention links.
2. Users:
   - List with server filters and paging.
   - Detail and edit.
   - Create, invite, CSV import (dry run first), status, resend invitation, password-reset link, delete.
3. Mentors: scope management (add or remove course × division) and mentor applications (approve or reject).
4. Students (`/admin/reports/students`) and enrolment correction.
5. Divisions (edit name, description, active) and courses (edit, publish, unpublish, archive, discussions toggle).
6. Assignments:
   - Approval queue.
   - Detail with publish, reject (note), close, reopen, unpublish, archive and history.
   - Distribution of submissions.
7. Results:
   - Per-assignment submissions.
   - Approve or send back per review, and reassign.
   - Bulk publish, release history, reopen.
8. Reports with real filters and CSV downloads; audit log with filters, paging, detail and export.
9. New pages: Settings, Academic years, Moderation.

### Step 6 — Cross-cutting

1. Notification inbox pages, plus deep-link redirect routes for the backend `link` values.
2. Discussions page `/discussions/[threadId]`: reactions, replies, report, edit and delete.
3. Remove or hide unsupported features as decided (live sessions, messaging, mentor students, …).
4. Remove duplicates: the `submissions/` review tree, the extra wizards, and the unused `app/components/Sidebar.tsx`.
5. Consistency pass:
   - Page background on the shell only, with no nested `<main>`.
   - One primary colour token.
   - Page `metadata` titles.
   - Fix nested button-in-link.
   - Remove the `body` Arial override.
   - Fix the dark-mode mismatch.

## Phase 6 — Frontend implementation (working method)

- Work one module at a time, in the order above. Each module is a small, reviewable commit.
- Mock arrays are deleted only when the module that used them is wired up.
- `INTEGRATION_PROGRESS.md` is updated after every module.

## Phase 7 — Integration testing (per module)

- Run the backend locally (`docker compose up -d --build` or `npm run start:dev` with PostgreSQL), seeded with demo data.
- Test each flow as `admin`, `mentor.junior`, `mentor.senior`, `student.s2` and `student.s5`, including the full assignment → result pipeline across all three roles.
- Check the negative paths:
  - 401 expiry and refresh.
  - 403 for a mentor out of scope.
  - 404 for a student out of scope.
  - 409 state conflicts.
  - 400 validation details shown next to the fields.
  - 413 and 415 upload errors.
  - 429 rate limiting.
- `npm run build` and `npm run lint` must pass.

## Phase 8 — Final QA checklist

Navigation (no dead links or `href="#"`) · Auth (login, refresh, logout, activation, reset) · Authorization (role layouts, permission-based actions) · Data retrieval · Create, update and delete reflected in the database · Forms and validation · Search, filters, pagination · CSV export · File upload and download · Notifications and deep links · Responsive layouts at 360 px, tablet and desktop · Loading, empty and error states · Consistent terminology (the 4 courses, Junior/Senior, backend status labels).

## Effort indication (rough, for planning only)

| Step | Relative size |
|---|---|
| 0–1 Prerequisites and foundation | M |
| 2 Auth and shell | M |
| 3 Student | M |
| 4 Mentor | L |
| 5 Admin | XL |
| 6 Cross-cutting and cleanup | M |
| 7–8 Testing and QA | M (continuous) |
