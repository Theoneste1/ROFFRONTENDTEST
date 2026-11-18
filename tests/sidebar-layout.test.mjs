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

import { DEFAULT_CHILD_PX, groupExtraPx, splitByHeights } from "../lib/navigation/sidebar-layout.ts";

test("an opened group is taller than one row: its sub-links count", () => {
  assert.equal(groupExtraPx(0), 0);
  assert.equal(groupExtraPx(3, 36), 4 + 3 * 36 + 2 * 4);
  assert.equal(groupExtraPx(2), 4 + 2 * DEFAULT_CHILD_PX + 4);
});

test("split by heights: same result as the row split when every item is one row", () => {
  for (const count of [1, 3, 5, 14]) {
    for (let avail = 0; avail <= 900; avail += 7) {
      const heights = Array(count).fill(48);
      assert.deepEqual(splitByHeights(avail, heights, 48), splitNav(count, slotsFor(avail, 60)), `count ${count}, ${avail}px`);
    }
  }
  assert.deepEqual(splitByHeights(null, [48, 48, 48], 48), { primary: 3, hasMore: false });
});

test("split by heights: opening a group moves the items below it under More instead of overlapping", () => {
  // 7 rows of 48 px with 12 px gaps need 7*48 + 6*12 = 408 px: everything fits in 420 px.
  const closed = Array(7).fill(48);
  assert.deepEqual(splitByHeights(420, closed, 48), { primary: 7, hasMore: false });
  // The 3rd item (a group) opens with 3 sub-links: it no longer fits, so items go under More.
  const opened = closed.map((h, i) => (i === 2 ? h + groupExtraPx(3) : h));
  const split = splitByHeights(420, opened, 48);
  assert.equal(split.hasMore, true);
  const used = opened.slice(0, split.primary).reduce((a, b) => a + b + 12, 0) + 48;
  assert.ok(used <= 420, `shown items plus More fit (${used}px)`);
  // A very short screen still keeps the two most used pages.
  assert.deepEqual(splitByHeights(60, opened, 48), { primary: 2, hasMore: true });
});
