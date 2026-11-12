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
3. The build passing locally: `npm ci && npm run typecheck && npm run lint && npm test && npm run build` (CI runs the same on every pull request).

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
| `TRUST_PROXY` | **`1`** (Render's default in `render.yaml`). **Never `2` or higher.** | With `1` the backend trusts only Render's own proxy, so requests that reach Render directly (file uploads, direct calls) are rate-limited by the visitor's real address. A higher value makes the backend believe the `X-Forwarded-For` header, which any caller can forge to pick their own rate-limit key and get around the sign-in and refresh limits. **Known limitation:** requests through the Netlify proxy reach the backend from Netlify's outgoing addresses, so visitors who use the site share rate-limit keys and a whole class can be throttled (see §5). Do not work around this by raising `TRUST_PROXY` or the rate limits |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend key; `Rwanda Olympiad Foundation <info@rwandaolympiadfoundation.org>` (no quotes) | Required in production. Without them, invitations and reset e-mails are not delivered (backend `docs/EMAIL.md`) |

## 4. Check the deployed site

1. Open the site: `/` shows the public homepage with live community numbers (`/api/v1/public/statistics` → 200 JSON); `/login` shows the sign-in page.
2. Sign in with a demo account. The browser's Network tab should show `/api/v1/auth/login` → 200 on the **Netlify** domain, not the backend's.
3. Reload the page: you stay signed in, which means the refresh cookie works.
4. Download a file (a course resource): it opens or saves.
5. As a coach, upload a resource larger than 8 MB: a progress box shows the percentage, then "saving the files…", and the upload succeeds. In the Network tab, the upload request goes to `rofbackendtest.onrender.com` (all other calls stay on the Netlify domain). A CORS error here means the backend's `CORS_ORIGINS` doesn't match this site's address.
6. Sign out: you return to `/login`, and a reload keeps you signed out.
7. Open an activation or reset link from a backend e-mail: it should point to the Netlify site, which confirms `APP_URL` is right.

## 5. Known limits on Netlify

- **Large uploads and downloads.** Netlify's proxy limits request bodies (about 8 MB) and time (about 26 s); its serverless functions have stricter limits still. That is why API calls use the CDN proxy rule (not the Next.js function) and uploads go straight to the backend. If you change the backend address, update `API_PROXY_TARGET`, `NEXT_PUBLIC_API_UPLOAD_ORIGIN` **and** the `[[redirects]]` target together.
- **Shared rate limits behind the proxy.** The backend limits requests per client address (all API calls; sign-in and session refresh more tightly). Calls made through the `/api` proxy arrive from Netlify's outgoing addresses, not the visitor's, so many visitors share the same limits: a class signing in together can get "Too many requests" (429) answers. Measured on 2026-11-12: direct requests were counted per visitor, proxied requests per Netlify address. Keep `TRUST_PROXY` at `1` (§3) and do not raise the limits as a workaround. The fix is separate backend work, not part of this frontend: the backend must first verify that a request really came through this site's Netlify proxy (Netlify's signed proxy requests) before it trusts the visitor address Netlify reports, and it must limit signed-in traffic per user and session rather than per address. It must be verified on a non-production (staging) environment before it is turned on in production. A custom API domain (e.g. `api.<your-domain>`, called directly by the browser) would remove the proxy from API calls altogether.
- **Render free plan wakes slowly.** After about 15 idle minutes the backend sleeps and the next request takes about a minute — longer than Netlify's proxy waits. The first request after a quiet period can therefore fail with a 502/504; a reload a minute later works. An uptime monitor pinging `/health` every 5–10 minutes, or Render's paid plan, avoids this.
- **Next.js 16 support.** Netlify's Next.js runtime is Netlify's own integration, not a Next.js-verified adapter (see the Next.js deployment docs). If a build fails because of the runtime, check Netlify's Next.js documentation for the supported versions.
- **Previews.** Deploy previews (`https://deploy-preview-N--roflms.netlify.app`) talk to the same production backend (the values in `netlify.toml` apply to every context). Sign-in and browsing work there, but **file uploads fail with a CORS error** because the preview address is not in the backend's `CORS_ORIGINS`; test uploads on the production site. The backend's `APP_URL` can only point to one site, so e-mail links always open production.

## 6. Deploying from the command line (optional)

```bash
npm install -g netlify-cli
netlify login
netlify link            # choose the site
netlify deploy --build  # preview deploy
netlify deploy --build --prod
```

The CLI uses the same `netlify.toml` and the site's environment variables.
