// Application picture review (lib/accounts/application-picture.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { KEEP_PICTURE_LABEL, pictureReviewShown, withPictureDecision } from "../lib/accounts/application-picture.ts";

const NEW = (features) => ({ state: "NEW", schemaVersion: 1, roles: [], features });

test("the review is shown only with the capability and a picture", () => {
  const caps = NEW(["applicationPictureReview"]);
  assert.equal(pictureReviewShown(caps, "file-1"), true);
  assert.equal(pictureReviewShown(caps, null), false);
  assert.equal(pictureReviewShown(caps, undefined), false);
  assert.equal(pictureReviewShown(caps, ""), false);
  assert.equal(pictureReviewShown(NEW([]), "file-1"), false);
  assert.equal(pictureReviewShown({ state: "LEGACY" }, "file-1"), false);
  assert.equal(pictureReviewShown(null, "file-1"), false);
});

test("without the review the approve body is unchanged (older backends get nothing new)", () => {
  assert.deepEqual(withPictureDecision({ note: "Welcome" }, { shown: false, loaded: false, keep: true }), { note: "Welcome" });
  assert.deepEqual(withPictureDecision({}, { shown: false, loaded: true, keep: true }), {});
});

test("the picture is kept only when it was seen and the box ticked; the default discards it", () => {
  assert.deepEqual(withPictureDecision({ note: "Welcome" }, { shown: true, loaded: true, keep: true }), { note: "Welcome", approvePicture: true });
  assert.deepEqual(withPictureDecision({}, { shown: true, loaded: true, keep: false }), { approvePicture: false });
  // Not seen (failed to load): never kept, even if the box state says so.
  assert.deepEqual(withPictureDecision({}, { shown: true, loaded: false, keep: true }), { approvePicture: false });
});

test("the checkbox label", () => {
  assert.equal(KEEP_PICTURE_LABEL, "Use this picture as the account's profile picture");
});
