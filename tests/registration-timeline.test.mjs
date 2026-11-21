// REG-13 — lib/accounts/registration-timeline.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actorText,
  detailText,
  stageRows,
} from "../lib/accounts/registration-timeline.ts";

const t = (stages) => ({
  userId: "u",
  events: [],
  stages: {
    created: "2026-11-01T10:00:00Z",
    activated: null,
    approved: false,
    accountStatus: "ACTIVE",
    schoolVerification: null,
    source: null,
    ...stages,
  },
});

test("stages: defaults for a fresh account, and a teacher who came from an application", () => {
  assert.deepEqual(
    stageRows(t({}), (d) => d.slice(0, 10)),
    [
      ["Created", "2026-11-01"],
      ["Activated", "Not yet"],
      ["Approved", "No"],
      ["Account state", "Active"],
      ["School verification", "No school claim"],
      ["Came from", "Direct registration or invitation"],
    ],
  );
  const rows = Object.fromEntries(
    stageRows(
      t({
        activated: "2026-11-02T00:00:00Z",
        approved: true,
        accountStatus: "PENDING_APPROVAL",
        schoolVerification: "VERIFIED",
        source: "TEACHER_APPLICATION",
      }),
      (d) => d.slice(0, 10),
    ),
  );
  assert.equal(rows.Activated, "2026-11-02");
  assert.equal(rows["Account state"], "Pending approval");
  assert.equal(rows["School verification"], "Verified");
  assert.equal(rows["Came from"], "Teacher application");
});

test("actor: the person, the applicant, or the administrator with username", () => {
  assert.equal(actorText({ actor: "SELF", actorUsername: null }), "The person");
  assert.equal(
    actorText({ actor: "APPLICANT", actorUsername: null }),
    "The applicant",
  );
  assert.equal(
    actorText({ actor: "ADMIN", actorUsername: "admin" }),
    "Admin (admin)",
  );
  assert.equal(
    actorText(
      { actor: "SUPER_ADMIN", actorUsername: null },
      () => "Super Administrator",
    ),
    "Super Administrator",
  );
});

test("details: transitions, question, reason; nothing else", () => {
  assert.equal(detailText(null), null);
  assert.equal(
    detailText({ from: "ACTIVE", to: "SUSPENDED", reason: "Checking" }),
    "Active → Suspended · Reason: Checking",
  );
  assert.equal(
    detailText({ question: "Which classes?" }),
    "Question: Which classes?",
  );
  assert.equal(detailText({ status: "VERIFIED" }), "Verified");
  assert.equal(detailText({ olympiadInterests: ["MATHEMATICS"] }), null);
});
