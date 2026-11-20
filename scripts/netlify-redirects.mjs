#!/usr/bin/env node
/**
 * Netlify, before `next build`: writes `public/_redirects` so the CDN proxies `/api/*` to THIS site's backend, taken
 * from the site's own environment variable API_PROXY_TARGET (Netlify dashboard → Site configuration → Environment
 * variables). The staging site and the production site build the same repository; each must reach its own backend,
 * so the address is never written in netlify.toml (it once was, and the staging site then used the production backend).
 *
 * Refuses (exit 1, the deploy stops) when, on Netlify:
 *   - API_PROXY_TARGET is missing, not https, or local;
 *   - NEXT_PUBLIC_API_UPLOAD_ORIGIN is missing or is not the same backend (uploads would go to another server).
 * Locally (NETLIFY unset) nothing is written: next.config.ts's rewrite proxies /api/* to API_PROXY_TARGET.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The redirect rule, or an error message. Pure (tested in tests/netlify-redirects.test.mjs). */
export function redirectsFor(env) {
  const raw = (env.API_PROXY_TARGET ?? '').trim().replace(/\/+$/, '');
  let target;
  try {
    target = new URL(raw);
  } catch {
    return { error: 'API_PROXY_TARGET is not set (or not a URL). Set it to this site\'s backend, e.g. https://rof-backend-staging.onrender.com, in the Netlify environment variables.' };
  }
  if (target.protocol !== 'https:') return { error: `API_PROXY_TARGET must use https (got ${target.protocol}).` };
  if (['localhost', '127.0.0.1', '0.0.0.0'].includes(target.hostname)) return { error: 'API_PROXY_TARGET must be a public backend, not localhost.' };
  if (target.pathname !== '/' && target.pathname !== '') return { error: 'API_PROXY_TARGET must be the backend address without a path (no /api).' };
  const upload = (env.NEXT_PUBLIC_API_UPLOAD_ORIGIN ?? '').trim().replace(/\/+$/, '');
  if (!upload) return { error: 'NEXT_PUBLIC_API_UPLOAD_ORIGIN is not set: set it to the same backend address as API_PROXY_TARGET.' };
  let uploadOrigin;
  try {
    uploadOrigin = new URL(upload).origin;
  } catch {
    return { error: 'NEXT_PUBLIC_API_UPLOAD_ORIGIN is not a URL.' };
  }
  if (uploadOrigin !== target.origin) {
    return { error: `NEXT_PUBLIC_API_UPLOAD_ORIGIN (${uploadOrigin}) must be the same backend as API_PROXY_TARGET (${target.origin}).` };
  }
  return {
    origin: target.origin,
    text: [
      '# Written at build time by scripts/netlify-redirects.mjs from API_PROXY_TARGET — do not edit or commit.',
      '# The CDN proxies /api/* to this site\'s backend (same origin for the browser: the SameSite=Strict refresh cookie works).',
      `/api/*  ${target.origin}/api/:splat  200!`,
      '',
    ].join('\n'),
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (process.env.NETLIFY !== 'true') {
    console.log('netlify-redirects: not on Netlify, nothing written (next.config.ts proxies /api locally).');
  } else {
    const r = redirectsFor(process.env);
    if (r.error) {
      console.error(`netlify-redirects: ${r.error}`);
      process.exit(1);
    }
    const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', '_redirects');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, r.text);
    console.log(`netlify-redirects: /api/* → ${r.origin}/api/ (public/_redirects).`);
  }
}
