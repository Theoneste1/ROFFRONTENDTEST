"use client";

import Link from "next/link";
import { User } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { portalPath, roleLabel } from "@/lib/auth/roles";

/** The signed-in user in a portal navbar (same look as the original block); opens "My profile". */
export default function NavbarUser({ avatarClassName = "bg-blue-600" }: { avatarClassName?: string }) {
  const { user } = useSession();
  if (!user) return null;
  const fullName = `${user.firstName} ${user.lastName}`.trim() || user.username;

  return (
    <Link
      href={portalPath(user.role, "profile")}
      className="flex items-center gap-2 md:gap-3 rounded-xl p-1 -m-1 hover:bg-gray-200/50 transition-colors"
      title={`${fullName} · ${roleLabel(user.role)} — My profile`}
      aria-label={`My profile (${fullName})`}
    >
      <div className={`h-8 w-8 md:h-10 md:w-10 rounded-full ${avatarClassName} flex items-center justify-center`} aria-hidden="true">
        {user.firstName ? (
          <span className="text-sm md:text-base font-semibold text-white">{user.firstName.charAt(0).toUpperCase()}</span>
        ) : (
          <User className="h-4 w-4 md:h-5 md:w-5 text-white" />
        )}
      </div>

      <div className="hidden lg:flex flex-col">
        <span className="text-sm font-semibold text-gray-800">{fullName}</span>
        <span className="text-xs text-gray-500">{user.email || roleLabel(user.role)}</span>
      </div>
    </Link>
  );
}
