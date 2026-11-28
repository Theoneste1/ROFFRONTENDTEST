// Performance (2026-11-28): a refresh that returns the profile (newer backends) saves the page load its GET /me. The
// real API client against a scripted fetch: the profile is taken once, only from a successful refresh, and an older
// backend (no `user`) changes nothing.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
}
globalThis.window = { localStorage: memoryStorage() };

const client = await import("../lib/api/client.ts");

let script = [];
globalThis.fetch = async (url) => {
  const next = script.shift();
  if (!next) throw new Error(`unexpected request ${url}`);
  return next(String(url));
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const PROFILE = { id: "u1", username: "student.j", role: "STUDENT", firstName: "Jean", lastName: "M", dateOfBirthRequired: false, genderRequired: false, bankingRequired: false };

beforeEach(() => {
  script = [];
  client.setAccessToken(null);
  client.clearRefreshCooldown();
  client.takeRefreshedProfile();
});

test("a refresh that returns the profile: the session takes it once (no GET /me needed)", async () => {
  const PERMISSIONS = { role: "STUDENT", roleLabel: "Student", permissions: ["courses.view"], scopes: { courseDivisions: [], programmes: [] }, overrides: [] };
  script = [() => json(200, { access_token: "a.b.c", token_type: "Bearer", expires_in: 900, refresh_token: "r", user: PROFILE, permissions: PERMISSIONS })];
  assert.equal(await client.refreshSession(), "ok");
  assert.deepEqual(client.takeRefreshedProfile(), { user: PROFILE, permissions: PERMISSIONS });
  assert.equal(client.takeRefreshedProfile(), null, "taken once");
});

test("a backend with the profile but no permission summary: the profile only (GET /me/permissions as before)", async () => {
  script = [() => json(200, { access_token: "a.b.c", token_type: "Bearer", expires_in: 900, refresh_token: "r", user: PROFILE })];
  assert.equal(await client.refreshSession(), "ok");
  assert.deepEqual(client.takeRefreshedProfile(), { user: PROFILE, permissions: null });
});

test("an older backend (no profile in the refresh): nothing to take, GET /me as before", async () => {
  script = [() => json(200, { access_token: "a.b.c", token_type: "Bearer", expires_in: 900, refresh_token: "r" })];
  assert.equal(await client.refreshSession(), "ok");
  assert.equal(client.takeRefreshedProfile(), null);
});

test("a refused refresh never leaves a profile behind", async () => {
  script = [() => json(401, { code: "INVALID_REFRESH_TOKEN", user: PROFILE })];
  assert.equal(await client.refreshSession(), "rejected");
  assert.equal(client.takeRefreshedProfile(), null);
});
