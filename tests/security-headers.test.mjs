// The Content-Security-Policy (lib/security/headers.ts). Answer pages that are PDFs show in the browser's own PDF
// viewer inside the page (owner 2026-11-26): frames are allowed only from the app itself and blob: URLs (files the
// app fetched with the user's sign-in); never another site; plugins stay off; the app is never framed.
import { test } from "node:test";
import assert from "node:assert/strict";

import { contentSecurityPolicy } from "../lib/security/headers.ts";

const directives = (csp) => Object.fromEntries(csp.split(";").map((d) => d.trim()).filter(Boolean).map((d) => {
  const [name, ...values] = d.split(/\s+/);
  return [name, values];
}));

test("frames: only 'self' and blob: (PDF answer pages); objects off; the app is never framed", () => {
  const d = directives(contentSecurityPolicy({ nonce: "abc", isDev: false, https: true }));
  assert.deepEqual(d["frame-src"], ["'self'", "blob:"]);
  assert.deepEqual(d["object-src"], ["'none'"]);
  assert.deepEqual(d["frame-ancestors"], ["'none'"]);
  assert.ok(!d["frame-src"].some((v) => v === "*" || v.startsWith("http")), "no other site can be framed");
});

test("scripts and styles keep the nonce; images still allow blob: and data:", () => {
  const d = directives(contentSecurityPolicy({ nonce: "n0nce", isDev: false, https: false }));
  assert.ok(d["script-src"].includes("'nonce-n0nce'"));
  assert.ok(!d["script-src"].includes("'unsafe-eval'"), "no eval outside development");
  assert.ok(d["style-src"].includes("'nonce-n0nce'"));
  assert.deepEqual(d["img-src"], ["'self'", "blob:", "data:"]);
  assert.equal(d["upgrade-insecure-requests"], undefined, "not over plain HTTP");
});
