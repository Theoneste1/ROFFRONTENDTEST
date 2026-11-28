// Review 2026-11-28: the PDF guide's support details come from the configured backend, never from the request's Host.
import { test } from "node:test";
import assert from "node:assert/strict";
import { officialSupportUrl } from "@/lib/help/support-source";

test("the configured backend address, never the request", () => {
  assert.equal(officialSupportUrl({ API_PROXY_TARGET: "https://rofbackendtest.onrender.com" }), "https://rofbackendtest.onrender.com/api/v1/support");
  assert.equal(officialSupportUrl({ API_PROXY_TARGET: "http://127.0.0.1:4300/" }), "http://127.0.0.1:4300/api/v1/support");
  for (const bad of [undefined, "", "   ", "javascript:alert(1)", "file:///etc/passwd", "not a url"]) {
    assert.equal(officialSupportUrl({ API_PROXY_TARGET: bad }), null, String(bad));
  }
});
