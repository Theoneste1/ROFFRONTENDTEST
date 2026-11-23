"use client";

/**
 * "View as this user" (read only, owner 2026-11-23): shown with the backend's viewAs feature, to a holder of
 * users.impersonate, for a lower-ranked user. Asks for an optional reason, gets a single-use ticket and opens the
 * viewing tab; the administrator's own session stays open here.
 */
import { useState } from "react";
import { Eye } from "lucide-react";
import { viewAsApi } from "@/lib/api/view-as";
import { errorMessage } from "@/lib/api/errors";
import { VIEW_AS_EXPLANATION, viewAsTicketUrl } from "@/lib/auth/view-as";
import { Modal, btnPrimary, btnSecondary } from "../../components/adminUi";

export default function ViewAsButton({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setReason("");
    setError(null);
    setFallbackUrl(null);
  };

  const start = async () => {
    setError(null);
    setFallbackUrl(null);
    setBusy(true);
    // Opened now, while the click still counts (pop-up blockers), with no link back to this tab; the address is set once
    // the single-use ticket is known.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    try {
      const { ticket } = await viewAsApi.start(userId, reason);
      const url = viewAsTicketUrl(ticket);
      if (tab) {
        tab.location.replace(url);
        close();
      } else {
        setFallbackUrl(url);
      }
    } catch (e) {
      tab?.close();
      setError(errorMessage(e, "Could not open the view. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={btnSecondary} onClick={() => setOpen(true)} data-testid="view-as-open">
        <Eye className="h-3.5 w-3.5" aria-hidden="true" /> View as this user
      </button>
      {open && (
        <Modal title={`View as ${name}`} onClose={close}>
          <p className="text-sm text-gray-700">{VIEW_AS_EXPLANATION(name)}</p>
          <label htmlFor="view-as-reason" className="mt-4 block text-xs font-semibold text-gray-700">
            Reason <span className="font-normal text-gray-500">(optional, kept in the audit log)</span>
          </label>
          <textarea
            id="view-as-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          )}
          {fallbackUrl && (
            <p role="status" className="mt-3 text-sm text-gray-700">
              Your browser blocked the new tab.{" "}
              <a href={fallbackUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline" onClick={close}>
                Open the view in a new tab
              </a>{" "}
              (the link works once, for one minute).
            </p>
          )}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className={btnSecondary} onClick={close}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} onClick={start} disabled={busy} data-testid="view-as-start">
              <Eye className="h-3.5 w-3.5" aria-hidden="true" /> {busy ? "Opening…" : "Open the view"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
