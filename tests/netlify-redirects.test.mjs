// Each Netlify site proxies /api/* to ITS OWN backend (scripts/netlify-redirects.mjs): the address comes from the site's
// API_PROXY_TARGET, never from netlify.toml (the staging site once used the production backend that way).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { redirectsFor } from "../scripts/netlify-redirects.mjs";

const STAGING = "https://rof-backend-staging.onrender.com";

test("the /api rule points at the site's own backend", () => {
  const r = redirectsFor({ API_PROXY_TARGET: `${STAGING}/`, NEXT_PUBLIC_API_UPLOAD_ORIGIN: STAGING });
  assert.equal(r.error, undefined);
  assert.match(r.text, /^\/api\/\*  https:\/\/rof-backend-staging\.onrender\.com\/api\/:splat  200!$/m);
});

test("refused: missing, not https, local, with a path, or uploads to another backend", () => {
  const bad = [
    {},
    { API_PROXY_TARGET: "http://rof-backend-staging.onrender.com", NEXT_PUBLIC_API_UPLOAD_ORIGIN: STAGING },
    { API_PROXY_TARGET: "https://localhost", NEXT_PUBLIC_API_UPLOAD_ORIGIN: "https://localhost" },
    { API_PROXY_TARGET: `${STAGING}/api`, NEXT_PUBLIC_API_UPLOAD_ORIGIN: STAGING },
    { API_PROXY_TARGET: STAGING },
    { API_PROXY_TARGET: STAGING, NEXT_PUBLIC_API_UPLOAD_ORIGIN: "https://rofbackendtest.onrender.com" },
  ];
  for (const env of bad) assert.ok(redirectsFor(env).error, JSON.stringify(env));
});

test("netlify.toml names no backend in its settings or rules (only in comments)", () => {
  const settings = readFileSync("netlify.toml", "utf8").split(/\r?\n/).filter((l) => !l.trim().startsWith("#")).join("\n");
  assert.doesNotMatch(settings, /onrender\.com|API_PROXY_TARGET|NEXT_PUBLIC_API_UPLOAD_ORIGIN|\[\[redirects\]\]/);
  assert.match(settings, /command = "node scripts\/netlify-redirects\.mjs && npm run build"/);
});
