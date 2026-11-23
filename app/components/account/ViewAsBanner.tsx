"use client";

/**
 * "View as" (read only): a persistent banner at the top of every page of a viewing tab. "Return to my account" ends the
 * viewing session on the server, forgets it in this tab and closes the tab (or, when the browser does not allow
 * closing it, goes back to the user's page with the administrator's own session).
 */
import { useState } from "react";
import { Eye } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { viewAsBannerText } from "@/lib/auth/view-as";

export default function ViewAsBanner() {
  const { viewAs, endViewing } = useSession();
  const [leaving, setLeaving] = useState(false);
  if (!viewAs) return null;

  const leave = async () => {
    setLeaving(true);
    const targetId = viewAs.target.id;
    await endViewing();
    window.close();
    // Not closable (not opened by a script): back to the user's page as yourself (this tab's viewing token is gone).
    setTimeout(() => window.location.replace(`/admin/users/${encodeURIComponent(targetId)}`), 300);
  };

  return (
    <div
      role="region"
      aria-label="Viewing as another user"
      data-testid="view-as-banner"
      className="sticky top-0 z-[60] w-full bg-brand text-white shadow-md"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 font-medium sm:items-center">
          <Eye className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" aria-hidden="true" />
          <span>
            {viewAsBannerText(viewAs)} <span className="font-normal text-brand-100">Nothing can be changed here.</span>
          </span>
        </p>
        <button
          type="button"
          onClick={leave}
          disabled={leaving}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand disabled:opacity-70"
          data-testid="view-as-return"
        >
          {leaving ? "Returning…" : "Return to my account"}
        </button>
      </div>
    </div>
  );
}
