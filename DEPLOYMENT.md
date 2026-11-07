# Deploying the ROF LMS frontend to Netlify

The frontend is a Next.js 16 app. Netlify builds it and runs it with its built-in Next.js runtime: there is no plugin to install.

Production backend: **`https://rofbackendtest.onrender.com`** (ROFBACKENDTEST on Render). It is set in `netlify.toml`, so no Netlify variable is needed.

How the browser reaches the API:

- **Every `/api/*` request** goes to the Netlify site, and Netlify's CDN proxies it to the backend (`[[redirects]]` in `netlify.toml`; locally, the rewrite in `next.config.ts`). The frontend and the API share one origin, so the backend's `SameSite=Strict` refresh cookie works.
- **File uploads only** go straight to the backend (`NEXT_PUBLIC_API_UPLOAD_ORIGIN`), because Netlify's proxy limits request bodies (about 8 MB) and time (about 26 s), while the backend accepts files up to 50 MB. Uploads carry the access token, never cookies; the backend allows them through `CORS_ORIGINS`.

## 1. Before you start

You need:

1. **The backend (ROFBACKENDTEST) running publicly over HTTPS**: `https://rofbackendtest.onrender.com`, check `/health`. Netlify only hosts the frontend; it cannot reach `localhost`.
2. The frontend in a Git repository that Netlify can read (GitHub, GitLab or Bitbucket), or the Netlify CLI for manual deploys.
3. The build passing locally: `npm ci && npm run typecheck && npm run lint && npm run build`.

## 2. Create the site

1. In Netlify, choose **Add new site → Import an existing project** and pick the repository.
2. The build settings are read from `netlify.toml`:

   | Setting | Value |
   |---|---|
   | Build command | `npm run build` |
   | Publish directory | `.next` |
   | Node.js | 22 (`NODE_VERSION`); Next.js 16 needs 20.9 or newer |

3. The backend address is already in `netlify.toml` (`[build.environment]`): `API_PROXY_TARGET` and `NEXT_PUBLIC_API_UPLOAD_ORIGIN` = `https://rofbackendtest.onrender.com`, plus the `/api/*` proxy rule. **Nothing needs to be set in the Netlify dashboard.** To use another backend, change all three in `netlify.toml` and redeploy (they are read at build time). The build stops with a clear error if `API_PROXY_TARGET` points to `localhost`.

4. Deploy. Note the site address, for example `https://roflms.netlify.app`, or your custom domain.

No other secrets are needed by the frontend. Do not put passwords, tokens or admin credentials in Netlify variables, `netlify.toml` or the repository.

## 3. Backend settings (on the backend server, by the owner)

The frontend's address must be known to the backend. Set these in the **backend's** environment and restart it:

| Backend variable | Value | Why |
|---|---|---|
| `NODE_ENV` | `production` | Makes the refresh cookie `Secure` (HTTPS only) and enables the production checks |
| `APP_URL` | `https://roflms.netlify.app` | The links in activation, password-reset and notification e-mails point here |
| `CORS_ORIGINS` | `https://roflms.netlify.app` | **Must be exactly this site's address** (scheme + host, no trailing slash; several separated by commas, e.g. with a custom domain). File uploads go straight to the backend and are refused by the browser if this is wrong |
| `TRUST_PROXY` | the number of proxies in front of the backend | The backend limits sign-ins **per client IP** (10 per minute). Requests arrive through Netlify's CDN and Render's proxy, so the backend must read the client's address from `X-Forwarded-For`. Start with `1` (Render's default in `render.yaml`); if everyone shares one rate-limit bucket after go-live, use `2` (see the backend's `deploy/render/README.md` §6) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend key; `Rwanda Olympiad Foundation <info@rwandaolympiadfoundation.org>` (no quotes) | Required in production. Without them, invitations and reset e-mails are not delivered (backend `docs/EMAIL.md`) |

## 4. Check the deployed site

1. Open the site: `/` redirects to `/login`.
2. Sign in with a demo account. The browser's Network tab should show `/api/v1/auth/login` → 200 on the **Netlify** domain, not the backend's.
3. Reload the page: you stay signed in, which means the refresh cookie works.
4. Download a file (a course resource): it opens or saves.
5. As a coach, upload a resource larger than 8 MB: it succeeds. In the Network tab, the upload request goes to `rofbackendtest.onrender.com` (all other calls stay on the Netlify domain). A CORS error here means the backend's `CORS_ORIGINS` doesn't match this site's address.
6. Sign out: you return to `/login`, and a reload keeps you signed out.
7. Open an activation or reset link from a backend e-mail: it should point to the Netlify site, which confirms `APP_URL` is right.

## 5. Known limits on Netlify

- **Large uploads and downloads.** Netlify's proxy limits request bodies (about 8 MB) and time (about 26 s); its serverless functions have stricter limits still. That is why API calls use the CDN proxy rule (not the Next.js function) and uploads go straight to the backend. If you change the backend address, update `API_PROXY_TARGET`, `NEXT_PUBLIC_API_UPLOAD_ORIGIN` **and** the `[[redirects]]` target together.
- **Render free plan wakes slowly.** After about 15 idle minutes the backend sleeps and the next request takes about a minute — longer than Netlify's proxy waits. The first request after a quiet period can therefore fail with a 502/504; a reload a minute later works. An uptime monitor pinging `/health` every 5–10 minutes, or Render's paid plan, avoids this.
- **Next.js 16 support.** Netlify's Next.js runtime is Netlify's own integration, not a Next.js-verified adapter (see the Next.js deployment docs). If a build fails because of the runtime, check Netlify's Next.js documentation for the supported versions.
- **Previews.** Deploy previews use the same `API_PROXY_TARGET`, so they talk to the same backend. For a separate test backend, set a different value for the "Deploy Previews" context in the Netlify variables. The backend's `APP_URL` can only point to one site.

## 6. Deploying from the command line (optional)

```bash
npm install -g netlify-cli
netlify login
netlify link            # choose the site
netlify deploy --build  # preview deploy
netlify deploy --build --prod
```

The CLI uses the same `netlify.toml` and the site's environment variables.
