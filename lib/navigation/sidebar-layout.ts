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

/** Fallback height of one sub-link of an opened group (py-2 text-sm link), used until it can be measured. */
export const DEFAULT_CHILD_PX = 36;

/** Extra height an opened group takes below its toggle: mt-1, its sub-links and the space-y-1 between them. */
export function groupExtraPx(children: number, childPx: number = DEFAULT_CHILD_PX, gapPx = 4): number {
  if (!(children > 0)) return 0;
  return gapPx + children * childPx + (children - 1) * gapPx;
}

/**
 * The same split as {@link splitNav}, but from each item's own height, so an opened group (a toggle plus its
 * sub-links) counts as taller than one row. `heights` are the items' heights in order (without the gap); the "More"
 * button is one row of `morePx`. All items when they fit; otherwise as many as fit above "More", at least
 * `minPrimary`. `availablePx` null = not measured yet: show all.
 */
export function splitByHeights(availablePx: number | null, heights: readonly number[], morePx: number, gapPx = 12, minPrimary = 2): SplitResult {
  const count = heights.length;
  if (availablePx === null) return { primary: count, hasMore: false };
  const avail = Number.isFinite(availablePx) ? availablePx : 0;
  const total = heights.reduce((sum, h) => sum + h, 0) + Math.max(0, count - 1) * gapPx;
  if (total <= avail) return { primary: count, hasMore: false };
  let used = morePx;
  let fit = 0;
  while (fit < count && used + heights[fit] + gapPx <= avail) {
    used += heights[fit] + gapPx;
    fit++;
  }
  const primary = Math.min(count, Math.max(minPrimary, fit));
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

/** The gap kept between the top header and the "More" panel beside the sidebar (rail layout). */
export const MORE_PANEL_HEADER_GAP_PX = 8;
/** The top header's height in the portal shell (PortalShell: the sidebar sits at `top-20`, `calc(100dvh - 5rem)`). */
export const PORTAL_HEADER_FALLBACK = "5rem";

/**
 * Maximum height of the "More" panel beside the sidebar. The panel is anchored at the bottom of the More button and
 * grows upwards, so it may use the space from the button's bottom edge up to `gapPx` below the header's bottom edge
 * (viewport coordinates, e.g. getBoundingClientRect().bottom). Never negative; items beyond it scroll inside the panel.
 */
export function morePanelMaxHeight(anchorBottomPx: number, headerBottomPx: number, gapPx = MORE_PANEL_HEADER_GAP_PX): number {
  return Math.max(0, Math.floor(anchorBottomPx - headerBottomPx - gapPx));
}
