# Phase 7 — Final QA Plan

Prepared 2026-11-06. **Plan only: nothing in it has been run.** Data-changing items need the owner's approval; they are marked ⚠.

## 1. Remaining functional checks

| # | Check | How | Data change |
|---|---|---|---|
| F1 | Full read-only regression on the **production build** (`next build` + `next start`, not the dev server): auth, student API security, mentor API, admin (non-admin and admin), all phase 6 suites | Existing suites, one paced run | No (sign-in and CSV audit entries only) |
| F2 | Update stale test expectations: student security suite (Senior Algebra now has 1 resource), mentor/discussion checks that assume the seeded scopes | Edit the test scripts | No |
| F3 | Student and mentor browser suites (`e2e-student.mjs` 51, `e2e-mentor.mjs` 57), not re-run since phase 4 | Run once | ⚠ They create a `[TEST]` comment, assignment and resource |
| F4 | Admin checks not exercised for lack of data: return-note validation (needs a PENDING_APPROVAL assignment), send-back validation (needs a review awaiting approval), moderation report detail (needs an open report) | Run when such data exists, or create it | ⚠ if created |
| F5 | Optional phase 6 checks: N2 (mark all read), R1 (report + admin dismissal), W1 (password change and back), UI click-through | `api-p6-writes.mjs --with-…` | ⚠ |
| F6 | Account e-mail flows end to end: activation and password reset success paths, admin invite and resend, CSV import | Needs a mail catcher (e.g. Mailpit) or real SMTP | ⚠ backend config + new test user (D9) |
| F7 | Admin user management writes: create, edit, suspend/reactivate (session ends), delete | Runnable with a dedicated `[TEST]` user | ⚠ (D9) |
| F8 | Browsers and devices: Chrome, Firefox, Safari (macOS/iOS), Android Chrome; 360 px, tablet and desktop widths | Manual pass on the main flows of each role | No |
| F9 | Accessibility: keyboard-only use, focus order, dialogs (Escape, focus trap), labels, contrast | axe scan + manual pass | No |
| F10 | Performance: Lighthouse on login, dashboards and the largest lists; bundle size | Production build | No |

## 2. Security checks

| # | Check | Status / method |
|---|---|---|
| S1 | Role isolation: students and mentors refused on every admin route; out-of-scope records 404 | ✅ Done (82/82, 45/45, 26/26 and the workflow isolation checks); re-run in F1 |
| S2 | Tokens: access token only in memory; refresh token httpOnly, `SameSite=Strict` cookie; single-flight refresh | ✅ Done (phases 1–2); re-verify on the production domain |
| S3 | XSS: user content (discussions, feedback, notes, support text) rendered as text | ✅ No `dangerouslySetInnerHTML` in the app; support help URL limited to http(s) |
| S4 | Open redirects: `?next=` limited to the user's portal and notification links | ✅ Implemented; add a negative test (`//evil`, absolute URLs) |
| S5 | Security headers: CSP (nonce-based), HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy | ✅ Implemented and verified locally (§7). HSTS to be confirmed on the HTTPS deployment |
| S6 | Dependency audit: `npm audit` (frontend and backend) | ✅ Done (§7, §8): `next` and `eslint-config-next` pinned to 16.4.5; 0 critical / 0 high; 8 moderate dev-only remain (accepted, documented) |
| S7 | Secrets: scan the Git history for keys, tokens, passwords and `.env` files before any push | Done in phases 3–5; repeat before pushing |
| S8 | Admin credentials: rotate the admin password (it appears in the chat); remove `ROF_ADMIN_USER` / `ROF_ADMIN_PASSWORD` from the user environment after QA | ❌ Owner action |
| S9 | Demo accounts: production must be seeded **without** `SEED_DEMO` (the demo password is public) | Deployment check |
| S10 | Rate limits and lockout: 10 sign-ins/min, 5 wrong passwords → 15 min lock; the UI shows the messages | ✅ Done (phase 3); re-check in production |
| S11 | File uploads: type and size refused before sending, and by the backend | ✅ Done (phases 3–4) |
| S12 | Error responses show the `requestId` and no internal detail | ✅ Done |

## 3. Known limitations (accepted unless the owner decides otherwise)

| Area | Limitation |
|---|---|
| Backend | No push notifications (60 s polling); no support-request endpoint; no avatar upload; username, e-mail and school not user-editable; no school create/edit; no assignment or submission delete; no academic-year or enrolment management in the UI (D7); no bulk e-mail (D4) |
| Backend (found in phase 5 verification) | Archived assignments are hidden from students (404), yet their brief files stay downloadable. Removing a mentor's course access does **not** move their open reviews: they stay in that mentor's queue and the mentor can still finish them; there is no automatic reassignment |
| Local environment | E-mail is DRY_RUN; the reset/activation links can't be used locally |
| Frontend | Unread badge updates every 60 s; thread rename/delete by authors not offered; admin thread moderation only on `/admin/moderation` |
| Test data | `[TEST]` records remain permanently (no delete endpoints); the legacy student.s5 review on "Sample set" is still open with mentor.junior |

## 4. Production-readiness requirements

| # | Requirement | Owner / status |
|---|---|---|
| R1 | Backend `APP_URL` = the public frontend URL; `API_PROXY_TARGET` (frontend) = the backend URL; frontend and API on the same site (cookie) | Deployment (see `DEPLOYMENT.md`) |
| R2 | Real SMTP configured (activation, reset, notifications) | Owner |
| R3 | Production database: migrations applied, seeded **without** demo data, admin created with a strong `SEED_ADMIN_PASSWORD`, backups scheduled | Owner / backend |
| R4 | Support contact details filled in platform settings | Owner |
| R5 | Security headers S5 added; HTTPS only | Frontend |
| R6 | Code clean-up before release: remove the legacy `app/components/Sidebar.tsx` (D10) and the hidden `app/mentor/_unsupported/` pages (or keep them out of the build) | Frontend, with approval |
| R7 | Monitoring: backend logs and error tracking; uptime check on `/health` | Owner / backend |
| R8 | Git: review, commit the uncommitted documents, then push (only when the owner says so) | Owner approval |
| R9 | A last full regression (F1) against the deployed staging environment | Before go-live |

## 5. Proposed order

1. F2, then F1 on the production build (read-only).
2. S5, S6 (code and audit, no data change); R6 if approved.
3. Owner decisions on F3–F7 (data-changing) and on the accepted limitations.
4. F8–F10 (manual and tool-based, no data change).
5. Deployment items R1–R4, R7, then R9 on staging.

## 6. Results: F2 and F1 (2026-11-06)

### F1 — production build (`next build` + `next start` on :3001; backend unchanged on :3000)

Build ✅ (59 page routes) · server start ✅ (ready in 255 ms) · **all 59 routes → 200** · `/api` proxy ✅ (`/api/v1/support` 200, `/api/v1/me` without token 401) · no errors in the server log.

| # | Suite | Result |
|---|---|---|
| 1 | `api-security` (student role) | ✅ 45/45 |
| 2 | `api-mentor` (mentor scopes) | ✅ 26/26 |
| 3 | `api-admin nonadmin` | ✅ 82/82 |
| 4 | `api-admin admin` (incl. 5 CSV exports) | ✅ 35/35 |
| 5 | `e2e-auth` | ✅ 19/19 |
| 6 | `e2e-student --read-only` | ✅ 47/47 (comment post/reply/delete skipped) |
| 7 | `e2e-review --read-only` | ✅ 18/18 ("sign out everywhere" skipped) |
| 8 | `e2e-mentor --read-only` | ⚠ 40/41 (assignment and resource saves skipped). The failure is a **test defect**: the browser-download response wasn't captured (status 0). The same download checked directly: 200, `application/pdf`, attachment `work2.pdf` |
| 9 | `e2e-admin nonadmin` | ✅ 15/15 |
| 10 | `e2e-admin admin` (incl. 1 CSV export) | ✅ 109/109 |
| 11–15 | Phase 6: redirects, notifications, discussions, profile/help/settings, admin | ✅ 17/17, 35/35, 31/31, 46/46, 25/25 |
| | **Total** | **590/591; no application defect** |

Suites 1, 6, 7, 8, 10, 12 and 13 are the final runs after the test fixes below (first runs: #1 crashed on a test bug; #6 had 7 failures from stale data and one run artifact; #7 17/18; #8 39/41; #10 108/109; #12 33/35; #13 30/31). The Grammarly hydration warning did not appear on the production build.

### Test-script changes (F2 and fixes found by F1) — no application code changed

| Suite | Change | Why |
|---|---|---|
| `api-security` | Per-division course counts compared with the admin API instead of fixed 1/1 and 0/0 | The owner published a Senior Algebra resource. Assertion kept: counts are per division and published-only |
| `api-security`, `api-mentor` | `login()` accepts a password | My F2 admin sign-in sent the demo password (1 failed attempt, cleared by the next sign-in) |
| `api-security` | Removed `limit` from the admin resource list call | That endpoint rejects `limit` (400) |
| `api-mentor` | Scopes compared with the admin's active mentor assignments instead of "4 courses"; own-scope checks run only with access, otherwise the same calls must be **refused** | Scopes changed by the owner and by the workflow test |
| `e2e-student`, `e2e-mentor`, `e2e-review` | `--read-only` switch skips only the blocks that create or revoke records | F1 must not create data |
| `e2e-review` | The skipped block's 61 s pause is kept | Without it the sign-in burst hit the rate limit (429) |
| `e2e-student` | Ranking and latest alert compared with `/leaderboard/me` and `/notifications` | Junior now has 2 students; newer notifications exist |
| `e2e-mentor` | "Reviews To Do" and mentor.senior's list compared with the API | 2 open reviews now; the owner's "Assignment1" |
| `e2e-admin` | Drafts rows awaited after the filter request | Production build replaced rows after the check |
| `e2e-p6-notifications` | Discussion link checked against its own thread id; "New" badge counted by element, not by the word | A newer discussion exists; titles contain "New" |
| `e2e-p6-discussions` | Fixed an over-escaped pattern (my F2 rewrite) | Topic titles kept their count |
| `e2e-auth`, `e2e-student`, `e2e-mentor` | Grammarly hydration warning ignored (same rule as the other suites) | Browser extension, not the app |

### Side effects of F1
Sign-in audit entries, 7 CSV-export audit entries (approved), 1 failed admin sign-in (my test bug; reset by the next successful sign-in). No records were created or changed.

### Remaining blockers
- Security: S5 (CSP, HSTS), S6 (`npm audit`), S8 (rotate the admin password, remove the stored credentials), S9 (production seed without demo accounts).
- Production: R1–R4, R7, R9; R6 code clean-up (approval).
- Test: fix the mentor download check (#8) to confirm downloads like the CSV check does.
- Open decision: workflow cleanup step 16.

**Recommended next task:** S6 `npm audit` and S5 security headers (no data changes), then the mentor download check fix.

## 7. Results: S5 and S6 (2026-11-06)

### Test defect fixed first
`e2e-mentor` download check: it read the network log once after a fixed 1.5 s; on the production build the response arrived later (status 0). It now waits up to 10 s for the response and also checks that no "Couldn't open this file." error is shown. **41/41.** The application's download code is unchanged.

### S5 — Security headers (no change to `netlify.toml`)

| File | Change |
|---|---|
| `lib/security/headers.ts` (new) | The CSP builder and the static header values |
| `proxy.ts` (new) | Per-request nonce and CSP for pages; **HSTS and `upgrade-insecure-requests` only when the request arrived over HTTPS** (`x-forwarded-proto: https`); `CSP_REPORT_ONLY=true` switches to Report-Only for testing. Excludes `/api`, `_next/static`, `_next/image`, icons and prefetches |
| `next.config.ts` | `headers()` sets X-Frame-Options, X-Content-Type-Options, Referrer-Policy and Permissions-Policy on every response (same values as `netlify.toml`, so they also apply under `next start`) |
| `app/layout.tsx` | `await connection()`: pages render per request, because a nonce exists only at request time |

Policy in production: `default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self' 'nonce-…'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`, plus `upgrade-insecure-requests` over HTTPS. **No `unsafe-inline` and no `unsafe-eval`.** `unsafe-eval` is added only under `next dev`, where React needs it.

Resource inventory before writing the policy: no external scripts, styles or fonts (next/font self-hosts Geist); images are local; the API is same-origin through `/api`; downloads use `blob:` URLs; no iframes, objects, `eval` or `dangerouslySetInnerHTML`. The only external URLs in the code (Unsplash) are in the hidden, unbuilt `app/mentor/_unsupported` page.

Testing approach: Report-Only first, then enforced.

| Check (production build) | Result |
|---|---|
| `next build` | ✅ Proxy included; all routes now dynamic |
| Headers on a page over HTTP | ✅ The 4 static headers + CSP; **no HSTS, no `upgrade-insecure-requests`** |
| Headers on a page over HTTPS (`x-forwarded-proto`) | ✅ Adds `Strict-Transport-Security: max-age=31536000; includeSubDomains` and `upgrade-insecure-requests` |
| Nonce | ✅ Different on every request |
| Report-Only sweep: 48 pages (public, student, mentor, admin) | ✅ All rendered; 1 distinct report: `style-src-attr` inline on the 5 public pages |
| Enforced sweep: same 48 pages | ✅ All rendered; the same single block, no other browser error, no 5xx |
| The one blocked item | `style="color:transparent"` that `next/image` puts on the logo in the server-rendered sign-in card (it only hides alt text while loading). The logo still loads and shows (48×48). **No visible change, so no `unsafe-inline` was added** |
| PDF download (save) | ✅ 200, no violation |
| PDF opened in a new tab (`blob:` URL, real click) | ✅ The tab opens and the browser's PDF viewer renders it (`application/pdf`) |
| Functional regression, enforced: auth / student / mentor / admin / notifications / profile-help | ✅ 19/19, 47/47, 41/41, 109/109, 35/35, 46/46. Profile-help's first run was 45/46: a check read the signed-out back link before the session check finished; it now waits |
| Response time with per-request rendering (local) | 10–13 ms per page |
| `/api` responses | Keep the backend's own headers (its CSP and `X-Frame-Options: SAMEORIGIN`); they are JSON, not pages |

Not verifiable locally: HSTS and `upgrade-insecure-requests` on the real HTTPS host (R9 staging check). On Netlify, `netlify.toml` and `next.config.ts` both send the 4 static headers, with identical values.

### S6 — Dependency audit

**Important:** `npm audit fix --force` was run in the frontend folder at 16:29 (npm log `2026-11-06T14_29_22`), not by Claude. It changed `package.json` and `package-lock.json` (uncommitted): `next` 16.3.0 → ^16.4.5, and `eslint-config-next` 16.3.0 → **^15.5.29 (major downgrade)**, which breaks `eslint` (its config cannot load). These changes were **not reverted**; see the owner decision below. The audits were run read-only on copies of the lockfiles.

**Frontend, committed lockfile (`HEAD`): 15 — critical 1, high 6, moderate 8, low 0**

| Package | Severity | Used at | Exploitable here? | Fix |
|---|---|---|---|---|
| `next` 16.3.0 (direct) | **Critical** (5 RCE advisories), high (Image Optimization SSRF; Server Actions DoS), moderate/low (cache poisoning, `use cache` leaks, metadata disclosure, dev MCP endpoint) | Runtime | **Yes, partly.** Image Optimization is enabled (`next/image`, `/_next/image`), and one RCE affects Windows-hosted servers (Netlify is Linux, but this local host is Windows). The app doesn't use `next/og`, `use cache`, Server Actions, SSG/ISR caching or AVIF/SVG uploads, which limits the rest | **`next@16.4.5`** (same major): recommended |
| `sharp` (optional, via next) | High (libheif, librsvg) | Runtime image optimisation | Only through `/_next/image` with crafted images; this app's images are local | Updated with `next` |
| `nanoid`, `source-map-js` (via postcss) | High (DoS) | Build tooling | No (build time, trusted input) | Patch updates |
| `zod`, `js-yaml`, `brace-expansion`, `minimatch` | High/moderate (DoS) | Dev only (ESLint) | No | Patch updates |
| `eslint-config-next` → `typescript-eslint` chain | Moderate (minimatch DoS) | Dev only | No | npm offers only a **major downgrade** to 15.5.29 (what `--force` applied); not recommended |

**Frontend, current state (after `--force`): 0.** **Backend: 0** (656 packages, 337 production; its files are unchanged).

**Recommendation (needs approval):** keep `next@16.4.5`; set `eslint-config-next` back to the **matching 16.x** (`16.4.5`, the same major as `next`) instead of 15; run `npm install` and a non-forced `npm audit fix`; then `npm audit`, `eslint`, `tsc`, `next build` and the regression. Any remaining dev-only moderate findings would be documented, not force-fixed.

### Remaining security risks
- ~~The frontend dependency state is undecided~~ → resolved in §8.
- S8: rotate the admin password; remove `ROF_ADMIN_USER` / `ROF_ADMIN_PASSWORD` after QA (owner).
- S9: production seed without demo accounts.
- HSTS and `upgrade-insecure-requests` still to verify on the HTTPS host (R9); `preload` is not set (owner decision).
- `/api` responses rely on the backend's headers (`X-Frame-Options: SAMEORIGIN`, its own CSP). Acceptable for JSON.
- `style-src-attr` blocks the logo's `color:transparent` attribute on public pages. Cosmetic only (alt text could flash if the logo failed to load).
- ~~ESLint could not be run on the new files~~ → resolved in §8 (0 errors).

## 8. Dependency fix (owner-approved, 2026-11-06)

| Step | Result |
|---|---|
| `npm install --save-exact next@16.4.5`; `npm install --save-exact -D eslint-config-next@16.4.5` | `package.json`: only these two lines differ from the commit (both pinned exactly, as before the forced fix). npm noted that `unrs-resolver`'s install script is not covered by the project's `allowScripts` setting; left unchanged, ESLint works |
| `npm audit` | **0 critical, 0 high**, 8 moderate (was 1 critical, 6 high, 8 moderate) |
| `npm audit fix` (non-forced; dry run first) | No change: the 8 moderate findings can only be "fixed" by downgrading `eslint-config-next` to 15.x |
| `eslint .` | ✅ 0 errors (1 known warning in the hidden `_unsupported` page); includes the new security files |
| `tsc --noEmit` | ✅ |
| `next build` (Next.js 16.4.5) / `next start` | ✅ / ✅ |
| Headers on the final build | ✅ HTTP: 4 static + CSP, no HSTS. HTTPS: + HSTS and `upgrade-insecure-requests` |
| Full read-only regression (15 suites) | ✅ **591/591, 0 failures** |
| CSP sweep, enforced (48 pages) | ✅ All pages render; downloads 200. Blocked: the logo's style attribute on 5 public pages (known, cosmetic) and **inline `onclick` handlers injected by a browser extension** (`chrome-extension:` source, e.g. `<a id="lessOften" onclick=…>See less often</a>`). Not app code; the CSP correctly blocks them; they vary from run to run and do not appear on a direct visit |

Remaining moderate findings (accepted): `minimatch` ReDoS-type denial of service in the `typescript-eslint` chain used by `eslint-config-next`. **Development only** (ESLint runs on our own source files, never on user input, and is not in the production bundle). The upstream fix needs a newer `typescript-eslint` inside `eslint-config-next`; re-check on the next `eslint-config-next` release.

## 9. Homepage completion and "Coach" wording (2026-11-06)

Scope approved by the owner: public statistics + contact endpoints (one additive migration), admin Messages page, teachers via the contact form, "Mentor" → "Coach" in all visible text. Details: `INTEGRATION_PROGRESS.md` → "Homepage completion".

| Check | Result |
|---|---|
| Backend unit / lint / build / API docs / route coverage | ✅ 449/449 / clean / ✅ / 202 endpoints / 202/202 |
| Backend e2e on `rof-test` | ✅ `public-site` 15/15; full suite 285/286 → 1 stale CSV-header expectation updated → affected files 41/41 |
| Frontend `tsc` / ESLint / `next build` | ✅ / ✅ (1 known warning) / ✅ |
| Homepage suite (production build, CSP enforced) | ✅ 57/57 |
| Admin Messages + Coach wording (read-only) | ✅ 24/24 |
| Full read-only regression (15 suites) | 587/591 on the first run, no app defect: 2 admin-suite checks still expected the old "mentor" wording (updated); 1 sign-in rate-limit check hit 429 from the previous suite's sign-ins in the same minute; 1 intermittent React hydration error #418 in the auth suite (fresh profile, not reproduced). Re-runs: admin ✅ 109/109, review ✅ 18/18, auth ✅ 19/19 twice → **591/591** |

Data written to the main `rof` database by these tests: none, apart from sign-in audit entries. The contact form was sent once with the honeypot filled, which the backend acknowledges without storing or e-mailing; invalid requests returned 400. No registration, application or contact message was stored; no message was marked handled.

Not yet tested end-to-end on `rof` (needs owner approval, see `VERIFICATION_PLAN.md` §7): a real contact message → stored → shown under Admin → Messages → marked handled; e-mail queued once a support e-mail is set.

**Update 2026-11-07:** C1–C3 approved and run (see `VERIFICATION_PLAN.md` §7): real message stored, e-mail queued to the support address, handled/reopened/handled with audit entries. Homepage 61/61 after adding social and partner links and the signed-in redirect; auth 19/19.
