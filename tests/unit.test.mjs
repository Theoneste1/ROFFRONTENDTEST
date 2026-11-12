// Unit tests for pure helpers (Node's built-in runner; Node 22.18+ / 23.6+
// strips the TypeScript types). Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { formatFileSize, hasAcceptedExtension } from "../lib/format.ts";
import { uploadOrigin } from "../lib/api/upload-origin.ts";
import { getUploads, subscribeUploads, summarise, trackUpload } from "../lib/api/upload-progress.ts";

const SUBMISSION_ACCEPT = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif,.doc,.docx,.zip,.txt";

test("hasAcceptedExtension accepts listed types, any case", () => {
  assert.equal(hasAcceptedExtension("Solution.PDF", SUBMISSION_ACCEPT), true);
  assert.equal(hasAcceptedExtension("photo.heic", SUBMISSION_ACCEPT), true);
  assert.equal(hasAcceptedExtension("my.answer.docx", SUBMISSION_ACCEPT), true);
});

test("hasAcceptedExtension refuses other or missing extensions", () => {
  assert.equal(hasAcceptedExtension("setup.exe", SUBMISSION_ACCEPT), false);
  assert.equal(hasAcceptedExtension("pdf", SUBMISSION_ACCEPT), false);
  assert.equal(hasAcceptedExtension("slides.pptx", SUBMISSION_ACCEPT), false);
  assert.equal(hasAcceptedExtension("archive.pdf.exe", SUBMISSION_ACCEPT), false);
});

test("formatFileSize", () => {
  assert.equal(formatFileSize(500), "500 B");
  assert.equal(formatFileSize(2048), "2 KB");
  assert.equal(formatFileSize(12 * 1024 * 1024), "12.0 MB");
});

test("uploadOrigin keeps only an http(s) origin", () => {
  assert.equal(uploadOrigin("https://rofbackendtest.onrender.com"), "https://rofbackendtest.onrender.com");
  assert.equal(uploadOrigin(" https://rofbackendtest.onrender.com/api/v1/ "), "https://rofbackendtest.onrender.com");
  assert.equal(uploadOrigin(""), "");
  assert.equal(uploadOrigin(undefined), "");
  assert.equal(uploadOrigin("not a url"), "");
  assert.equal(uploadOrigin("javascript:alert(1)"), "");
});

test("upload progress: tracked, summarised, then cleared", () => {
  let notified = 0;
  const unsubscribe = subscribeUploads(() => notified++);
  assert.equal(summarise(getUploads()), null);

  const a = trackUpload(1000);
  const b = trackUpload(3000);
  a.progress(500, 1000);
  b.progress(1500, 3000);
  assert.deepEqual(summarise(getUploads()), { loaded: 2000, total: 4000, processing: false });

  a.progress(1000, 1000);
  b.progress(3000, 3000);
  assert.equal(summarise(getUploads()).processing, true);

  a.done();
  b.done();
  assert.equal(summarise(getUploads()), null);
  assert.ok(notified >= 7);
  unsubscribe();
});
