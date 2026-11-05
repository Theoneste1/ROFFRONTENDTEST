"use client";

import { useState } from "react";
import type { MentorRequest, MentorRequestStatus } from "@/lib/api/types";
import { useDecideMentorRequest, useMentorRequests } from "@/lib/queries/admin";
import { formatDateTime } from "@/lib/format";
import { ErrorState } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { Badge, ConfirmDialog, FilterPills, Notice, TableCard, TableMessage, td, th } from "../../components/adminUi";

const STATUS: Record<MentorRequestStatus, { label: string; badge: string }> = {
  PENDING: { label: "Pending", badge: "bg-amber-50 text-amber-700" },
  APPROVED: { label: "Approved", badge: "bg-emerald-50 text-emerald-700" },
  REJECTED: { label: "Rejected", badge: "bg-gray-100 text-gray-500" },
};

/** Mentor applications from the public form (`/mentor-requests`). */
export default function ApplicationsPanel() {
  const [status, setStatus] = useState<MentorRequestStatus | "">("PENDING");
  const [page, setPage] = useState(1);
  const [decide, setDecide] = useState<{ request: MentorRequest; decision: "approve" | "reject" } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requests = useMentorRequests({ status: status || undefined, page, limit: 20 });
  const decision = useDecideMentorRequest();

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
                    <span className="block text-[11px] font-normal text-gray-400">@{r.username}</span>
                  </td>
                  <td className={`${td} text-gray-500`}>{r.email}</td>
                  <td className={`${td} text-gray-500 whitespace-nowrap`}>{formatDateTime(r.createdAt)}</td>
                  <td className={td}>
                    <Badge className={STATUS[r.status].badge}>{STATUS[r.status].label}</Badge>
                  </td>
                  <td className={td}>
                    {r.status === "PENDING" ? (
                      <div className="flex gap-3">
                        <button type="button" onClick={() => setDecide({ request: r, decision: "approve" })} className="text-emerald-700 hover:text-emerald-900 font-semibold">
                          Approve
                        </button>
                        <button type="button" onClick={() => setDecide({ request: r, decision: "reject" })} className="text-red-600 hover:text-red-800 font-semibold">
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
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
              ? `A mentor account is created for ${decide.request.firstName} ${decide.request.lastName} (${decide.request.email}). Give them course access afterwards on the Mentors tab.`
              : `${decide.request.firstName} ${decide.request.lastName} can apply again later.`
          }
          confirmLabel={decide.decision === "approve" ? "Approve" : "Reject"}
          tone={decide.decision === "reject" ? "danger" : "primary"}
          onClose={() => setDecide(null)}
          onConfirm={async () => {
            const r = await decision.mutateAsync({ id: decide.request.id, decision: decide.decision });
            setNotice(
              r
                ? `Mentor account @${r.mentor.username} created${r.emailVerificationRequired ? "; they must confirm their e-mail before the first sign-in" : ""}. Add their course access on the Mentors tab.`
                : "Application rejected.",
            );
          }}
        />
      )}
    </>
  );
}
