# Browser end-to-end tests (Playwright)

The real frontend against the real backend and a **disposable local PostgreSQL** (synthetic data only — the setup
refuses any database host other than `127.0.0.1` / `localhost`). No mocked API for the main workflows.

1. Backend (its checkout): `npx prisma migrate deploy` and `SEED_ADMIN_PASSWORD=… SEED_DEMO=true npx prisma db seed`
   on the test database, then `npm run build` and start it:
   `PORT=4100 NODE_ENV=development DATABASE_URL=<test db> JWT_SECRET=<long random> TEACHERS_ENABLED=true HEAD_COACHES_ENABLED=true APP_URL=http://localhost:3100 node dist/main.js`
2. Frontend: `API_PROXY_TARGET=http://127.0.0.1:4100 npm run build` then `API_PROXY_TARGET=http://127.0.0.1:4100 npx next start -p 3100`.
3. Here: `npx playwright install chromium` once, then
   `E2E_BASE_URL=http://localhost:3100 E2E_DATABASE_URL=<test db> E2E_ADMIN_PASSWORD=<seed password> npx playwright test`.

The global setup creates one synthetic account per role (Super Admin, Coach, Head Coach, Teacher, Student) with a known
password. The backend allows 10 sign-ins per minute per address — the limit is not weakened for tests: each role
signs in once per test file, and full runs should be a minute apart. Projects: `desktop` (1440×900) and `mobile`
(Pixel 7, files ending in `.mobile.spec.ts`). Reports: `e2e/report` (not committed).
