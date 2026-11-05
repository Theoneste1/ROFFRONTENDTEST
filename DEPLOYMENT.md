# Deploying the ROF LMS frontend to Netlify

The frontend is a Next.js 16 app. Netlify builds it and runs it with its built-in Next.js runtime: there is no plugin to install.

The browser talks **only** to the Netlify site. Every `/api/*` request is proxied to the backend (`next.config.ts` → `API_PROXY_TARGET`). The frontend and the API therefore share one origin, and the backend's `SameSite=Strict` refresh cookie works.

## 1. Before you start

You need:

1. **The backend (ROFBACKENDTEST) running somewhere public over HTTPS**, for example `https://api.example.org`. Netlify only hosts the frontend; it cannot reach `localhost`.
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

3. Under **Site configuration → Environment variables**, add this **before the first build**:

   | Variable | Value | Notes |
   |---|---|---|
   | `API_PROXY_TARGET` | `https://api.example.org` | The backend's public address. No trailing slash and no `/api`. It is read **at build time**, so trigger a new deploy after changing it |

   The build stops with a clear error if this variable is missing or points to `localhost`, so a broken site is never published.

4. Deploy. Note the site address, for example `https://rof-lms.netlify.app`, or your custom domain.

No other secrets are needed by the frontend. Do not put passwords, tokens or admin credentials in Netlify variables, `netlify.toml` or the repository.

## 3. Backend settings (on the backend server, by the owner)

The frontend's address must be known to the backend. Set these in the **backend's** environment and restart it:

| Backend variable | Value | Why |
|---|---|---|
| `NODE_ENV` | `production` | Makes the refresh cookie `Secure` (HTTPS only) and enables the production checks |
| `APP_URL` | `https://rof-lms.netlify.app` | The links in activation, password-reset and notification e-mails point here |
| `CORS_ORIGINS` | `https://rof-lms.netlify.app` | Required by the backend in production. Browsers don't make cross-origin calls in this setup (everything goes through the proxy), but the backend refuses to start without it |
| `TRUST_PROXY` | the number of proxies in front of the backend | The backend limits sign-ins **per client IP** (10 per minute). Behind Netlify, requests arrive from Netlify's servers, so the backend must read the client's address from `X-Forwarded-For`. Use the number of proxy hops; if this is wrong, all users may share one rate-limit bucket |
| `SMTP_*` | the mail server | Required in production. Without it, invitations and reset e-mails are not delivered |

## 4. Check the deployed site

1. Open the site: `/` redirects to `/login`.
2. Sign in with a demo account. The browser's Network tab should show `/api/v1/auth/login` → 200 on the **Netlify** domain, not the backend's.
3. Reload the page: you stay signed in, which means the refresh cookie works.
4. Download a file (a course resource): it opens or saves.
5. Sign out: you return to `/login`, and a reload keeps you signed out.
6. Open an activation or reset link from a backend e-mail: it should point to the Netlify site, which confirms `APP_URL` is right.

## 5. Known limits on Netlify

- **Large uploads.** The proxy runs inside Netlify's serverless functions. Netlify limits the request size and duration of functions, and the backend accepts resources up to 50 MB. Uploads larger than Netlify's request limit (a few MB) may fail with a 413 or 5xx error even though the backend would accept them.
  - **Fix:** let Netlify's CDN proxy `/api/*` directly, which bypasses the functions. Add this to `netlify.toml`, with your backend address:

    ```toml
    [[redirects]]
      from = "/api/*"
      to = "https://api.example.org/api/:splat"
      status = 200
      force = true
    ```

  - Then test an upload over 6 MB. Keep `API_PROXY_TARGET` set, because the build still needs it.
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
