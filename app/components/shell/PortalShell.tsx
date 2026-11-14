'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import PortalNavbar from "@/app/components/shell/PortalNavbar";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";

const DESKTOP_QUERY = "(min-width: 768px)";
const SIDEBAR_ID = "portal-sidebar";

function subscribeDesktop(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** Whether the viewport is at least the `md` breakpoint (desktop layout). */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
}

/**
 * The authenticated portal frame shared by the student, administrator, coach
 * and teacher portals: the top bar, the sidebar and the page.
 *
 * - md and up: the sidebar sits beside the page; the hamburger collapses it to
 *   the 80 px icon rail and back.
 * - below md: the sidebar is an off-canvas drawer over the page (hidden by
 *   default). The hamburger opens it; a route change, a click on the backdrop
 *   or Escape closes it. Focus moves into the drawer and back to the hamburger.
 */
export default function PortalShell({
  avatarClassName,
  renderSidebar,
  children,
}: {
  avatarClassName: string;
  /** The portal's sidebar; `isOpen` false renders the collapsed icon rail. */
  renderSidebar: (isOpen: boolean) => ReactNode;
  children: ReactNode;
}) {
  const isDesktop = useIsDesktop();
  const pathname = usePathname();
  const [railOpen, setRailOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const drawerVisible = !isDesktop && drawerOpen;

  // Close the drawer when the page changes (a drawer link was followed) or the layout becomes desktop.
  const [shownPath, setShownPath] = useState(pathname);
  if (shownPath !== pathname) {
    setShownPath(pathname);
    setDrawerOpen(false);
  }

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => {
    if (!drawerVisible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", onKey);
    // The page behind the drawer does not scroll while it is open.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [drawerVisible, closeDrawer]);

  useFocusTrap(drawerRef, drawerVisible, { returnTo: menuButtonRef });

  const toggle = () => (isDesktop ? setRailOpen((o) => !o) : setDrawerOpen((o) => !o));

  return (
    <div className="min-h-screen w-full bg-[#e2e8f0] overflow-x-hidden flex flex-col">
      <div className="w-full flex-shrink-0">
        <PortalNavbar
          onMenuClick={toggle}
          avatarClassName={avatarClassName}
          menuButtonRef={menuButtonRef}
          menuExpanded={isDesktop ? railOpen : drawerOpen}
          menuControls={SIDEBAR_ID}
        />
      </div>

      <div className="flex w-full flex-1">
        {isDesktop ? (
          <div id={SIDEBAR_ID} className="flex-shrink-0 self-stretch">
            {renderSidebar(railOpen)}
          </div>
        ) : (
          <>
            <div
              aria-hidden="true"
              onClick={closeDrawer}
              className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${drawerOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            />
            <div
              id={SIDEBAR_ID}
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Main menu"
              inert={!drawerOpen}
              // Opening shows the drawer at once (so focus can move in); closing hides it after the slide.
              className={`fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] overflow-y-auto bg-[#001E4E] shadow-2xl duration-300 ease-in-out [&>aside]:h-auto [&>aside]:min-h-full [&>aside]:w-full ${
                drawerOpen ? "translate-x-0 visible transition-transform" : "-translate-x-full invisible transition-[transform,visibility]"
              }`}
            >
              {renderSidebar(true)}
            </div>
          </>
        )}

        <main className="flex-1 min-w-0 w-full">{children}</main>
      </div>
    </div>
  );
}
