# ROF LMS — Integration Progress

Last updated: 2026-11-06

This is the short, current-status version. The full step-by-step history of phases 1–6 (implementation details, endpoint lists, every test table) is in Git: `git show 1a1ca98:INTEGRATION_PROGRESS.md`. Plans: `PHASE5_ADMIN_PLAN.md`, `PHASE6_PLAN.md`, `VERIFICATION_PLAN.md`, `PHASE7_QA_PLAN.md`.

## Phase status

| # | Phase | Status |
|---|---|---|
| 1–2 | Foundation, authentication, shell | ✅ Done and verified |
| 3 | Student portal | ✅ Done and verified (one flow waits for the admin workflow) |
| 4 | Mentor portal | ✅ Approved (grading end to end waits for the admin workflow) |
| 5 | Admin portal | 🟢 **Verified** (read-only 35/35 + 109/109; end-to-end workflow 53/54, the one failure a wrong expectation). Open: cleanup step 16 (owner go-ahead) |
| 6 | Notifications, discussions, profile, settings, help | 🟢 **Verified** for students, mentors and admins (read-only suites; required data-changing checks 20/20). Optional checks not run |
| 7 | Final QA | 🔄 F2 ✅; F1 ✅ (590/591, then the mentor download test fixed: 41/41); **S5 ✅** headers incl. nonce CSP (no `unsafe-inline` / `unsafe-eval`) and HTTPS-only HSTS; **S6 ✅** `next` / `eslint-config-next` pinned to 16.4.5: 0 critical, 0 high, 8 moderate dev-only; final regression **591/591** (see `PHASE7_QA_PLAN.md` §7–8). Remaining: S8, S9; R1–R9 |

Phases 3 and 4 flows that waited for the admin (student submission, mentor grading) were exercised by the phase 5 workflow.

## Recent results (2026-11-06)

### Admin read-only verification (phase 5)

| Suite | Result |
|---|---|
| `api-admin.mjs admin` | ✅ 35/35: permissions, 26 admin read routes incl. 5 CSV exports, admin refused for create/submit/grade, legacy s5 record unchanged |
| `e2e-admin.mjs admin` | ✅ 109/109 (final run). The first run was 102/110; all 8 failures were test defects (reading pages while "Loading…", counting the status filter as scopes, CSV download detection, fixed sleeps, a hard-coded course count) and were fixed in the suite. **No app defect found** |
| Not exercised (no matching data) | Return-note validation, send-back validation, moderation report detail |

### Phase 6 (read-only)

| Suite | Result |
|---|---|
| Deep-link redirects / notifications / discussions / profile and help | ✅ 17/17, 35/35, 38/38, 46/46 |
| Regression: mentor API, admin routes refused for non-admins, auth, admin isolation | ✅ 26/26, 82/82, 19/19, 15/15 |
| Student API security | ⚠ 44/45: stale expectation (a Senior Algebra resource was published by the owner on 2026-11-05), not a defect |
| `tsc`, ESLint, `next build` | ✅ |

### Findings
- The intermittent browser hydration warning is caused by the **Grammarly extension** (`data-gr-ext-installed` on `<body>`), not by the app.
- Fixed in phase 6: signing out ran two redirects at once (`3736d06`).
- The admin password was reset at the owner's request, directly in the local database (the forgot-password link cannot be recovered locally: SMTP is DRY_RUN and sent bodies are cleared). No audit entry exists for that change.
- Test side effects: 13 CSV-export audit entries (approved) and sign-in entries. The tests changed no records.
- Changes made by the owner in the admin portal during testing: mentor.junior lost Algebra and Geometry (Junior) access; student `theoneste` created; "Assignment1" and **"[TEST] Phase 4 wizard assignment …2390610" published**. The latter was reserved for the end-to-end workflow, so that plan must be adjusted before it runs.

### Approved runs (2026-11-06, A1–A3, A5) — see `VERIFICATION_PLAN.md` §6

| Run | Result |
|---|---|
| A5 admin-side phase 6 (read-only) | ✅ 25/25; discussions suite updated for mentor.junior's current access: ✅ 28/28 |
| A1 + A2 end-to-end workflow on `[TEST] …2390610` | ✅ 53/54: grant → submit ×3 → distribute → resubmission request → mark → send back → re-mark → approve → publish (s2 sees 24/30, points 30 → up, notified) → reopen (points back to 30) → close → archive; isolation checks pass at every step. ❌ 1: "student can still open the archived assignment" — the backend hides archived assignments from students (404); the expectation was wrong. **Stopped before step 16** |
| A3 phase 6 required (N1, P1–P3, D1–D4) | ✅ 20/20; all values restored |

### Phase 7 (2026-11-06)
- F2: stale test expectations replaced by API-derived ones; `--read-only` modes added; no application change.
- F1 on the production build: build ✅, start ✅, 59/59 routes 200, proxy ✅; 15 suites **590/591**. The one failure is a test defect (download capture); the download works (200, PDF).

### Public homepage (2026-11-06)
- `/` is now the public homepage (was a redirect to sign-in). Sections: hero (real ROF/RwMO photos, rotating quotes, pause control), community numbers, why join (students, teachers, coaches, schools), partners, contact, join, footer. Code: `app/page.tsx`, `app/components/home/*`, content in `lib/site/content.ts`, images in `public/home` (1.4 MB, from the owner's RwMO site).
- New pages reusing existing backend flows: `/register` (`POST /auth/register/student`) and `/apply?as=teacher|coach` (`POST /mentor-requests`).
- Tests (read-only, production build with CSP): homepage 47/47; auth 19/19 (root check updated: signed-in users now see the homepage with "My dashboard"); student 47/47. No registration or application was submitted.
- Not available, shown honestly: official social/website links, AIMS and Athemath logos, a hero video (optional: `HERO_VIDEO` in `lib/site/content.ts`, off by default).

### Homepage completion (2026-11-06, approved: "Approve both", "Contact form for now", "Coach everywhere users see it")

**Backend (new module `src/public-site`, one additive migration `20261119000000_contact_messages`: new table `ContactMessage` + enum; no existing table or row changed)**

| Endpoint | Access | Behaviour |
|---|---|---|
| `GET /api/v1/public/statistics` | Public, 60/min per IP | `{students, coaches, teachers, schools, members, generatedAt}`. Counts **active** accounts only (active + approved + activated): students = STUDENT, coaches = MENTOR role, members = all active, schools = schools with ≥ 1 active student, teachers = `null` (no teacher accounts exist). Counts only, no personal data; query parameters ignored; cached 5 min |
| `POST /api/v1/public/contact` | Public, 5/hour per IP | Validated (name, e-mail, subject, message; unknown fields rejected). Spam protection: hidden honeypot field (acknowledged, not stored), 3 messages per e-mail per hour (429), identical message within 24 h (409). Stored in `ContactMessage` (IP kept only as a keyed hash). If `platform.supportEmail` is set, a notification e-mail is queued to it; the response says `QUEUED` or `NOT_CONFIGURED` and the page only ever says "received", never "e-mailed" |
| `GET /api/v1/admin/contact-messages`, `PATCH …/:id` | ADMIN | List (status filter, pagination, `newCount`; no IP hash); mark handled / new (audited) |

**Frontend**
- Statistics cards show the live API figures (teachers "—" with a note); a notice appears if the endpoint is unavailable.
- Contact form posts to `/public/contact` (no more mailto); honeypot field; server errors shown per field; duplicate and rate-limit messages.
- Teachers: "Join as a Teacher" opens the contact form with the subject "Teacher: connect my school with ROF" (no teacher role). `/apply` is the coach application only; `/apply?as=teacher` explains teacher accounts are not available yet.
- New admin page **Messages** (`/admin/messages`, sidebar) to read contact messages and mark them handled — works even with no support e-mail set.
- **Terminology:** "Mentor" → "Coach" in every visible label of the admin, coach and student portals (≈130 strings) and in backend notification/e-mail texts, settings descriptions, error messages and CSV column headers. Unchanged: URLs (`/mentor/...`, `/admin/mentors`), the `MENTOR` role, API paths and error codes, usernames.

**Tests (no real registrations, applications or contact messages stored in `rof`)**

| Check | Result |
|---|---|
| Backend unit / lint / build | ✅ 449/449 / clean / ✅ |
| Backend e2e `public-site` (on disposable `rof-test`) | ✅ 15/15: public access, no PII, active-only counts (suspended, unactivated, unapproved excluded), params ignored, cache, throttle, validation, honeypot, duplicate 409, per-e-mail 429, e-mail queued / not configured, admin 401/403, list, handle/reopen audited |
| Backend full e2e (`rof-test`) | ✅ 286/286 before the wording change (3 skipped). After: 285/286, the one failure a test still expecting the old "Mentor" CSV header; expectation updated, that file + `public-site` re-run ✅ 41/41 |
| API docs / route coverage | ✅ 202 endpoints documented; 202/202 routes called by e2e tests |
| Frontend `tsc`, ESLint, `next build` | ✅ (1 known warning in `_unsupported`) |
| Homepage suite (production build) | ✅ 57/57: live numbers = API, teacher/coach links, contact validation, one honeypot submission (nothing stored), 400 on bad input, 401 on admin list, `/apply` coach-only, registration validation, signed-in "My dashboard" |
| Admin Messages + Coach wording | ✅ 24/24 (read-only: nothing marked handled) |
| Full read-only regression (15 suites) | ✅ 591/591 after updating 2 wording assertions and re-running 3 suites (details: `PHASE7_QA_PLAN.md` §9). One intermittent hydration error (#418) seen once in the auth suite, not reproduced |

**Owner inputs applied (2026-11-07)**
- Social links (footer and contact section): Facebook, LinkedIn, Instagram, WhatsApp channel (`SITE.social`). YouTube, X and an ROF website were not provided and stay hidden.
- Partner tiles link to https://aims.ac.rw and https://athemath.org (new tab). AIMS and Athemath are still shown by name until their official logo files are supplied.
- RwMO photos: use confirmed by the owner.
- **Signed-in users are now sent to their portal** when they open `/` (owner decision; was "stay on the homepage with My dashboard").
- Support details set by the owner in Settings (e-mail info@rwandaolympiadfoundation.org, phone, hours, message): contact messages now also queue an e-mail to that address (only logged locally, DRY_RUN).
- Approved C1–C3 on the main database: one `[TEST] contact form` message sent from the homepage (201, stored, e-mail queued to the support address), shown in Admin → Messages, marked handled → new → handled (3 audit entries). Message `ba0e0625…` stays HANDLED. 16/18; the 2 failed checks expected "no support e-mail" and were wrong once the owner set one.
- Tests: homepage 61/61, auth 19/19. Not committed (owner: no commit yet).
- **Fixed (owner report):** student registration always failed with "homeLocation must be longer than or equal to 2 characters": the backend requires a home location but `/register` never asked for it. Added a required "Home location" field (validated in the browser; server errors shown under the field). Verified without creating an account: a complete form with an existing username now passes server validation and gets the friendly "already in use" answer (409). Homepage suite 63/65: the 2 failures are the contact form hourly limit (429) reached by the day's test runs, i.e. the spam protection working.

## Owner actions required

| # | Action | Unblocks |
|---|---|---|
| 1 | Go-ahead for workflow step 16: remove the temporary mentor.junior Algebra · Junior access (`1fd69010…`). Only that access row changes; the reopened `[TEST]` review stays with mentor.junior | Cleanup |
| 2 | Optional phase 6 checks (N2, R1, W1, UI) if wanted | — |
| 2a | **Homepage inputs still open:** AIMS and Athemath logo files (optional; names shown meanwhile); ROF website URL and YouTube/X if they exist; a hero video (optional, `HERO_VIDEO`). Done 2026-11-07: social links, partner links, photo permission, support details, signed-in redirect | Complete homepage |
| 2b | Apply migration `20261119000000_contact_messages` on every other environment (`prisma migrate deploy`); done on local `rof` and `rof-test` | Contact form elsewhere |
| 3 | Optional: fill in support contact details in platform settings; update the stale student-test count; rotate the admin password before any real use (it appears in the chat) | — |

## Known limitations (backend)
No push notifications (60 s polling); no teacher accounts (teachers use the contact form); contact messages cannot be answered from the platform (reply by e-mail); e-mail is DRY_RUN locally; no avatar upload, and username/e-mail/school are not user-editable; no school create/edit; no assignment delete.

## Environment
Backend `node dist/main.js` on `:3000` with the local `prisma dev` database `rof`; frontend on `:3001` (`/api` proxy). `APP_URL=http://localhost:3001` ✅. Admin credentials are read from the user environment variables `ROF_ADMIN_USER` / `ROF_ADMIN_PASSWORD`, never stored in files. Test scripts are kept outside the repository, in the session scratchpads.

## Final audit before production (2026-11-07)

Production backend: `https://rofbackendtest.onrender.com` (health: database up, storage up).

| Area | Result | Status |
|---|---|---|
| Lint / type-check / production build (Netlify settings, real backend URL) | 0 errors (1 known warning in the private `_unsupported` folder) / clean / builds 66 routes | Completed and tested |
| API compatibility | All 83 distinct endpoints the frontend calls exist in the backend with the same method and path (scripted comparison with the backend's `docs/api/routes.json`, ambiguous matches checked by hand) | Completed and tested |
| Journeys through the `/api` proxy (both apps local) | 39/39: public pages, error shape, login → refresh cookie → silent refresh with rotation → logout, 403 for other roles, coach upload → publish → student download byte-for-byte, disguised executable refused, admin dashboard/reports/CSV | Completed and tested |
| Large uploads on Netlify | **Fixed**: uploads go straight to the backend (`NEXT_PUBLIC_API_UPLOAD_ORIGIN`, CSP `connect-src`); 12 MB cross-origin upload with CORS preflight tested locally; foreign origins refused | Completed, not yet tested on Netlify |
| `netlify.toml` | Backend URL pinned (`API_PROXY_TARGET`, upload origin); `/api/*` CDN proxy rule added (no function cold start, large downloads stream) | Completed, not yet tested on Netlify |
| CI | **Added** `.github/workflows/ci.yml` (lint, type-check, build with Netlify settings) — the repository had none | Completed, runs on the first push |
| Quizzes, online exams, automatic marking | Not part of either application (assessment = uploaded solutions marked by coaches) | Not completed — product decision |
| Admin pages for academic years, bulk e-mail, activity log | Backend APIs exist; no frontend pages (planned as optional in `INTEGRATION_MAPPING.md`). An academic year is active in production until 2027-07 | Not completed |

Changes: `lib/api/upload-origin.ts` (new), `lib/api/client.ts`, `lib/security/headers.ts`, `netlify.toml`, `.env.example`, `.github/workflows/ci.yml` (new), `DEPLOYMENT.md`, `INTEGRATION.md` (new), `README.md`.
