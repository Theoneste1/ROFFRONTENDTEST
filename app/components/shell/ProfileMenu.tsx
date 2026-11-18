"use client";

/**
 * The signed-in user in every portal's top bar: their avatar, "Theoneste N" and their account title
 * (from the backend role: Student, Coach, Teacher, Head Coach, Administrator, Super Administrator;
 * never the e-mail). It opens the profile menu: My Profile, Settings, Help and Support, Logout
 * (lib/accounts/profile-menu.ts).
 *
 * Menu-button pattern (WAI-ARIA APG): Enter, Space or ArrowDown opens it on the first item, ArrowUp
 * on the last; ArrowUp/ArrowDown move (wrapping), Home/End jump; Escape closes it and returns focus to
 * the button; Tab, a click outside or choosing an item closes it. Logout is the session's own logout
 * (POST /auth/logout and the local sign-out), exactly like the sidebar's Sign Out.
 */
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, CircleHelp, LogOut, Settings, UserRound } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { accountTitle, profileMenuItems, type ProfileMenuKey } from "@/lib/accounts/profile-menu";
import { avatarLabel, displayName } from "@/lib/accounts/avatar";
import { Spinner } from "@/app/components/ui/feedback";
import { AvatarBadge } from "@/app/components/account/UserAvatar";

const ICON: Record<ProfileMenuKey, typeof UserRound> = { profile: UserRound, settings: Settings, help: CircleHelp, logout: LogOut };

export default function ProfileMenu() {
  const { user, logout } = useSession();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const pendingFocus = useRef<"first" | "last" | null>(null);

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  const focusItem = (i: number) => {
    const list = items();
    if (list.length) list[(i + list.length) % list.length].focus();
  };

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  // Focus the requested item once the menu is rendered.
  useEffect(() => {
    if (!open || !pendingFocus.current) return;
    const list = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (list.length) (pendingFocus.current === "last" ? list[list.length - 1] : list[0]).focus();
    pendingFocus.current = null;
  }, [open]);

  // A click or tap outside closes it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, close]);

  if (!user) return null;
  const title = accountTitle(user.role);
  const label = avatarLabel(user);

  const openMenu = (focus: "first" | "last") => {
    pendingFocus.current = focus;
    setOpen(true);
  };

  const onButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openMenu("first");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openMenu("last");
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      close(true);
    }
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") { e.preventDefault(); focusItem(i + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusItem(i - 1); }
    else if (e.key === "Home") { e.preventDefault(); focusItem(0); }
    else if (e.key === "End") { e.preventDefault(); focusItem(list.length - 1); }
    else if (e.key === "Escape") { e.preventDefault(); close(true); }
    else if (e.key === "Tab") close(false);
  };

  async function onLogout() {
    if (signingOut) return;
    setSigningOut(true);
    await logout();
  }

  const itemCls =
    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 outline-none transition-colors hover:bg-indigo-50 hover:text-[#001E4E] focus-visible:bg-indigo-50 focus-visible:text-[#001E4E] focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-60";

  return (
    <div ref={rootRef} className="relative" data-testid="profile-menu">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close(false) : openMenu("first"))}
        onKeyDown={onButtonKey}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Account menu: ${displayName(user)}, ${title}`}
        className="flex items-center gap-2 rounded-xl p-1 -m-1 transition-colors hover:bg-white/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 md:gap-3"
        data-testid="profile-menu-button"
      >
        <AvatarBadge user={user} size="md" />
        <span className="hidden min-w-0 flex-col items-start text-left lg:flex">
          <span className="max-w-[12rem] truncate text-sm font-semibold text-slate-900" data-testid="profile-menu-name">{label}</span>
          <span className="text-xs font-medium text-amber-800" data-testid="profile-menu-title">{title}</span>
        </span>
        <ChevronDown className={`hidden h-4 w-4 text-slate-600 transition-transform lg:block ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKey}
          className="absolute right-0 top-full z-40 mt-3 w-72 max-w-[calc(100vw-1.5rem)] origin-top-right rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-indigo-950/10"
          data-testid="profile-menu-list"
        >
          <div className="flex items-center gap-3 rounded-xl bg-gradient-to-br from-[#001E4E] to-[#00428c] px-3 py-3 text-white" role="none">
            <AvatarBadge user={user} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{displayName(user)}</p>
              <p className="text-xs font-medium text-amber-300" data-testid="profile-menu-heading-title">{title}</p>
            </div>
          </div>
          <div className="mt-2 flex flex-col gap-0.5" role="none">
            {profileMenuItems(user.role).map((item) => {
              const Icon = ICON[item.key];
              const isLogout = item.key === "logout";
              return item.href ? (
                <Link key={item.key} href={item.href} role="menuitem" tabIndex={-1} className={itemCls} onClick={() => close(false)} data-menu-item={item.key}>
                  <Icon className="h-4 w-4 flex-shrink-0 text-[#00428c]" aria-hidden="true" />
                  {item.label}
                </Link>
              ) : (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={onLogout}
                  disabled={signingOut}
                  className={`${itemCls} mt-1 border-t border-slate-100 pt-3 ${isLogout ? "text-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:bg-red-50 focus-visible:text-red-700" : ""}`}
                  data-menu-item={item.key}
                >
                  {signingOut ? <Spinner className="h-4 w-4 !text-current" /> : <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />}
                  {signingOut ? "Signing out…" : item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
