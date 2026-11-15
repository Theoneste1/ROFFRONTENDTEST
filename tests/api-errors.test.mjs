// User-facing error messages (lib/api/errors.ts), including the Phase 1 backend's 503 DATABASE_BUSY.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, errorMessage } from "../lib/api/errors.ts";

test("503 DATABASE_BUSY says nothing was changed, so a retry is safe", () => {
  const msg = errorMessage(new ApiError(503, "DATABASE_BUSY", "The server is busy. Nothing was changed; please try again in a moment."));
  assert.match(msg, /busy/);
  assert.match(msg, /Nothing was changed/);
  assert.match(msg, /try again/);
});

test("other server errors keep the generic message; a plain 503 is not treated as 'nothing changed'", () => {
  assert.equal(errorMessage(new ApiError(500, "INTERNAL_ERROR", "An unexpected error occurred.")), "The server had a problem. Please try again shortly.");
  assert.equal(errorMessage(new ApiError(503, "SERVICE_UNAVAILABLE", "x")), "The server had a problem. Please try again shortly.");
});

test("network, session, validation, rate-limit and business errors are unchanged", () => {
  assert.match(errorMessage(new ApiError(0, "NETWORK_ERROR", "x")), /Cannot reach the server/);
  assert.match(errorMessage(new ApiError(0, "SESSION_REFRESH_UNAVAILABLE", "x")), /still signed in/);
  assert.equal(errorMessage(new ApiError(400, "VALIDATION_FAILED", "x", ["name must be shorter"])), "name must be shorter");
  assert.match(errorMessage(new ApiError(429, "TOO_MANY_REQUESTS", "x")), /Too many requests/);
  assert.equal(errorMessage(new ApiError(409, "STUDENT_IN_OTHER_PROGRAMME", "This student is active in another programme.")), "This student is active in another programme.");
  assert.equal(errorMessage(new Error("boom")), "Something went wrong. Please try again.");
});
