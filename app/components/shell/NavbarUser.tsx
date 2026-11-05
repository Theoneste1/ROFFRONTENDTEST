"use client";

import { User } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { ROLE_LABEL } from "@/lib/auth/roles";

/** The signed-in user in a portal navbar (same look as the original block). */
export default function NavbarUser({ avatarClassName = "bg-blue-600" }: { avatarClassName?: string }) {
  const { user } = useSession();
  if (!user) return null;
  const fullName = `${user.firstName} ${user.lastName}`.trim() || user.username;

  return (
    <div className="flex items-center gap-2 md:gap-3" title={`${fullName} · ${ROLE_LABEL[user.role]}`}>
      <div className={`h-8 w-8 md:h-10 md:w-10 rounded-full ${avatarClassName} flex items-center justify-center`} aria-hidden="true">
        {user.firstName ? (
          <span className="text-sm md:text-base font-semibold text-white">{user.firstName.charAt(0).toUpperCase()}</span>
        ) : (
          <User className="h-4 w-4 md:h-5 md:w-5 text-white" />
        )}
      </div>

      <div className="hidden lg:flex flex-col">
        <span className="text-sm font-semibold text-gray-800">{fullName}</span>
        <span className="text-xs text-gray-500">{user.email || ROLE_LABEL[user.role]}</span>
      </div>
    </div>
  );
}
