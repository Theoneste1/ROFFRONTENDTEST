/**
 * Portal sidebars with a "More" menu (all portals): which items fit in the visible height and which go under
 * "More", so nobody scrolls the sidebar to find a page. The items keep their order (most used first); the ones that do
 * not fit move, in order, under "More" at the bottom. Nothing is removed, duplicated or re-filtered here: the items
 * passed in are already filtered by role and permissions. Pure; tested in tests/sidebar-layout.test.mjs.
 */

/** Fallback height of one item including the gap below it (py-3 link + gap-3), used until it can be measured. */
export const DEFAULT_ITEM_PX = 60;

/** How many item slots fit in `availablePx` (the gap after the last slot is not needed). */
export function slotsFor(availablePx: number, itemPx: number = DEFAULT_ITEM_PX, gapPx = 12): number {
  if (!Number.isFinite(availablePx) || availablePx <= 0 || itemPx <= 0) return 0;
  return Math.max(0, Math.floor((availablePx + gapPx) / itemPx));
}

export interface SplitResult {
  /** Indexes shown directly. */
  primary: number;
  /** True when some items go under "More" (the "More" button takes one slot). */
  hasMore: boolean;
}

/**
 * All items when they fit; otherwise the first `slots - 1` (one slot is the "More" button), at least `minPrimary`
 * (so the most-used pages stay visible even on a very short screen). `slots` null = not measured yet: show all.
 */
export function splitNav(count: number, slots: number | null, minPrimary = 2): SplitResult {
  if (slots === null || count <= slots) return { primary: count, hasMore: false };
  const primary = Math.min(count, Math.max(minPrimary, slots - 1));
  return { primary, hasMore: primary < count };
}

/** Whether the active page is among the items under "More" (then "More" opens and shows as active). */
export function activeInMore(active: readonly boolean[], primary: number): boolean {
  return active.slice(primary).some(Boolean);
}

/** The standard active rule of the portal menus: the home page only on itself, other pages with their sub-pages. */
export function isActivePath(pathname: string, href: string, home: string): boolean {
  if (href === home) return pathname === home;
  return pathname === href || pathname.startsWith(`${href}/`);
}
