# Frontend finalization report (2026-11-07)

Repository `ROFFRONTENDTEST` · Next.js 16 · production `https://roflms.netlify.app` (Netlify) ·
backend `https://rofbackendtest.onrender.com`. How it works with the backend: [INTEGRATION.md](INTEGRATION.md).
Deployment: [DEPLOYMENT.md](DEPLOYMENT.md).

Statuses: Completed and tested · Completed but not fully tested · Failed and fixed · Partially completed · Not completed · Requires owner action.

## Live site

`https://roflms.netlify.app` currently answers Netlify's **"Page not found" on every path** (no build of
this app is served). A clean build of `main` with Netlify's settings stops with
`API_PROXY_TARGET must be set…` — the guard in `next.config.ts` — because `main` expects that variable in
the Netlify dashboard. `feature/production-readiness` sets it in `netlify.toml` and builds cleanly from a
fresh clone. **Failed and fixed (not deployed).**

## Checks

| Check | Result | Status |
|---|---|---|
| Lint | 0 errors (1 warning in the private, unserved `_unsupported` folder) | Completed and tested |
| Type-check | clean | Completed and tested |
| Production build (Netlify settings, clean clone) | 66 routes | Completed and tested |
| API compatibility | All 83 endpoints called exist in the backend (method + path) | Completed and tested |
| Pages render (served by the production build locally) | `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/activate`, `/apply`, `/support` → 200 | Completed and tested |
| Student/coach/admin features through the UI's API calls | 39/39 general + 26/26 assessment journeys (see INTEGRATION.md) | Completed and tested (API level) |
| Mock data, dead links, empty buttons, images without alt | none found (static scan) | Completed and tested |
| Responsive design, visual check, keyboard use | no browser available in this session | Not completed — owner checklist |

## Fixed in this phase

| Problem | Fix | Status |
|---|---|---|
| Netlify build failed without a dashboard variable | Backend URL in `netlify.toml` | Failed and fixed |
| Uploads over ~8 MB would fail through Netlify's proxy (backend allows 50 MB) | Uploads go straight to the backend (`NEXT_PUBLIC_API_UPLOAD_ORIGIN`, CSP `connect-src`, bearer token only) — 12 MB tested locally cross-origin | Completed but not fully tested (Netlify) |
| API calls through Netlify's function (cold starts, response limits for large downloads) | `/api/*` CDN proxy rule in `netlify.toml` | Completed but not fully tested (Netlify) |
| No CI | `.github/workflows/ci.yml`: lint, type-check, Netlify build | Completed, runs on the first pull request |

## Outstanding

- Pages for academic years, bulk e-mail and the activity log (backend APIs exist; planned as optional).
- Quizzes, online exams and automatic marking are not part of the system.
- Browser checks on the live site (after deploy) — see the checklist below.

## Deploying this repository

1. Push `feature/production-readiness` and open a pull request into `main`; the new CI runs.
2. Merge. Netlify builds `main` with `netlify.toml` — no dashboard variables needed (an existing
   `API_PROXY_TARGET` in the dashboard must be the same backend address, or be removed).
3. Netlify → Deploys: the deploy must say **Published**; the log shows the Next.js runtime.
4. Check: `https://roflms.netlify.app/` loads, `/api/v1/public/statistics` returns JSON.

## Owner checklist after deploy

1. Phone and desktop: home page, login, each dashboard (student, coach, admin) — layout and menus.
2. Sign in, reload: still signed in. Sign out, reload: still signed out.
3. Coach: upload a resource over 8 MB; in the browser's Network tab the upload goes to `rofbackendtest.onrender.com`.
4. Student: open the resource, download it.
5. Full assessment once with test accounts: assignment → solution upload → marking → publish → student sees mark and feedback.
6. Forgot password with your own address: the e-mail arrives, the link opens `roflms.netlify.app/reset-password`, the new password works.
7. Student tries an admin URL (`/admin/dashboard`): refused.
