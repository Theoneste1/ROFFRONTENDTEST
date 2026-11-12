"use client";

/**
 * Renders its children once `GET /me/permissions` has answered, so a page that
 * shows or hides content by permission never flashes "not permitted" while the
 * list loads. If the list can't be loaded the page is not shown (fail closed);
 * the backend enforces every permission regardless.
 */
import type { ReactNode } from "react";
import { useSession } from "@/lib/auth/session";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";

export default function PermissionsGate({ children }: { children: ReactNode }) {
  const { permissionsStatus, retry } = useSession();
  if (permissionsStatus === "loading") return <LoadingBlock />;
  if (permissionsStatus === "error") {
    return (
      <div className="p-6 lg:p-10">
        <ErrorState error={null} title="Couldn't load your permissions" onRetry={retry} />
      </div>
    );
  }
  return <>{children}</>;
}
