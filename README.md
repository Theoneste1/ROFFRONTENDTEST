# ROF LMS — Frontend

The web frontend of the Rwanda Olympiad Foundation Mathematics LMS. It has three portals: student, mentor and administrator. The backend is the NestJS API in the sibling folder `ROFBACKENDTEST`.

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · TanStack Query 5 · lucide-react.

## Running locally

1. **Start the backend** (`ROFBACKENDTEST`; see its README). It listens on `http://localhost:3000`.
2. **Configure the frontend:**
   ```bash
   cp .env.example .env.local      # API_PROXY_TARGET=http://localhost:3000
   npm install
   ```
3. **Run** on port 3001:
   ```bash
   npm run dev                     # http://localhost:3001
   ```

The browser talks only to the Next.js server. `next.config.ts` proxies every `/api/*` request to the backend, so the app and the API share one origin. No CORS is needed, and the backend's `SameSite=Strict` refresh cookie works.

### Backend setting the frontend needs

E-mailed activation and password-reset links are built from the backend's `APP_URL`. Set it in `ROFBACKENDTEST/.env`:

```
APP_URL=http://localhost:3001
```

`CORS_ORIGINS` does not need to change, because the browser never calls port 3000 directly. In production, set `APP_URL` to the public frontend URL and serve the frontend and the API on the same site.

### Demo accounts (backend seeded with `SEED_DEMO=true`)

| Username | Password | Role |
|---|---|---|
| `mentor.junior`, `mentor.senior` | `Demo1234` | Mentor |
| `student.s2` (Junior), `student.s5` (Senior) | `Demo1234` | Student |
| `admin` | printed once by the seed, or `SEED_ADMIN_PASSWORD` | Administrator |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server on port 3001 |
| `npm run build` / `npm start` | Production build / server on port 3001 |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |

## Code layout

```
app/
  (auth)/            public pages: login, activate, forgot-password, reset-password, support
  admin/ mentor/ student/   the three portals (each wrapped in RoleGate)
  assignments/ results/ courses/ discussions/   role-neutral notification links → redirect per role
  components/
    account/         profile, password, notification preferences
    auth/            RoleGate, password fields
    discussions/     discussion panel and thread page
    notifications/   bell, inbox, deep-link redirect
    shell/           PortalNavbar, NavbarUser, SidebarUtilities, SignOutButton, PublicCard
    ui/              loading / error / empty states, form controls, page frame
  providers.tsx      TanStack Query + session provider
lib/
  api/               HTTP client, error type, endpoint modules, API types
  auth/              session provider, role → portal routing
  notifications/     notification link → role page
  query/             QueryClient defaults, query keys
```

## Conventions

- **All API calls go through `lib/api/client.ts`.** It keeps the access token in memory and refreshes once on a 401 (single-flight, and serialised across tabs with Web Locks, because refresh tokens rotate). It throws `ApiError` with the backend's `code`.
- **Server state uses TanStack Query.** Keys live in `lib/query/keys.ts`, and mutations invalidate the keys they change.
- **Branch on `error.code`, never on `message`.**
- **Hiding UI by role or permission is a courtesy.** The backend enforces every rule.

Project documents: `DEPLOYMENT.md` (Netlify), `INTEGRATION.md` (how this app and the backend work together), `FRONTEND_AUDIT.md`, `BACKEND_AUDIT.md`, `INTEGRATION_MAPPING.md`, `IMPLEMENTATION_ROADMAP.md`, `INTEGRATION_PROGRESS.md`, `PHASE5_ADMIN_PLAN.md`, `PHASE6_PLAN.md`.
