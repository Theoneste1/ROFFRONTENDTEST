# Browser end-to-end tests (Playwright)

The real frontend against the real backend and a **disposable local PostgreSQL** (synthetic data only — the setup
refuses any database host other than `127.0.0.1` / `localhost`). No mocked API for the main workflows.

1. Backend (its checkout): `npx prisma migrate deploy` and `SEED_ADMIN_PASSWORD=… SEED_DEMO=true npx prisma db seed`
   on the test database, then `npm run build` and start it:
   `PORT=4100 NODE_ENV=development SIGNIN_TRUSTED_CLIENT_ADDRESS=true DATABASE_URL=<test db> JWT_SECRET=<long random> TEACHERS_ENABLED=true HEAD_COACHES_ENABLED=true APP_URL=http://localhost:3100 node dist/main.js`
2. Frontend: `API_PROXY_TARGET=http://127.0.0.1:4100 npm run build` then `API_PROXY_TARGET=http://127.0.0.1:4100 npx next start -p 3100`.
3. Here: `npx playwright install chromium` once, then
   `E2E_BASE_URL=http://localhost:3100 E2E_API_URL=http://127.0.0.1:4100 E2E_DATABASE_URL=<test db> E2E_ADMIN_PASSWORD=<seed password> npx playwright test`.

The global setup creates one synthetic account per role (Super Admin, Coach, Head Coach, Teacher, Student) with a known
password. Sign-in limits are not weakened for tests: 60 sign-ins a minute per address, and 5 a minute / 20 an hour per
username. Every connection here is direct from `127.0.0.1` (no proxy), so the client address is trustworthy and the backend
runs with `SIGNIN_TRUSTED_CLIENT_ADDRESS=true`: an address that already signed in as a user is not held by that user's
username limits (the real-deployment setting stays unset until the client address is verified — see the backend's
`docs/operations/CLIENT-IP-VERIFICATION.md`). Without it, a full run signs in as the Administrator more than 20 times in an
hour and is refused (429), as designed.

| Spec | Covers |
|---|---|
| `role-journeys`, `sidebar`, `sidebar.mobile` | every portal, navigation, refusal of other portals |
| `date-of-birth-step`, `privacy`, `teacher-student-access` | first-sign-in date of birth, picture privacy, teacher access |
| `registration-forms` | student sign-up with and without the optional picture, teacher and coach applications, closed form (REG-02/05/06/08, UX-01) |
| `application-review` | Administrator asks for information, rejects with a reason, approves (REG-10) |
| `admin-users` | bulk suspend with preview and reason, account history, CSV export, e-mail preferences (ACC-09/11, REG-12, NOT-03) |
| `countries` | countries (owner decision 2026-11-19): an Administrator corrects a country on the Countries screen (audited); students register with a school abroad and in Rwanda (INT-01, INT-02, REG-03) |
| `accessibility` | axe-core WCAG 2.0/2.1 A + AA on the key pages of every portal: no serious or critical violation (PERF-03) |

Projects: `desktop` (1440×900) and `mobile` (Pixel 7, files ending in `.mobile.spec.ts`). Reports: `e2e/report` (not
committed).
