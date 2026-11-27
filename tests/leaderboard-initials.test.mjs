// Leaderboard initials (owner 2026-11-27: students see usernames, never names; lib/leaderboard/initials.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { initialsSource } from "@/lib/leaderboard/initials";

test("usernames give two initials from their parts, or their first two letters; staff full names as before", () => {
  assert.deepEqual(initialsSource("jean.damour"), ["jean", "damour"]);
  assert.deepEqual(initialsSource("tresor_h-2026"), ["tresor", "h"]);
  assert.deepEqual(initialsSource("anitha"), ["a", "n"]);
  assert.deepEqual(initialsSource("Grace Uwase"), ["Grace", "Uwase"]);
  assert.deepEqual(initialsSource("Grace U."), ["Grace", "U"]);
});
