// H1 / M1: sign-out after the access token expired, the signed-out marker, and
// refresh-and-retry for the authenticated /auth/* calls. The real API client
// runs against a scripted fetch (no server), so every request is checked as sent.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// A browser-like localStorage shared by "tabs" (one per test process here).
function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}
const storage = memoryStorage();
globalThis.window = { localStorage: storage };

const { SIGNED_OUT_KEY, clearSignedOut, confirmSignedOut, isMarkedSignedOut, isSignedOutEvent, markSignedOut, needsServerLogout } = await import(
  "../lib/auth/signed-out.ts"
);
const client = await import("../lib/api/client.ts");
const { authApi } = await import("../lib/api/auth.ts");

/** Scripted fetch: each handler answers one request in order; every request is recorded. */
let calls = [];
let script = [];
globalThis.fetch = async (url, init = {}) => {
  const headers = new Headers(init.headers);
  calls.push({ url: String(url), method: init.method ?? "GET", authorization: headers.get("Authorization"), credentials: init.credentials });
  const next = script.shift();
  if (!next) throw new Error(`unexpected request ${init.method} ${url}`);
  return next(String(url));
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const expectUrl = (path, respond) => (url) => {
  assert.equal(url, `/api/v1${path}`);
  return respond();
};

beforeEach(() => {
  calls = [];
  script = [];
  storage.clear();
  client.setAccessToken(null);
  client.clearRefreshCooldown();
});

// ─── The marker ─────────────────────────────────────────────────────────────

test("marker: sign-out → signed out and server logout pending; confirmed → not repeated; sign-in clears it", () => {
  const s = memoryStorage();
  assert.equal(isMarkedSignedOut(s), false);
  markSignedOut(s);
  assert.equal(isMarkedSignedOut(s), true);
  assert.equal(needsServerLogout(s), true);
  confirmSignedOut(s);
  assert.equal(isMarkedSignedOut(s), true, "still signed out after the server confirmed");
  assert.equal(needsServerLogout(s), false, "no repeated logout once confirmed");
  clearSignedOut(s);
  assert.equal(isMarkedSignedOut(s), false);
});

test("marker: blocked or missing storage never throws (the server logout is then the only protection)", () => {
  const throwing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  assert.doesNotThrow(() => markSignedOut(throwing));
  assert.equal(isMarkedSignedOut(throwing), false);
  assert.doesNotThrow(() => clearSignedOut(throwing));
  assert.equal(isMarkedSignedOut(null), false);
});

test("marker: another tab signing out is recognised from its storage event; a sign-in (removal) is not", () => {
  assert.equal(isSignedOutEvent({ key: SIGNED_OUT_KEY, newValue: "pending" }), true);
  assert.equal(isSignedOutEvent({ key: SIGNED_OUT_KEY, newValue: null }), false);
  assert.equal(isSignedOutEvent({ key: "other", newValue: "x" }), false);
});

// ─── H1: logout ─────────────────────────────────────────────────────────────

test("H1: logout with an expired access token goes straight to /auth/logout (cookie + old bearer), never refreshes, and clears the token", async () => {
  client.setAccessToken("expired-token");
  script = [expectUrl("/auth/logout", () => json(200, { message: "Logged out successfully." }))];
  await authApi.logout();
  assert.deepEqual(calls.map((c) => c.url), ["/api/v1/auth/logout"], "no /auth/refresh before or after");
  assert.equal(calls[0].credentials, "include", "the refresh cookie is sent");
  assert.equal(calls[0].authorization, "Bearer expired-token");
  assert.equal(client.getAccessToken(), null);
});

test("H1: logout with no access token at all (reload, shared computer) still calls the server", async () => {
  script = [expectUrl("/auth/logout", () => json(200, { message: "Logged out successfully." }))];
  await authApi.logout();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].authorization, null);
});

test("H1: a lost logout request throws, but the local token is cleared anyway", async () => {
  client.setAccessToken("t");
  script = [() => { throw new TypeError("network down"); }];
  await assert.rejects(authApi.logout(), (e) => e.code === "NETWORK_ERROR");
  assert.equal(client.getAccessToken(), null);
});

// ─── The marker stops silent restores ───────────────────────────────────────

test("shared device: while signed out on this device, a refresh never revives the session (no request is sent)", async () => {
  markSignedOut();
  assert.equal(await client.refreshSession(), "rejected");
  assert.equal(calls.length, 0);
  assert.equal(client.getAccessToken(), null);
});

test("multi-tab race: a refresh already on its way when another tab signs out is discarded", async () => {
  let answer;
  script = [expectUrl("/auth/refresh", () => new Promise((r) => { answer = r; }))];
  const refreshing = client.refreshSession();
  while (!answer) await new Promise((r) => setTimeout(r, 0));
  markSignedOut();   // the other tab signs out now
  answer(json(200, { access_token: "fresh" }));
  assert.equal(await refreshing, "rejected");
  assert.equal(client.getAccessToken(), null, "the new token is not adopted");
});

test("after a sign-in clears the marker, refreshing works again", async () => {
  markSignedOut();
  clearSignedOut();
  script = [expectUrl("/auth/refresh", () => json(200, { access_token: "fresh" }))];
  assert.equal(await client.refreshSession(), "ok");
  assert.equal(client.getAccessToken(), "fresh");
});

// ─── M1: authenticated /auth/* calls refresh and retry ──────────────────────

test("M1: sign out everywhere with an expired access token refreshes once and retries with the new token", async () => {
  client.setAccessToken("expired");
  script = [
    expectUrl("/auth/logout-all", () => json(401, { code: "UNAUTHORIZED", message: "expired" })),
    expectUrl("/auth/refresh", () => json(200, { access_token: "fresh" })),
    expectUrl("/auth/logout-all", () => json(200, { message: "All sessions have been signed out." })),
  ];
  await authApi.logoutAll();
  assert.deepEqual(calls.map((c) => [c.url, c.authorization]), [
    ["/api/v1/auth/logout-all", "Bearer expired"],
    ["/api/v1/auth/refresh", null],
    ["/api/v1/auth/logout-all", "Bearer fresh"],
  ]);
});

test("M1: change password with an expired access token refreshes once and retries", async () => {
  client.setAccessToken("expired");
  script = [
    expectUrl("/auth/password", () => json(401, { code: "UNAUTHORIZED", message: "expired" })),
    expectUrl("/auth/refresh", () => json(200, { access_token: "fresh" })),
    expectUrl("/auth/password", () => json(200, { message: "Password changed." })),
  ];
  await authApi.changePassword("Old-password-1", "New-password-2");
  assert.equal(calls[2].authorization, "Bearer fresh");
  assert.equal(calls[2].method, "PATCH");
});

test("M1: if the session is already gone, sign out everywhere fails visibly instead of pretending", async () => {
  client.setAccessToken("expired");
  script = [
    expectUrl("/auth/logout-all", () => json(401, { code: "UNAUTHORIZED", message: "expired" })),
    expectUrl("/auth/refresh", () => json(401, { code: "INVALID_REFRESH_TOKEN", message: "no" })),
  ];
  await assert.rejects(authApi.logoutAll(), (e) => e.status === 401);
  assert.equal(client.getAccessToken(), null);
});

test("refresh rule: authenticated calls refresh on 401 unless refresh:false; public calls never", () => {
  assert.equal(client.refreshesOnUnauthorized({}), true);
  assert.equal(client.refreshesOnUnauthorized({ refresh: false }), false);
  assert.equal(client.refreshesOnUnauthorized({ auth: false }), false);
  assert.equal(client.refreshesOnUnauthorized({ auth: false, refresh: true }), false);
});

test("public auth calls (login) do not refresh on 401", async () => {
  script = [expectUrl("/auth/login", () => json(401, { code: "INVALID_CREDENTIALS", message: "Invalid username or password." }))];
  await assert.rejects(authApi.login("ada", "wrong"), (e) => e.status === 401);
  assert.deepEqual(calls.map((c) => c.url), ["/api/v1/auth/login"]);
});
