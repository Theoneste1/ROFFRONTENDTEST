// Cold start (Render ~33 s wake-up behind Netlify's ~26 s proxy): detection retries soon, registration
// waits quietly while the server wakes, sign-in retries gateway failures only. Plus rank display rules.
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} } };
const { UNKNOWN_RETRY_MS, WAKING_WINDOW_MS, isWaking, refetchIntervalFor, unknownRetryDelay } = await import("../lib/api/capabilities.ts");
const { registrationGate } = await import("../lib/accounts/registration-mode.ts");
const { authApi, isGatewayFailure, LOGIN_RETRY_DELAYS_MS } = await import("../lib/api/auth.ts");
const { ApiError } = await import("../lib/api/errors.ts");
const { rankLabel, leaderboardHidden } = await import("../lib/community/leaderboard.ts");

const UNKNOWN = { state: "UNKNOWN", reason: "HTTP 502" };

test("detection retries back off after UNKNOWN answers: 3, 5, 10, 15 s, then every 30 s", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 9].map(unknownRetryDelay), [3_000, 5_000, 10_000, 15_000, UNKNOWN_RETRY_MS, UNKNOWN_RETRY_MS]);
  assert.equal(refetchIntervalFor(UNKNOWN, 1), 3_000);
  assert.equal(refetchIntervalFor(UNKNOWN), UNKNOWN_RETRY_MS, "no count known: the steady cadence");
  assert.equal(refetchIntervalFor({ state: "LEGACY" }, 3), false);
  // The whole fast phase fits inside the waking window (~33 s for Render to wake).
  assert.ok(3_000 + 5_000 + 10_000 + 15_000 < WAKING_WINDOW_MS);
});

test("waking: within 90 s of the first UNKNOWN answer", () => {
  assert.equal(isWaking(null, 1_000), false);
  assert.equal(isWaking(0, WAKING_WINDOW_MS - 1), true);
  assert.equal(isWaking(0, WAKING_WINDOW_MS), false);
});

test("registration: while the server wakes it keeps waiting (no failure panel); afterwards it offers retry and the basic form", () => {
  assert.deepEqual(registrationGate(UNKNOWN, true, true), { state: "loading", waking: true });
  assert.deepEqual(registrationGate(UNKNOWN, false, true), { state: "loading", waking: true });
  assert.deepEqual(registrationGate(UNKNOWN, false, false), { state: "failed", reason: "HTTP 502", retrying: false });
  assert.deepEqual(registrationGate(UNKNOWN, false), { state: "failed", reason: "HTTP 502", retrying: false }, "default: not waking");
});

test("only gateway failures count as 'server not reached'", () => {
  for (const s of [0, 502, 503, 504]) assert.equal(isGatewayFailure(new ApiError(s, "X", "x")), true, String(s));
  for (const s of [400, 401, 403, 409, 429, 500]) assert.equal(isGatewayFailure(new ApiError(s, "X", "x")), false, String(s));
  assert.equal(isGatewayFailure(new Error("x")), false);
});

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const OK = { access_token: "a", token_type: "Bearer", expires_in: 900, refresh_token: "r", user: { id: "u1" } };

test("sign-in retries a 504/502 from the proxy, then succeeds; the waits follow LOGIN_RETRY_DELAYS_MS", async () => {
  const answers = [json(504, { code: "GATEWAY_TIMEOUT", message: "x" }), json(502, { message: "x" }), json(200, OK)];
  let calls = 0;
  globalThis.fetch = async () => { calls++; return answers.shift(); };
  const waits = [];
  const res = await authApi.login("ada", "pw", async (ms) => { waits.push(ms); });
  assert.equal(res.access_token, "a");
  assert.equal(calls, 3);
  assert.deepEqual(waits, LOGIN_RETRY_DELAYS_MS.slice(0, 2));
});

test("sign-in never retries a real answer (wrong password, lockout, rate limit)", async () => {
  for (const status of [401, 403, 429]) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return json(status, { code: "X", message: "no" }); };
    await assert.rejects(authApi.login("ada", "bad", async () => {}), (e) => e.status === status);
    assert.equal(calls, 1, String(status));
  }
});

test("sign-in gives up after the last retry and reports the gateway error", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return json(504, { message: "x" }); };
  await assert.rejects(authApi.login("ada", "pw", async () => {}), (e) => e.status === 504);
  assert.equal(calls, LOGIN_RETRY_DELAYS_MS.length + 1);
});

test("rank display: a missing rank says 'Not ranked yet' (never '#null'); a hidden leaderboard is recognised", () => {
  assert.equal(rankLabel(3), "#3");
  assert.equal(rankLabel(null), "Not ranked yet");
  assert.equal(rankLabel(undefined), "Not ranked yet");
  assert.equal(leaderboardHidden(new ApiError(403, "LEADERBOARD_HIDDEN", "x")), true);
  assert.equal(leaderboardHidden(new ApiError(403, "FORBIDDEN", "x")), false);
});
