"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { Spinner } from "@/app/components/ui/feedback";

/** Sidebar "Sign Out": `POST /auth/logout`, then the sign-in page. */
export default function SignOutButton({ isOpen }: { isOpen: boolean }) {
  const { logout } = useSession();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    if (pending) return;
    setPending(true);
    await logout();
    router.replace("/login");
  }

  return (
    <button
      type="button"
      title="Sign Out"
      onClick={onClick}
      disabled={pending}
      className={`flex items-center gap-3 w-full py-2.5 rounded-lg hover:bg-red-500/10 text-red-400 hover:text-red-500 transition-all text-sm font-medium mt-2 disabled:opacity-60 ${isOpen ? "px-4" : "justify-center px-0"}`}
    >
      {pending ? <Spinner className="h-4 w-4 !text-current" /> : <LogOut className="h-4 w-4 flex-shrink-0" />}
      {isOpen && <span className="whitespace-nowrap">{pending ? "Signing out…" : "Sign Out"}</span>}
    </button>
  );
}
