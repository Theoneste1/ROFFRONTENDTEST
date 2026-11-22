// User-facing error messages (lib/api/errors.ts), including the Phase 1 backend's 503 DATABASE_BUSY.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, UNEXPECTED_ERROR, errorMessage } from "../lib/api/errors.ts";

test("503 DATABASE_BUSY says nothing was changed, so a retry is safe", () => {
  const msg = errorMessage(new ApiError(503, "DATABASE_BUSY", "The server is busy. Nothing was changed; please try again in a moment."));
  assert.match(msg, /busy/);
  assert.match(msg, /Nothing was changed/);
  assert.match(msg, /try again/);
});

test("server failures say what to do and give the reference to quote; a plain 503 is not treated as 'nothing changed'", () => {
  assert.equal(
    errorMessage(new ApiError(500, "INTERNAL_ERROR", "An unexpected error occurred.", undefined, "req-42")),
    "Something went wrong on our side and this could not be completed. Please try again in a moment. If it keeps happening, contact the Rwanda Olympiad Foundation team and give them the reference req-42.",
  );
  const unavailable = errorMessage(new ApiError(503, "SERVICE_UNAVAILABLE", "x"));
  assert.match(unavailable, /^The server had a problem\. Please try again in a moment/);
  assert.doesNotMatch(unavailable, /Nothing was changed/);
  // A specific code of ours keeps its own message, written for people.
  assert.equal(errorMessage(new ApiError(503, "EMAIL_NOT_CONFIGURED", "E-mail is not set up yet.")), "E-mail is not set up yet.");
});

test("answers that are not ours (a proxy or hosting page) get plain words by status", () => {
  const raw = (status, text) => new ApiError(status, "ERROR", text);
  assert.match(errorMessage(raw(502, "Bad Gateway")), /isn't responding right now .*check whether it was saved/);
  assert.match(errorMessage(raw(504, "Gateway Timeout")), /isn't responding right now/);
  assert.match(errorMessage(raw(413, "Payload Too Large")), /too large\. Choose a smaller file/);
  assert.match(errorMessage(raw(404, "Not Found")), /wasn't found/);
  assert.match(errorMessage(raw(401, "Unauthorized")), /sign in again/);
  assert.match(errorMessage(raw(403, "Forbidden")), /don't have permission/);
  for (const e of [raw(502, "Bad Gateway"), raw(404, "Not Found"), raw(418, "Request failed")]) {
    assert.doesNotMatch(errorMessage(e), /^(Bad Gateway|Not Found|Request failed)$/);
  }
});

test("network, session, validation, rate-limit and business errors are unchanged", () => {
  assert.match(errorMessage(new ApiError(0, "NETWORK_ERROR", "x")), /Cannot reach the server/);
  assert.match(errorMessage(new ApiError(0, "SESSION_REFRESH_UNAVAILABLE", "x")), /still signed in/);
  // Validation: the first problem in plain words, and how many more.
  assert.equal(errorMessage(new ApiError(400, "VALIDATION_FAILED", "x", ["name must be shorter"])), "Name must be shorter");
  assert.equal(
    errorMessage(new ApiError(400, "VALIDATION_FAILED", "x", ["opensAt must be a valid ISO 8601 date string", "title should not be empty"])),
    "Opens at must be a valid date and time. (and 1 more problem — check the form)",
  );
  assert.match(errorMessage(new ApiError(429, "TOO_MANY_REQUESTS", "x")), /Too many attempts .* Wait a minute/);
  // The server's own wait comes first (a sign-in lock can last up to an hour); a specific limit keeps its message.
  assert.equal(
    errorMessage(new ApiError(429, "TOO_MANY_REQUESTS", "Too many sign-in attempts.", { retryAfter: 1800 })),
    "Too many attempts in a short time. Wait 30 minutes, then try again.",
  );
  assert.match(errorMessage(new ApiError(429, "TOO_MANY_REQUESTS", "x", { retryAfter: 3540 })), /Wait about an hour/);
  assert.match(errorMessage(new ApiError(429, "TOO_MANY_REQUESTS", "x", { retryAfter: 42 })), /Wait a minute/);
  assert.equal(
    errorMessage(new ApiError(429, "CONTACT_LIMIT", "Too many messages from this e-mail address. Please try again later.")),
    "Too many messages from this e-mail address. Please try again later.",
  );
  assert.match(errorMessage(new ApiError(429, "ERROR", "Too Many Requests")), /Wait a minute/);
  assert.equal(errorMessage(new ApiError(409, "STUDENT_IN_OTHER_PROGRAMME", "This student is active in another programme.")), "This student is active in another programme.");
  // A technical error inside the page is never shown as it is.
  assert.equal(errorMessage(new Error("boom")), UNEXPECTED_ERROR);
  assert.match(UNEXPECTED_ERROR, /try again.*contact the Rwanda Olympiad Foundation team/i);
});

test("field messages next to a form field are in plain words (owner 2026-11-22)", async () => {
  const { fieldErrors } = await import("../lib/api/errors.ts");
  const e = new ApiError(400, "VALIDATION_FAILED", "x", ["closesAt must be a valid ISO 8601 date string", "maxMarks must not be less than 1", "Choose a school."]);
  assert.deepEqual(fieldErrors(e, ["closesAt", "maxMarks"]), {
    closesAt: "Closes at must be a valid date and time.",
    maxMarks: "Max marks must be 1 or more.",
  });
});
