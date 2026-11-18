"use client";

import { useState } from "react";
import type { MentorRequest, MentorRequestStatus } from "@/lib/api/types";
import { useDecideMentorRequest, useMentorRequests } from "@/lib/queries/admin";
import { formatDateTime } from "@/lib/format";
import { coachDetailsText } from "@/lib/accounts/coach-application";
import { LIMITS, latestAnswer, openInfoRequest } from "@/lib/accounts/application-details";
import { AskForInformation, InfoRequestHistory } from "@/app/components/applications/InfoRequests";
import { ErrorState } from "@/app/components/ui/feedback";
import { mentorRequestsApi } from "@/lib/api/admin";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { pictureReviewShown, withPictureDecision } from "@/lib/accounts/application-picture";
import ApplicationPictureReview from "@/app/components/applications/ApplicationPictureReview";
import Pagination from "@/app/components/ui/Pagination";
import { Badge, ConfirmDialog, FilterPills, Notice, TableCard, TableMessage, td, th } from "../../components/adminUi";

const STATUS: Record<MentorRequestStatus, { label: string; badge: string }> = {
  PENDING: { label: "Pending", badge: "bg-amber-50 text-amber-700" },
  APPROVED: { label: "Approved", badge: "bg-emerald-50 text-emerald-700" },
  REJECTED: { label: "Rejected", badge: "bg-gray-100 text-gray-600" },
};

/** Phone, affiliation, expertise, experience, questions and answers (backends with applicationDetails). */
function CoachExtraSummary({ r }: { r: MentorRequest }) {
  const [open, setOpen] = useState(false);
  if (r.infoRequests === undefined) return null;
  const waiting = openInfoRequest(r.infoRequests);
  const answered = latestAnswer(r.infoRequests);
  return (
    <span className="mt-1 block max-w-sm whitespace-normal text-[11px] font-normal text-gray-600" data-testid="coach-application-extra">
      {[r.phone, r.affiliation, r.yearsOfExperience != null ? `${r.yearsOfExperience} years` : ""].filter(Boolean).join(" · ")}
      {waiting && <span className="block text-amber-700">Waiting for the applicant&apos;s answer</span>}
      {!waiting && answered && <span className="block text-emerald-700">Applicant answered</span>}
      {r.status === "REJECTED" && r.rejectionReason && <span className="block">Reason: {r.rejectionReason}</span>}
      <button type="button" className="text-indigo-600 hover:underline" onClick={() => setOpen((o) => !o)}>{open ? "Hide details" : "Details"}</button>
      {open && (
        <span className="block text-gray-700">
          {r.expertise && <span className="block whitespace-pre-line">Expertise: {r.expertise}</span>}
          {r.relevantExperience && <span className="block whitespace-pre-line">Experience: {r.relevantExperience}</span>}
          <InfoRequestHistory requests={r.infoRequests} />
        </span>
      )}
    </span>
  );
}

/** Mentor applications from the public form (`/mentor-requests`). */
export default function ApplicationsPanel() {
  const [status, setStatus] = useState<MentorRequestStatus | "">("PENDING");
  const [page, setPage] = useState(1);
  const [decide, setDecide] = useState<{ request: MentorRequest; decision: "approve" | "reject" } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requests = useMentorRequests({ status: status || undefined, page, limit: 20 });
  const decision = useDecideMentorRequest();
  const { detection } = useBackendCapabilities();
  // Owner policy: the applicant's picture is kept only when the Administrator saw it and ticked the box (unticked by default).
  const [keepPicture, setKeepPicture] = useState(false);
  const [pictureLoaded, setPictureLoaded] = useState(false);
  const pictureReview = decide?.decision === "approve" && pictureReviewShown(detection, decide.request.avatarFileId);
  const openDecision = (request: MentorRequest, d: "approve" | "reject") => {
    setKeepPicture(false);
    setPictureLoaded(false);
    setDecide({ request, decision: d });
  };

  return (
    <>
      {notice && <Notice onClose={() => setNotice(null)}>{notice}</Notice>}
      <div className="mb-6">
        <FilterPills
          label="Application status"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { label: "Pending", value: "PENDING" },
            { label: "Approved", value: "APPROVED" },
            { label: "Rejected", value: "REJECTED" },
            { label: "All", value: "" },
          ]}
        />
      </div>
      {requests.isError ? (
        <ErrorState error={requests.error} title="Couldn't load applications" onRetry={() => requests.refetch()} />
      ) : (
        <TableCard
          footer={
            requests.data && (
              <div className="px-4 pb-4">
                <Pagination page={page} totalPages={requests.data.meta.totalPages} total={requests.data.meta.total} onPage={setPage} disabled={requests.isFetching} />
              </div>
            )
          }
        >
          <thead>
            <tr className="border-b border-gray-100">
              <th className={th}>Applicant</th>
              <th className={th}>Email</th>
              <th className={th}>Applied</th>
              <th className={th}>Status</th>
              <th className={th}>Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/80">
            {requests.isPending ? (
              <TableMessage colSpan={5}>Loading applications…</TableMessage>
            ) : requests.data.data.length === 0 ? (
              <TableMessage colSpan={5}>{status === "PENDING" ? "No applications are waiting for a decision." : "No applications."}</TableMessage>
            ) : (
              requests.data.data.map((r) => (
                <tr key={r.id} className="text-xs hover:bg-gray-50/60">
                  <td className={`${td} font-semibold text-gray-800 whitespace-nowrap`}>
                    {r.firstName} {r.lastName}
                    <span className="block text-[11px] font-normal text-gray-500">@{r.username}</span>
                    {coachDetailsText(r) && (
                      <span className="mt-1 block max-w-xs whitespace-normal text-[11px] font-normal text-gray-600" data-testid="coach-application-details">
                        {coachDetailsText(r)}
                      </span>
                    )}
                    <CoachExtraSummary r={r} />
                  </td>
                  <td className={`${td} text-gray-600`}>{r.email}</td>
                  <td className={`${td} text-gray-600 whitespace-nowrap`}>{formatDateTime(r.createdAt)}</td>
                  <td className={td}>
                    <Badge className={STATUS[r.status].badge}>{STATUS[r.status].label}</Badge>
                  </td>
                  <td className={td}>
                    {r.status === "PENDING" ? (
                      <div className="flex flex-wrap gap-3">
                        <button type="button" onClick={() => openDecision(r, "approve")} className="text-emerald-700 hover:text-emerald-900 font-semibold">
                          Approve
                        </button>
                        <button type="button" onClick={() => openDecision(r, "reject")} className="text-red-600 hover:text-red-800 font-semibold">
                          Reject
                        </button>
                        {r.infoRequests !== undefined && (
                          <AskForInformation kind="COACH" applicationId={r.id} applicantName={`${r.firstName} ${r.lastName}`} requests={r.infoRequests} onAsked={(t) => { setNotice(t); void requests.refetch(); }} />
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableCard>
      )}

      {decide && (
        <ConfirmDialog
          title={decide.decision === "approve" ? "Approve this application?" : "Reject this application?"}
          body={
            decide.decision === "approve"
              ? `A coach account is created for ${decide.request.firstName} ${decide.request.lastName} (${decide.request.email}). Give them course access afterwards on the Coaches tab. They will be notified of the approval by e-mail and in the app.`
              : `${decide.request.firstName} ${decide.request.lastName} can apply again later.`
          }
          confirmLabel={decide.decision === "approve" ? "Approve" : "Reject"}
          tone={decide.decision === "reject" ? "danger" : "primary"}
          // The reason is e-mailed to the applicant (backends with applicationDetails; optional, as before, on older ones).
          note={decide.decision === "reject" && decide.request.infoRequests !== undefined ? { label: "Reason (e-mailed to the applicant)", required: true, min: LIMITS.reason[0], max: LIMITS.reason[1] } : undefined}
          onClose={() => setDecide(null)}
          onConfirm={async (reason) => {
            const picture = withPictureDecision({}, { shown: pictureReview, loaded: pictureLoaded, keep: keepPicture });
            const r = await decision.mutateAsync({
              id: decide.request.id,
              decision: decide.decision,
              ...(reason && { reason }),
              // Only when the picture was reviewed; older backends get no body, as before.
              ...(pictureReview && { approveBody: picture }),
            });
            setNotice(
              r
                ? `Coach account @${r.mentor.username} created${r.emailVerificationRequired ? "; they must confirm their e-mail before the first sign-in" : ""}. Add their course access on the Coaches tab.`
                : "Application rejected.",
            );
          }}
        >
          {pictureReview && (
            <ApplicationPictureReview
              kind="coach"
              applicationId={decide.request.id}
              fetchPicture={mentorRequestsApi.avatar}
              keep={keepPicture}
              onKeepChange={setKeepPicture}
              onLoadedChange={setPictureLoaded}
            />
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
