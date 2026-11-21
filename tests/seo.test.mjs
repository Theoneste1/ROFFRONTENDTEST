// Search engines (lib/site/seo.ts): the platform's own domain is its address, and only the production site is indexed.
import { test } from "node:test";
import assert from "node:assert/strict";

import { PRODUCTION_URLS, SITE_URL, indexingAllowed } from "../lib/site/seo.ts";

test("the address is the platform's own domain", () => {
  assert.equal(SITE_URL, "https://lms.rwandaolympiadfoundation.org");
  assert.ok(PRODUCTION_URLS.includes("https://roflms.netlify.app"));
});

test("indexed on the production site (either of its addresses) and locally; never on staging or previews", () => {
  assert.equal(indexingAllowed("https://lms.rwandaolympiadfoundation.org"), true);
  assert.equal(indexingAllowed("https://lms.rwandaolympiadfoundation.org/"), true);
  assert.equal(indexingAllowed("https://roflms.netlify.app"), true);
  assert.equal(indexingAllowed(undefined), true);
  assert.equal(indexingAllowed("https://rof-lms-staging.netlify.app"), false);
  assert.equal(indexingAllowed("https://deploy-preview-61--roflms.netlify.app"), false);
  assert.equal(indexingAllowed("https://testroflms.netlify.app"), false);
});
