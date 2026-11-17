"use client";

/**
 * The navigation list of every portal sidebar, with a "More" menu (rules: lib/navigation/sidebar-layout.ts).
 * It measures the height it is given and shows the items that fit, in their order (most used first); the rest are
 * under "More" at the bottom. "More" opens a panel beside the sidebar — it needs no vertical space, so the sidebar
 * never has to scroll — and closes on a second click, Escape, a click outside, or when a page is chosen. When the
 * current page is under "More", the button is highlighted and names that page. Items arrive already filtered by role
 * and permissions; this component only lays them out (nothing removed, nothing duplicated).
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import { DEFAULT_ITEM_PX, activeInMore, slotsFor, splitNav } from "@/lib/navigation/sidebar-layout";
import { useSidebarPlacement } from "./sidebar-placement";

export interface SidebarChild {
  href: string;
  label: string;
  active: boolean;
}

export interface SidebarItem {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  /** A group (e.g. the student's Assignments): a toggle with sub-links instead of a single link. */
  children?: readonly SidebarChild[];
}

const ITEM = "flex items-center gap-3 w-full py-3 rounded-xl font-medium transition-all";
const ACTIVE = "bg-gradient-to-r from-[#6366F1] to-[#4F46E5] text-white shadow-md shadow-indigo-950/50";
const IDLE = "hover:bg-white/5 text-slate-400 hover:text-white";

// useLayoutEffect warns during server rendering; the measurement only matters in the browser.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const itemActive = (i: SidebarItem) => i.active || !!i.children?.some((c) => c.active);

export default function SidebarNav({ items, isOpen, label = "Main navigation" }: { items: readonly SidebarItem[]; isOpen: boolean; label?: string }) {
  const listRef = useRef<HTMLElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const [slots, setSlots] = useState<number | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const panelId = useId();
  const drawer = useSidebarPlacement() === "drawer";
  // While "More" is open inline in the drawer the list is taller than its share: do not re-measure then (it would
  // move items back and forth).
  const frozen = useRef(false);

  useIsoLayoutEffect(() => {
    frozen.current = drawer && moreOpen;
  }, [drawer, moreOpen]);

  // Measure the available height (and one item's real height) whenever the sidebar or the window changes size.
  useIsoLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => {
      if (frozen.current) return;
      const first = el.querySelector<HTMLElement>("[data-nav-item]");
      const h = first ? first.getBoundingClientRect().height + 12 : DEFAULT_ITEM_PX;
      setSlots(slotsFor(el.clientHeight, h));
    };
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // The panel closes on Escape and on a click outside it.
  useEffect(() => {
    if (!moreOpen || drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [moreOpen, drawer]);

  const { primary, hasMore } = splitNav(items.length, slots);
  const moreActive = hasMore && activeInMore(items.map(itemActive), primary);
  const shown = items.slice(0, primary);
  const extra = hasMore ? items.slice(primary) : [];
  const activeExtra = extra.find(itemActive);

  return (
    <nav aria-label={label} ref={listRef} className={`flex-1 flex flex-col gap-3 ${drawer && moreOpen ? "" : "min-h-0"}`} data-testid="sidebar-nav">
      {shown.map((item) => (
        <NavEntry key={item.href} item={item} isOpen={isOpen} />
      ))}
      {hasMore && (
        <div ref={moreRef} className={drawer ? "mt-auto flex flex-col gap-2" : "relative mt-auto"} data-testid="sidebar-more">
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            aria-controls={panelId}
            aria-haspopup="menu"
            title={activeExtra ? `More pages (current: ${activeExtra.label})` : "More pages"}
            className={`${ITEM} ${isOpen ? "px-4" : "justify-center px-0"} ${moreActive ? ACTIVE : IDLE}`}
            data-testid="sidebar-more-toggle"
          >
            <MoreHorizontal className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
            {isOpen && (
              <span className="flex-1 min-w-0 text-left">
                <span className="block whitespace-nowrap">More</span>
                {activeExtra && <span className="block truncate text-[11px] font-normal opacity-80" data-testid="sidebar-more-current">{activeExtra.label}</span>}
              </span>
            )}
            {isOpen && (drawer
              ? <ChevronDown className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${moreOpen ? "rotate-180" : ""}`} aria-hidden="true" />
              : <ChevronRight className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${moreOpen ? "rotate-180" : ""}`} aria-hidden="true" />)}
          </button>
          <div
            id={panelId}
            role="menu"
            aria-label="More pages"
            className={
              drawer
                ? // Drawer: expands inline below the button (the drawer scrolls if needed).
                  `flex flex-col gap-1 overflow-hidden rounded-xl bg-white/[0.03] transition-all duration-200 ease-out ${moreOpen ? "max-h-[2000px] opacity-100 p-1" : "max-h-0 opacity-0 p-0 invisible"}`
                : // Rail: a panel beside the sidebar, so the sidebar never has to scroll.
                  `absolute bottom-0 left-full ml-3 z-50 w-60 max-h-[80vh] overflow-y-auto rounded-xl bg-[#001E4E] border border-blue-900/60 shadow-2xl p-2 flex flex-col gap-1 transition-all duration-200 ease-out ${
                    moreOpen ? "opacity-100 translate-x-0 visible" : "opacity-0 -translate-x-2 invisible pointer-events-none"
                  }`
            }
            data-testid="sidebar-more-panel"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a")) setMoreOpen(false);
            }}
          >
            {extra.map((item) => (
              <NavEntry key={item.href} item={item} isOpen inPanel />
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}

function NavEntry({ item, isOpen, inPanel }: { item: SidebarItem; isOpen: boolean; inPanel?: boolean }) {
  const Icon = item.icon;
  if (item.children?.length) return <NavGroup item={item} isOpen={isOpen} inPanel={inPanel} />;
  const pad = inPanel ? "px-3 !py-2.5 text-sm" : isOpen ? "px-4" : "justify-center px-0";
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-current={item.active ? "page" : undefined}
      role={inPanel ? "menuitem" : undefined}
      data-nav-item={inPanel ? undefined : ""}
      className={`${ITEM} ${pad} ${item.active ? ACTIVE : IDLE}`}
    >
      <Icon className="h-5 w-5 flex-shrink-0" />
      {isOpen && <span className="whitespace-nowrap">{item.label}</span>}
    </Link>
  );
}

/** A group with sub-links (opened while one of its pages is active), as the student's Assignments menu was. */
function NavGroup({ item, isOpen, inPanel }: { item: SidebarItem; isOpen: boolean; inPanel?: boolean }) {
  const Icon = item.icon;
  const active = itemActive(item);
  // Open while one of its pages is active, unless the user toggled it (no state set in an effect).
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? active;
  return (
    <div>
      <button
        type="button"
        onClick={() => setToggled(!open)}
        title={item.label}
        aria-expanded={open}
        data-nav-item={inPanel ? undefined : ""}
        className={`${ITEM} ${inPanel ? "px-3 !py-2.5 text-sm" : isOpen ? "px-4" : "justify-center px-0"} ${active ? ACTIVE : IDLE}`}
      >
        <Icon className="h-5 w-5 flex-shrink-0" />
        {isOpen && (
          <>
            <span className="whitespace-nowrap flex-1 text-left">{item.label}</span>
            {open ? <ChevronDown className="h-4 w-4 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 flex-shrink-0" />}
          </>
        )}
      </button>
      {open && isOpen && (
        <div className="ml-4 mt-1 space-y-1 border-l-2 border-blue-900/40 pl-4">
          {item.children!.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              aria-current={c.active ? "page" : undefined}
              className={`flex items-center gap-3 w-full py-2 px-3 rounded-lg font-medium text-sm transition-all ${c.active ? "bg-blue-600/20 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
            >
              <span className="whitespace-nowrap">{c.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
