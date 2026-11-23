# Deploying the ROF LMS frontend (Vercel)

The frontend is a Next.js 16 app hosted on **Vercel** only (owner decision 2026-11-24: Netlify is no longer used).
Production address: **`https://lms.rwandaolympiadfoundation.org`** (Vercel project, its own domain).
Production backend: **`https://rofbackendtest.onrender.com`** (ROFBACKENDTEST on Render).

## 1. How the browser reaches the backend

- **Every `/api/*` request** goes to the frontend's own domain; `next.config.ts` rewrites it to the backend
  (`API_PROXY_TARGET`). The browser therefore talks to one origin: no CORS for normal calls, and the backend's
  `SameSite=Strict` refresh cookie is sent.
- **File uploads only** go straight to the backend (`NEXT_PUBLIC_API_UPLOAD_ORIGIN`), because a hosting proxy limits
  request bodies (a few MB) and time, while the backend accepts files up to 50 MB.

## 2. Vercel project settings (owner)

1. The Vercel project is connected to the `ROFFRONTENDTEST` repository; production builds from **`main`**. Every pull
   request gets a **preview** deployment automatically (this replaces the former Netlify staging and preview sites).
2. **Environment Variables** (Project → Settings → Environment Variables). They are public addresses, not secrets, and
   are read at build time, so redeploy after changing them:

   | Variable | Production | Preview |
   |---|---|---|
   | `API_PROXY_TARGET` | `https://rofbackendtest.onrender.com` | the staging backend's address (or the production one if there is no staging backend) |
   | `NEXT_PUBLIC_API_UPLOAD_ORIGIN` | `https://rofbackendtest.onrender.com` | the same backend as `API_PROXY_TARGET` |
   | `NEXT_PUBLIC_SITE_URL` | `https://lms.rwandaolympiadfoundation.org` (optional; the default) | — |

   A Vercel build stops with a clear message if `API_PROXY_TARGET` is missing or points at `localhost`
   (`next.config.ts`).
3. **Domain:** `lms.rwandaolympiadfoundation.org` is attached to the project (DNS → Vercel). Vercel issues and renews
   the HTTPS certificate.
4. Search engines index the **production** deployment only: previews answer `noindex` and a robots file that disallows
   everything (`lib/site/seo.ts`, based on Vercel's `VERCEL_ENV`).

No other secrets are needed by the frontend. Never put passwords, tokens or admin credentials in Vercel variables or in
the repository.

## 3. Backend settings (on Render, by the owner)

| Backend variable | Value | Why |
|---|---|---|
| `NODE_ENV` | `production` | Makes the refresh cookie `Secure` and enables the production checks |
| `APP_URL` | `https://lms.rwandaolympiadfoundation.org` | The links in activation, password-reset and notification e-mails point here |
| `CORS_ORIGINS` | `https://lms.rwandaolympiadfoundation.org` | **Exactly the site's address** (scheme + host, no trailing slash; several separated by commas). Uploads go straight to the backend and are refused by the browser if this is wrong. Remove any old `*.netlify.app` address |
| `TRUST_PROXY` | **`1`** (Render's default in `render.yaml`). **Never `2` or higher.** | Only Render's own proxy is trusted, so rate limits use the visitor's real address |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend key; `Rwanda Olympiad Foundation <info@rwandaolympiadfoundation.org>` | Required in production for invitation, activation and reset e-mails (backend `docs/EMAIL.md`) |

## 4. Check the deployed site

1. Open `/`: the public homepage with live community numbers (`/api/v1/public/statistics` → 200); `/login` shows the sign-in page.
2. Sign in with a test account: the Network tab shows `/api/v1/auth/login` → 200 on `lms.rwandaolympiadfoundation.org`, not on the backend's domain.
3. Reload: you stay signed in (the refresh cookie works).
4. Download a course resource: it opens or saves.
5. As a coach, upload a resource larger than 8 MB: it succeeds, and in the Network tab the upload goes to `rofbackendtest.onrender.com`. A CORS error means `CORS_ORIGINS` is wrong.
6. Sign out: you return to `/login` and a reload keeps you signed out.
7. Open an activation or reset link from an e-mail: it points to `lms.rwandaolympiadfoundation.org` (`APP_URL` is right).
8. Open a preview deployment's `/robots.txt`: it disallows everything; production's lists the public pages.

## 5. Known limits

- **Large uploads.** Kept off the proxy (point 1). If `NEXT_PUBLIC_API_UPLOAD_ORIGIN` is empty, large uploads fail through the proxy.
- **Shared rate limits behind the proxy.** Calls made through the proxy reach the backend from Vercel's addresses; the backend's per-address limits are sized for that (backend `docs/SIGN-IN-RATE-LIMIT-PROPOSAL.md`).
- **A sleeping backend.** On a Render plan that sleeps, the first request after idle time takes about a minute; the frontend retries and says so in plain words. An always-on Render plan avoids it.
