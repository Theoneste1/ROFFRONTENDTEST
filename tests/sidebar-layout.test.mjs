// Portal sidebars with a "More" menu (lib/navigation/sidebar-layout.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ITEM_PX, activeInMore, isActivePath, slotsFor, splitNav } from "../lib/navigation/sidebar-layout.ts";
import { ADMIN_NAV, MENTOR_NAV, TEACHER_NAV } from "../lib/auth/navigation.ts";

test("slots: how many items fit in the measured height", () => {
  assert.equal(slotsFor(0), 0);
  assert.equal(slotsFor(-5), 0);
  assert.equal(slotsFor(Number.NaN), 0);
  assert.equal(slotsFor(48, 60), 1);            // one 48 px item, no gap needed after it
  assert.equal(slotsFor(108, 60), 2);
  assert.equal(slotsFor(600, DEFAULT_ITEM_PX), 10);
});

test("split: everything when it fits or before measuring; otherwise one slot for More", () => {
  assert.deepEqual(splitNav(5, null), { primary: 5, hasMore: false });
  assert.deepEqual(splitNav(5, 5), { primary: 5, hasMore: false });
  assert.deepEqual(splitNav(14, 8), { primary: 7, hasMore: true });
  // A very short screen keeps the two most used pages visible.
  assert.deepEqual(splitNav(14, 1), { primary: 2, hasMore: true });
  assert.deepEqual(splitNav(2, 1), { primary: 2, hasMore: false });
});

test("no item is lost or duplicated, at every height", () => {
  for (const count of [1, 3, 5, 14, 20]) {
    for (let slots = 0; slots <= 22; slots++) {
      const { primary, hasMore } = splitNav(count, slots);
      const items = Array.from({ length: count }, (_, i) => i);
      const shown = items.slice(0, primary);
      const more = hasMore ? items.slice(primary) : [];
      assert.deepEqual([...shown, ...more], items, `count ${count}, slots ${slots}`);
      assert.equal(hasMore, more.length > 0);
    }
  }
});

test("the active page under More is detected (More is highlighted and names it)", () => {
  assert.equal(activeInMore([true, false, false, false], 2), false);
  assert.equal(activeInMore([false, false, false, true], 2), true);
  assert.equal(activeInMore([false, false], 2), false);
});

test("active rule: the home page only on itself; others with their sub-pages, not a mere prefix", () => {
  assert.equal(isActivePath("/admin/dashboard", "/admin/dashboard", "/admin/dashboard"), true);
  assert.equal(isActivePath("/admin/dashboard/x", "/admin/dashboard", "/admin/dashboard"), false);
  assert.equal(isActivePath("/admin/users/123", "/admin/users", "/admin/dashboard"), true);
  assert.equal(isActivePath("/admin/usersx", "/admin/users", "/admin/dashboard"), false);
});

test("the portal menus keep their items (the More menu changes the layout only)", () => {
  assert.ok(ADMIN_NAV.length >= 10);
  assert.ok(MENTOR_NAV.some((i) => i.href === "/mentor/programme"));
  assert.ok(TEACHER_NAV.some((i) => i.href === "/teacher/dashboard"));
  assert.equal(new Set(ADMIN_NAV.map((i) => i.href)).size, ADMIN_NAV.length, "no duplicate admin items");
});
