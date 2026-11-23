// Search engines (lib/site/seo.ts): the platform's own domain is its address, and only the production site is indexed.
import { test } from "node:test";
import assert from "node:assert/strict";

import { PRODUCTION_URLS, SITE_URL, indexingAllowed } from "../lib/site/seo.ts";

test("the address is the platform's own domain", () => {
  assert.equal(SITE_URL, "https://lms.rwandaolympiadfoundation.org");
  assert.deepEqual(PRODUCTION_URLS, ["https://lms.rwandaolympiadfoundation.org"]);
});

test("indexed on Vercel's production deployment and locally; never on a Vercel preview or development build", () => {
  assert.equal(indexingAllowed("production"), true);
  assert.equal(indexingAllowed(undefined), true);   // local runs
  assert.equal(indexingAllowed("preview"), false);   // every pull request's preview
  assert.equal(indexingAllowed("development"), false);
});
