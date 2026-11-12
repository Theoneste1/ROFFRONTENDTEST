// Backend detection from GET /api/v1 (lib/api/capabilities.ts), against the
// contract in the backend's docs/INTEGRATION.md "Backend capabilities".
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFINITE_STALE_MS,
  KNOWN_FEATURES,
  UNKNOWN_RETRY_MS,
  classifyApiInfo,
  detectBackend,
  hasFeature,
  isLegacyBackend,
  isNewBackend,
  refetchIntervalFor,
  staleTimeFor,
} from "../lib/api/capabilities.ts";

// The exact body the production backend returns today (GET https://rofbackendtest.onrender.com/api/v1, 2026-11-12).
const PRODUCTION_BODY = '{"name":"ROF LMS API","version":"1.0.0","docs":"/api/docs","health":"/health"}';
const BASE = { name: "ROF LMS API", version: "1.0.0", docs: "/api/docs", health: "/health" };
// The documented NEW example (flags off).
const NEW_CAPS = {
  schemaVersion: 1,
  roles: ["STUDENT", "TEACHER", "MENTOR", "HEAD_COACH", "ADMIN", "SUPER_ADMIN"],
  features: ["permissionScopes", "schoolAdministration", "schoolAffiliations", "schoolReferenceRequired"],
};
const body = (o) => JSON.stringify(o);

// ─── LEGACY ─────────────────────────────────────────────────────────────────

test("LEGACY: today's production response", () => {
  assert.deepEqual(classifyApiInfo(200, PRODUCTION_BODY), { state: "LEGACY" });
});

test("LEGACY: extra unrelated fields do not matter, but the original four must be valid", () => {
  assert.deepEqual(classifyApiInfo(200, body({ ...BASE, extra: 1 })), { state: "LEGACY" });
});

// ─── NEW ────────────────────────────────────────────────────────────────────

test("NEW: the documented capabilities response", () => {
  const d = classifyApiInfo(200, body({ ...BASE, capabilities: NEW_CAPS }));
  assert.equal(d.state, "NEW");
  assert.equal(d.schemaVersion, 1);
  assert.deepEqual(d.roles, NEW_CAPS.roles);
  assert.deepEqual(d.features, NEW_CAPS.features);
});

test("NEW: empty roles and features arrays are still valid", () => {
  assert.equal(classifyApiInfo(200, body({ ...BASE, capabilities: { schemaVersion: 1, roles: [], features: [] } })).state, "NEW");
});

// ─── Features ───────────────────────────────────────────────────────────────

test("features are checked one by one; unknown names are ignored; order does not matter", () => {
  const d = classifyApiInfo(200, body({ ...BASE, capabilities: { ...NEW_CAPS, features: ["zzzFuture", "schoolAffiliations", "permissionScopes"] } }));
  assert.equal(hasFeature(d, "schoolAffiliations"), true);
  assert.equal(hasFeature(d, "permissionScopes"), true);
  assert.equal(hasFeature(d, "schoolAdministration"), false, "not listed → not available");
  assert.equal(hasFeature(d, "zzzFuture"), false, "a name this frontend does not know is never used");
});

test("teacherAccounts / headCoachAccounts are optional features", () => {
  const off = classifyApiInfo(200, body({ ...BASE, capabilities: NEW_CAPS }));
  assert.equal(hasFeature(off, "teacherAccounts"), false);
  assert.equal(hasFeature(off, "headCoachAccounts"), false);
  const on = classifyApiInfo(200, body({ ...BASE, capabilities: { ...NEW_CAPS, features: [...NEW_CAPS.features, "headCoachAccounts", "teacherAccounts"].sort() } }));
  assert.equal(hasFeature(on, "teacherAccounts"), true);
  assert.equal(hasFeature(on, "headCoachAccounts"), true);
  assert.ok(KNOWN_FEATURES.includes("teacherAccounts") && KNOWN_FEATURES.includes("headCoachAccounts"));
});

test("LEGACY and UNKNOWN never enable a feature", () => {
  for (const d of [{ state: "LEGACY" }, { state: "UNKNOWN", reason: "x" }, undefined, null]) {
    for (const f of KNOWN_FEATURES) assert.equal(hasFeature(d, f), false, `${d?.state} ${f}`);
  }
});

// ─── UNKNOWN (never LEGACY) ─────────────────────────────────────────────────

const UNKNOWN_CASES = [
  ["304", 304, PRODUCTION_BODY],
  ["301 redirect", 301, PRODUCTION_BODY],
  ["404", 404, '{"statusCode":404}'],
  ["429 rate limit", 429, '{"statusCode":429}'],
  ["500", 500, PRODUCTION_BODY],
  ["502 from the proxy", 502, "Bad gateway"],
  ["503", 503, ""],
  ["no body", 200, null],
  ["empty body", 200, ""],
  ["HTML (Netlify 404 page)", 200, "<!doctype html><title>Page not found</title>"],
  ["malformed JSON", 200, '{"name":"ROF LMS API",'],
  ["JSON array", 200, "[]"],
  ["JSON string", 200, '"ROF LMS API"'],
  ["JSON null", 200, "null"],
  ["JSON number", 200, "1"],
  ["other name", 200, body({ ...BASE, name: "Other API" })],
  ["missing name", 200, body({ version: "1.0.0", docs: "/api/docs", health: "/health" })],
  ["missing version", 200, body({ name: "ROF LMS API", docs: "/api/docs", health: "/health" })],
  ["version not a string", 200, body({ ...BASE, version: 1 })],
  ["missing docs", 200, body({ name: "ROF LMS API", version: "1.0.0", health: "/health" })],
  ["health not a string", 200, body({ ...BASE, health: null })],
  ["capabilities: null", 200, body({ ...BASE, capabilities: null })],
  ["capabilities: array", 200, body({ ...BASE, capabilities: [] })],
  ["capabilities: string", 200, body({ ...BASE, capabilities: "v1" })],
  ["schemaVersion missing", 200, body({ ...BASE, capabilities: { roles: [], features: [] } })],
  ["schemaVersion 2 (unsupported)", 200, body({ ...BASE, capabilities: { ...NEW_CAPS, schemaVersion: 2 } })],
  ["schemaVersion 0", 200, body({ ...BASE, capabilities: { ...NEW_CAPS, schemaVersion: 0 } })],
  ["schemaVersion '1' (string)", 200, body({ ...BASE, capabilities: { ...NEW_CAPS, schemaVersion: "1" } })],
  ["schemaVersion 1.5 (not an integer)", 200, body({ ...BASE, capabilities: { ...NEW_CAPS, schemaVersion: 1.5 } })],
  ["roles missing", 200, body({ ...BASE, capabilities: { schemaVersion: 1, features: [] } })],
  ["roles not an array", 200, body({ ...BASE, capabilities: { ...NEW_CAPS, roles: "STUDENT" } })],
  ["roles with a non-string", 200, body({ ...BASE, capabilities: { ...NEW_CAPS, roles: ["STUDENT", 3] } })],
  ["features missing", 200, body({ ...BASE, capabilities: { schemaVersion: 1, roles: [] } })],
  ["features not an array", 200, body({ ...BASE, capabilities: { ...NEW_CAPS, features: { permissionScopes: true } } })],
  ["features with a non-string", 200, body({ ...BASE, capabilities: { ...NEW_CAPS, features: ["permissionScopes", null] } })],
];

test("UNKNOWN: every case the contract lists — and none of them is LEGACY", () => {
  for (const [name, status, text] of UNKNOWN_CASES) {
    const d = classifyApiInfo(status, text);
    assert.equal(d.state, "UNKNOWN", name);
    assert.equal(typeof d.reason, "string", name);
    assert.equal(isLegacyBackend(d), false, `${name}: UNKNOWN never activates legacy behaviour`);
    assert.equal(isNewBackend(d), false, name);
  }
});

test("while loading (no answer yet) the backend is neither LEGACY nor NEW", () => {
  assert.equal(isLegacyBackend(undefined), false);
  assert.equal(isNewBackend(undefined), false);
});

// ─── detectBackend (fetch, timeout, network) ────────────────────────────────

function fakeFetch(status, text, record = []) {
  return async (url, init) => {
    record.push({ url, init });
    return { status, text: async () => text };
  };
}

test("detectBackend: production response → LEGACY; sends a public, uncached GET to /api/v1", async () => {
  const calls = [];
  assert.deepEqual(await detectBackend({ fetch: fakeFetch(200, PRODUCTION_BODY, calls) }), { state: "LEGACY" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/v1");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.credentials, "omit", "no cookie or token");
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].init.redirect, "manual");
  assert.equal(calls[0].init.headers.Authorization, undefined);
});

test("detectBackend: capabilities response → NEW", async () => {
  const d = await detectBackend({ fetch: fakeFetch(200, body({ ...BASE, capabilities: NEW_CAPS })) });
  assert.equal(d.state, "NEW");
  assert.equal(hasFeature(d, "schoolReferenceRequired"), true);
});

test("detectBackend: a non-200 status is UNKNOWN without reading the body", async () => {
  let read = false;
  const d = await detectBackend({ fetch: async () => ({ status: 503, text: async () => ((read = true), "") }) });
  assert.equal(d.state, "UNKNOWN");
  assert.equal(read, false);
});

test("detectBackend: an opaque redirect (status 0) is UNKNOWN", async () => {
  assert.equal((await detectBackend({ fetch: fakeFetch(0, "") })).state, "UNKNOWN");
});

test("detectBackend: a network error is UNKNOWN (never thrown, never LEGACY)", async () => {
  const d = await detectBackend({
    fetch: async () => {
      throw new TypeError("Failed to fetch");
    },
  });
  assert.deepEqual(d, { state: "UNKNOWN", reason: "network error" });
});

test("detectBackend: an error while reading the body is UNKNOWN", async () => {
  const d = await detectBackend({ fetch: async () => ({ status: 200, text: async () => { throw new TypeError("network lost"); } }) });
  assert.equal(d.state, "UNKNOWN");
});

/** A fetch that never answers until its signal aborts (like a sleeping backend); rejects at once if already aborted, as fetch does. */
const hangingFetch = () => (url, init) =>
  new Promise((_, reject) => {
    const fail = () => reject(new DOMException("aborted", "AbortError"));
    if (init.signal.aborted) return fail();
    init.signal.addEventListener("abort", fail, { once: true });
  });

test("detectBackend: a timeout is UNKNOWN", async () => {
  const started = Date.now();
  const d = await detectBackend({ fetch: hangingFetch(), timeoutMs: 50 });
  assert.deepEqual(d, { state: "UNKNOWN", reason: "timeout" });
  assert.ok(Date.now() - started < 2_000);
});

test("detectBackend: a cancelled request (caller's signal) is UNKNOWN", async () => {
  const controller = new AbortController();
  const pending = detectBackend({ fetch: hangingFetch(), timeoutMs: 10_000, signal: controller.signal });
  controller.abort();
  assert.deepEqual(await pending, { state: "UNKNOWN", reason: "aborted" });
  const already = new AbortController();
  already.abort();
  let called = false;
  const d = await detectBackend({ fetch: async () => ((called = true), { status: 200, text: async () => PRODUCTION_BODY }), timeoutMs: 10_000, signal: already.signal });
  assert.deepEqual(d, { state: "UNKNOWN", reason: "aborted" });
  assert.equal(called, false, "an already-cancelled detection sends no request");
});

// ─── Caching ────────────────────────────────────────────────────────────────

test("caching: definite answers stay fresh for 5 minutes; UNKNOWN is never fresh and is retried every 30 s", () => {
  assert.equal(staleTimeFor({ state: "LEGACY" }), DEFINITE_STALE_MS);
  assert.equal(staleTimeFor({ state: "NEW", schemaVersion: 1, roles: [], features: [] }), DEFINITE_STALE_MS);
  assert.equal(staleTimeFor({ state: "UNKNOWN", reason: "timeout" }), 0);
  assert.equal(staleTimeFor(undefined), 0);
  assert.equal(refetchIntervalFor({ state: "UNKNOWN", reason: "timeout" }), UNKNOWN_RETRY_MS);
  assert.equal(refetchIntervalFor({ state: "LEGACY" }), false);
  assert.equal(refetchIntervalFor({ state: "NEW", schemaVersion: 1, roles: [], features: [] }), false);
  assert.equal(refetchIntervalFor(undefined), false, "the first request is already in flight");
});
