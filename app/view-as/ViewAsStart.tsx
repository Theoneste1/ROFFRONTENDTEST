"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EyeOff } from "lucide-react";
import { viewAsApi } from "@/lib/api/view-as";
import { errorMessage } from "@/lib/api/errors";
import { portalHome } from "@/lib/auth/roles";
import { VIEW_AS_ENDED_TEXT, clearViewingSession, saveViewingSession } from "@/lib/auth/view-as";
import { LoadingBlock } from "@/app/components/ui/feedback";

function Message({ title, text }: { title: string; text: string }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center" data-testid="view-as-message">
      <EyeOff className="h-10 w-10 text-brand" aria-hidden="true" />
      <h1 className="text-xl font-bold text-gray-900">{title}</h1>
      <p className="text-sm text-gray-700">{text}</p>
      <button type="button" onClick={() => window.close()} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
        Close this tab
      </button>
    </main>
  );
}

export default function ViewAsStart() {
  const params = useSearchParams();
  const ended = params.get("ended") === "1";
  const ticket = params.get("ticket");
  const [failure, setFailure] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (ended || !ticket || started.current) return;
    started.current = true;
    // The ticket works once: take it out of the address (history, screenshots) before using it.
    window.history.replaceState(null, "", "/view-as");
    (async () => {
      try {
        const res = await viewAsApi.exchange(ticket);
        saveViewingSession({ accessToken: res.accessToken, expiresAt: res.expiresAt, viewAs: res.viewAs });
        // A full load, so the whole app starts in viewing mode with this tab's token.
        window.location.replace(portalHome(res.viewAs.target.role));
      } catch (e) {
        clearViewingSession();
        setFailure(errorMessage(e, "This viewing link did not work. Start again from the user's page."));
      }
    })();
  }, [ended, ticket]);

  if (ended) return <Message title="This viewing session has ended" text={VIEW_AS_ENDED_TEXT} />;
  if (!ticket) return <Message title="Nothing to show" text="Open this tab with “View as this user” on a user's page." />;
  if (failure) return <Message title="Could not open the view" text={failure} />;
  return <LoadingBlock label="Opening the view…" />;
}
