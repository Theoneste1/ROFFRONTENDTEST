"use client";

/**
 * Subscribers (`/admin/subscribers`, capability `subscribers`, permission subscribers.manage; owner 2026-11-23): the ROF
 * news mailing list — counts, a filterable list (filters in the address), add, import, edit, unsubscribe / subscribe
 * again, erase, CSV export — and mailings: compose and send an update, and the history with delivery counts.
 * Rules: lib/subscribers/rules.ts; backend: docs/SUBSCRIBERS.md.
 */
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth/session";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { useSubscriberSummary } from "@/lib/queries/subscribers";
import { subscribersPageMode } from "@/lib/subscribers/rules";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { AdminPage, FilterPills, MetricCard, Notice } from "../components/adminUi";
import SubscriberList from "./SubscriberList";
import MailingComposer from "./MailingComposer";
import MailingHistory from "./MailingHistory";

type Tab = "list" | "compose" | "mailings";
const TABS: readonly Tab[] = ["list", "compose", "mailings"];

export default function SubscribersAdmin() {
  const { permissionsStatus, can, retry: retrySession } = useSession();
  const caps = useBackendCapabilities();
  const mode = subscribersPageMode({ detection: caps.detection, detectionLoading: caps.loading, permissionsStatus, can });
  const visible = mode === "visible";
  const summary = useSubscriberSummary(visible);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tabParam = params.get("tab");
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "list";
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  function setTab(t: Tab) {
    router.replace(t === "list" ? pathname : `${pathname}?tab=${t}`, { scroll: false });
  }

  if (!visible) {
    return (
      <AdminPage title="Subscribers">
        {mode === "loading" && <LoadingBlock />}
        {mode === "error" && <ErrorState error={null} title="Couldn't load your permissions" onRetry={retrySession} />}
        {mode === "unsupported" && <Notice tone="info">This server does not provide the news mailing list yet.</Notice>}
        {mode === "forbidden" && <Notice tone="info">The mailing list needs the subscribers.manage permission. Ask a Super Administrator.</Notice>}
      </AdminPage>
    );
  }

  const s = summary.data;
  return (
    <AdminPage
      title="Subscribers"
      description="People who asked for ROF news and Olympiad announcements by e-mail. Every e-mail they receive has an unsubscribe link; every change here is recorded in the audit log."
    >
      {notice && (
        <Notice tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6" data-testid="subscriber-summary">
        <MetricCard label="Subscribed" value={s ? s.active.toLocaleString() : "…"} subtext="Receive mailings" />
        <MetricCard label="Unsubscribed" value={s ? s.unsubscribed.toLocaleString() : "…"} subtext="Never mailed again" />
        <MetricCard label="Mathematics" value={s ? s.byInterest.MATHEMATICS.toLocaleString() : "…"} subtext="Subscribed, by interest" />
        <MetricCard label="Physics" value={s ? s.byInterest.PHYSICS.toLocaleString() : "…"} subtext="Subscribed, by interest" />
        <MetricCard label="Computing" value={s ? s.byInterest.COMPUTING.toLocaleString() : "…"} subtext={s ? `${s.byInterest.ALL_SUBJECTS.toLocaleString()} chose all subjects` : undefined} />
      </div>
      {summary.isError && <Notice tone="error">The counts could not be loaded. Reload the page to try again.</Notice>}

      <div className="mb-6">
        <FilterPills
          label="Section"
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={[
            { label: "Subscribers", value: "list" },
            { label: "Send an update", value: "compose" },
            { label: "Mailings sent", value: "mailings" },
          ]}
        />
      </div>

      {tab === "list" && <SubscriberList onNotice={(tone, text) => setNotice({ tone, text })} />}
      {tab === "compose" && (
        <MailingComposer
          onSent={(text) => {
            setNotice({ tone: "success", text });
            setTab("mailings");
          }}
        />
      )}
      {tab === "mailings" && <MailingHistory onNotice={(tone, text) => setNotice({ tone, text })} />}
    </AdminPage>
  );
}
