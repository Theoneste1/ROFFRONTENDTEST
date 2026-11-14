// Failed e-mails page: how backend answers are shown.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../lib/api/errors.ts";
import { failedDeliveryUnavailable, retryOutcome } from "../lib/admin-ops/failed-deliveries.ts";

test("an older backend without the deliveries list (404) is recognised, other errors are not", () => {
  assert.equal(failedDeliveryUnavailable(new ApiError(404, "NOT_FOUND", "x")), true);
  assert.equal(failedDeliveryUnavailable(new ApiError(403, "FORBIDDEN", "x")), false);
  assert.equal(failedDeliveryUnavailable(new Error("x")), false);
});

test("retry outcomes: queued, one-time link not kept, already handled, or a generic error", () => {
  assert.deepEqual(retryOutcome(null, "a@x.rw"), { tone: "success", text: "The e-mail to a@x.rw is queued to be sent again." });
  const kept = retryOutcome(new ApiError(409, "CONTENT_NOT_KEPT", "x"), "a@x.rw");
  assert.equal(kept.tone, "info");
  assert.match(kept.text, /one-time link/);
  assert.match(kept.text, /new invitation or password-reset link/);
  assert.match(retryOutcome(new ApiError(409, "INVALID_STATE_TRANSITION", "x"), "a@x.rw").text, /no longer failed/);
  assert.equal(retryOutcome(new ApiError(500, "X", "x"), "a@x.rw"), null);
});
