"use client";

/**
 * Requests for more information on a Teacher or Coach application (capability applicationDetails): the history of
 * questions and answers, and "Ask for more information" while the application is PENDING. The application stays
 * PENDING; the applicant answers through a one-time e-mailed link. Rules: lib/accounts/application-details.ts.
 */
import { useState } from "react";
import { applicationInfoApi, INFO_STATE_LABEL, LIMITS, infoRequestState, openInfoRequest, type ApplicationKind, type InfoRequest } from "@/lib/accounts/application-details";
import { errorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/format";
import { ConfirmDialog, linkBtn } from "@/app/admin/components/adminUi";

export function InfoRequestHistory({ requests }: { requests: readonly InfoRequest[] | null | undefined }) {
  if (!requests?.length) return null;
  return (
    <div className="mt-3" data-testid="info-requests">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Questions to the applicant</h3>
      <ol className="space-y-2">
        {requests.map((r) => (
          <li key={r.id} className="rounded-lg border border-gray-100 p-2 text-xs">
            <p className="text-gray-500">
              {formatDateTime(r.requestedAt)}
              {r.requestedBy ? ` · ${r.requestedBy.firstName} ${r.requestedBy.lastName}` : ""} · <strong>{INFO_STATE_LABEL[infoRequestState(r)]}</strong>
            </p>
            <p className="text-gray-800 whitespace-pre-line">Q: {r.question}</p>
            {r.answer && <p className="text-gray-800 whitespace-pre-line mt-1">A: {r.answer}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** "Ask for more information" (PENDING applications only). `onAsked` refreshes the caller's data. */
export function AskForInformation({
  kind,
  applicationId,
  applicantName,
  requests,
  onAsked,
}: {
  kind: ApplicationKind;
  applicationId: string;
  applicantName: string;
  requests: readonly InfoRequest[] | null | undefined;
  onAsked: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const pending = openInfoRequest(requests);
  return (
    <>
      <button type="button" className={linkBtn} onClick={() => setOpen(true)} data-testid="ask-for-information">
        {pending ? "Ask a new question" : "Ask for more information"}
      </button>
      {open && (
        <ConfirmDialog
          title="Ask the applicant for more information"
          body={
            pending
              ? `${applicantName} has not answered the previous question yet. Sending a new one replaces it (the old link stops working).`
              : `${applicantName} receives your question by e-mail with a link to answer (valid 14 days). The application stays pending.`
          }
          confirmLabel="Send question"
          note={{ label: "Question", required: true, min: LIMITS.question[0], max: LIMITS.question[1] }}
          onClose={() => setOpen(false)}
          onConfirm={async (question) => {
            try {
              if (kind === "TEACHER") await applicationInfoApi.requestTeacher(applicationId, question);
              else await applicationInfoApi.requestCoach(applicationId, question);
            } catch (e) {
              throw new Error(errorMessage(e));
            }
            onAsked(`${applicantName}: question sent by e-mail.`);
          }}
        />
      )}
    </>
  );
}
