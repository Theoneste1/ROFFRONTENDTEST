"use client";

/**
 * Teacher applications (`/admin/teacher-applications`, users.manageTeachers), only on a backend
 * advertising `teacherSelfRegistration`. An application is PENDING until an Administrator decides:
 *   listed school  → approve (confirm, optional note) or reject (reason)
 *   missing school → approve only after choosing an official school (a new school is first
 *                    created under Schools → directory), or reject (reason)
 * Approval creates the TEACHER account and its school assignment; nothing exists before.
 */
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  teacherApplicationsAdminApi,
  type TeacherApplication,
  type TeacherApplicationStatus,
} from "@/lib/api/teacher-registration";
import type { DirectorySchool } from "@/lib/api/accounts";
import { ApiError, errorMessage, isApiError } from "@/lib/api/errors";
import { useSession } from "@/lib/auth/session";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { useSchoolLocations } from "@/lib/queries/school-directory";
import { queryKeys } from "@/lib/query/keys";
import { formatDate, formatDateTime } from "@/lib/format";
import { countryLabel } from "@/lib/accounts/school-claim";
import { districtsOf, provincesOf, subjectLabel } from "@/lib/accounts/teacher-registration";
import {
  APPROVAL_NOTE_MAX,
  REFRESH_AFTER,
  REJECTION_REASON,
  TEACHER_APPLICATION_STATUSES,
  TEACHER_REVIEW_ERRORS,
  applicationSchoolPlace,
  approvalNeedsSchool,
  approvalPayload,
  teacherReviewMode,
} from "@/lib/admin/teacher-applications";
import { Alert, ErrorState, LoadingBlock, Spinner } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { DistrictSchoolSelect, PlaceSelect } from "@/app/components/account/SchoolPlaceFields";
import { AdminPage, ConfirmDialog, FilterPills, Modal, Notice, TableCard, TableMessage, btnPrimary, linkBtn, td, th } from "../components/adminUi";

/** The backend's error with a message for its code (shown by the dialogs). */
function explain(e: unknown): unknown {
  if (isApiError(e) && TEACHER_REVIEW_ERRORS[e.code]) return new ApiError(e.status, e.code, TEACHER_REVIEW_ERRORS[e.code], e.details, e.requestId);
  return e;
}

const fullName = (a: { firstName: string; lastName: string }) => `${a.firstName} ${a.lastName}`;

export default function TeacherApplicationsReview() {
  const caps = useBackendCapabilities();
  const { permissionsStatus, can } = useSession();
  const mode = teacherReviewMode({ detection: caps.detection, detectionLoading: caps.loading, permissionsStatus, can });
  const qc = useQueryClient();
  const [status, setStatus] = useState<TeacherApplicationStatus>("PENDING");
  const [page, setPage] = useState(1);
  const filters = { status, page, limit: 20 };
  const list = useQuery({
    queryKey: queryKeys.teacherApplications.list(filters),
    queryFn: () => teacherApplicationsAdminApi.list(filters),
    enabled: mode === "review",
    placeholderData: keepPreviousData,
  });
  const [viewing, setViewing] = useState<TeacherApplication | null>(null);
  const [approving, setApproving] = useState<TeacherApplication | null>(null);
  const [rejecting, setRejecting] = useState<TeacherApplication | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.teacherApplications.all });
  const onError = (e: unknown) => {
    if (isApiError(e) && REFRESH_AFTER.includes(e.code)) void refresh();
    return explain(e);
  };

  if (mode === "loading") {
    return (
      <AdminPage title="Teacher applications">
        <LoadingBlock />
      </AdminPage>
    );
  }
  if (mode === "hidden") {
    return (
      <AdminPage title="Teacher applications">
        <Notice tone="info">Teacher applications need the users.manageTeachers permission on a server that supports teacher self-registration.</Notice>
      </AdminPage>
    );
  }

  const rows = list.data?.data ?? [];
  return (
    <AdminPage title="Teacher applications" description="Teachers who applied for an account. Approving creates the Teacher account and assigns it to the school.">
      {notice && (
        <Notice tone="success" onClose={() => setNotice(null)}>
          {notice}
        </Notice>
      )}
      <div className="mb-6">
        <FilterPills
          label="Status"
          options={[...TEACHER_APPLICATION_STATUSES]}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
      </div>
      {list.isError ? (
        <ErrorState error={list.error} title="Couldn't load the teacher applications" onRetry={() => list.refetch()} />
      ) : (
        <TableCard footer={list.data && <Pagination page={page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} disabled={list.isFetching} />}>
          <thead className="bg-gray-50/60 border-b border-gray-100">
            <tr>
              <th className={th}>Applicant</th>
              <th className={th}>School</th>
              <th className={th}>Subjects</th>
              <th className={th}>{status === "PENDING" ? "Sent" : "Decided"}</th>
              <th className={`${th} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50" data-testid="teacher-applications">
            {list.isPending ? (
              <TableMessage colSpan={5}>Loading…</TableMessage>
            ) : rows.length === 0 ? (
              <TableMessage colSpan={5}>No {TEACHER_APPLICATION_STATUSES.find((s) => s.value === status)!.label.toLowerCase()} applications.</TableMessage>
            ) : (
              rows.map((a) => (
                <tr key={a.id}>
                  <td className={td}>
                    <p className="font-semibold text-gray-800">{fullName(a)}</p>
                    <p className="text-xs text-gray-400">
                      @{a.username} · {a.email}
                    </p>
                  </td>
                  <td className={`${td} text-gray-700`}>
                    <SchoolCell app={a} />
                  </td>
                  <td className={`${td} text-xs text-gray-600`}>{a.olympiadInterests.map(subjectLabel).join(", ")}</td>
                  <td className={`${td} text-xs text-gray-600`}>
                    {a.status === "PENDING" ? (
                      formatDate(a.createdAt)
                    ) : (
                      <>
                        {formatDate(a.decidedAt)}
                        {a.decidedBy && <span className="block text-gray-400">by {fullName(a.decidedBy)}</span>}
                      </>
                    )}
                  </td>
                  <td className={`${td} text-right whitespace-nowrap space-x-3`}>
                    <button type="button" className={linkBtn} onClick={() => setViewing(a)}>
                      View
                    </button>
                    {a.status === "PENDING" && (
                      <>
                        <button type="button" className={linkBtn} onClick={() => setApproving(a)}>
                          Approve
                        </button>
                        <button type="button" className={linkBtn} onClick={() => setRejecting(a)}>
                          Reject
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableCard>
      )}

      {viewing && (
        <DetailDialog
          app={viewing}
          onClose={() => setViewing(null)}
          onApprove={(a) => {
            setViewing(null);
            setApproving(a);
          }}
          onReject={(a) => {
            setViewing(null);
            setRejecting(a);
          }}
        />
      )}
      {approving && (
        <ApproveDialog
          app={approving}
          onClose={() => setApproving(null)}
          onError={onError}
          onApproved={(text) => {
            setNotice(text);
            void refresh();
          }}
        />
      )}
      {rejecting && (
        <ConfirmDialog
          title="Reject this application?"
          body={`${fullName(rejecting)} (@${rejecting.username}). No account is created.`}
          confirmLabel="Reject"
          tone="danger"
          note={{ label: "Reason", required: true, min: REJECTION_REASON.min, max: REJECTION_REASON.max }}
          onClose={() => setRejecting(null)}
          onConfirm={async (reason) => {
            try {
              await teacherApplicationsAdminApi.reject(rejecting.id, reason);
            } catch (e) {
              throw onError(e);
            }
            setNotice(`${fullName(rejecting)}: application rejected.`);
            void refresh();
          }}
        />
      )}
    </AdminPage>
  );
}

function SchoolCell({ app }: { app: TeacherApplication }) {
  const place = applicationSchoolPlace(app);
  if (app.school) {
    return (
      <>
        {app.school.name}
        <span className="block text-xs text-gray-400">
          {app.school.code ? `code ${app.school.code} · ` : ""}
          {place}
        </span>
      </>
    );
  }
  return (
    <>
      {app.proposedSchoolName ?? "—"} <span className="text-[11px] text-amber-700">(not in the directory)</span>
      <span className="block text-xs text-gray-400">{place || "No place given"}</span>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-3 py-2">
      <dt className="text-xs font-semibold text-gray-500">{label}</dt>
      <dd className="sm:col-span-2 text-sm text-gray-800 break-words">{children}</dd>
    </div>
  );
}

function DetailDialog({ app, onClose, onApprove, onReject }: { app: TeacherApplication; onClose: () => void; onApprove: (a: TeacherApplication) => void; onReject: (a: TeacherApplication) => void }) {
  const detail = useQuery({ queryKey: queryKeys.teacherApplications.detail(app.id), queryFn: () => teacherApplicationsAdminApi.get(app.id), placeholderData: app });
  const a = detail.data ?? app;
  const status = TEACHER_APPLICATION_STATUSES.find((s) => s.value === a.status)?.label ?? a.status;
  return (
    <Modal wide title={`${fullName(a)} — teacher application`} onClose={onClose}>
      <div data-testid="teacher-application-detail">
        {detail.isError && <Alert tone="error">Couldn&apos;t refresh this application: {errorMessage(detail.error)}</Alert>}
        <dl className="divide-y divide-gray-100">
          <Row label="Status">{status}</Row>
          <Row label="Username">@{a.username}</Row>
          <Row label="E-mail">{a.email}</Row>
          <Row label="Phone">{a.phone}</Row>
          <Row label="Country">{countryLabel(a.country)}</Row>
          <Row label="Olympiad interests">{a.olympiadInterests.map(subjectLabel).join(", ") || "—"}</Row>
          {a.school ? (
            <Row label="School">
              {a.school.name}
              <span className="block text-xs text-gray-500">
                {a.school.code ? `School code ${a.school.code}` : "No school code"} · Sector {a.school.sector ?? "—"} · {[a.school.district, a.school.province].filter(Boolean).join(", ")}
              </span>
            </Row>
          ) : (
            <Row label="School (not listed)">
              {a.proposedSchoolName ?? "—"}
              <span className="block text-xs text-gray-500">{[a.schoolSector, a.schoolDistrict, a.schoolProvince].filter(Boolean).join(", ") || "No place given"}</span>
            </Row>
          )}
          <Row label="Home location">{[a.homeSector, a.homeDistrict].filter(Boolean).join(", ") || "—"}</Row>
          <Row label="Applied">{formatDateTime(a.createdAt)}</Row>
          {a.status !== "PENDING" && (
            <>
              <Row label="Decided">
                {formatDateTime(a.decidedAt)}
                {a.decidedBy && ` by ${fullName(a.decidedBy)}`}
              </Row>
              {a.assignedSchool && (
                <Row label="Assigned school">
                  {a.assignedSchool.name}
                  {a.assignedSchool.code ? ` (code ${a.assignedSchool.code})` : ""}
                </Row>
              )}
              {a.rejectionReason && <Row label="Rejection reason">{a.rejectionReason}</Row>}
              {a.decisionNote && <Row label="Note">{a.decisionNote}</Row>}
            </>
          )}
        </dl>
        {a.status === "PENDING" && (
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" className="px-5 py-2 text-sm text-red-600" onClick={() => onReject(a)}>
              Reject
            </button>
            <button type="button" className={btnPrimary} onClick={() => onApprove(a)}>
              Approve
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ApproveDialog({ app, onClose, onError, onApproved }: { app: TeacherApplication; onClose: () => void; onError: (e: unknown) => unknown; onApproved: (notice: string) => void }) {
  const needsSchool = approvalNeedsSchool(app);
  const locations = useSchoolLocations();
  const [province, setProvince] = useState(needsSchool ? app.schoolProvince ?? "" : "");
  const [district, setDistrict] = useState(needsSchool ? app.schoolDistrict ?? "" : "");
  const [school, setSchool] = useState<DirectorySchool | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    const p = approvalPayload(app, school?.id ?? null, note);
    if (!p.ok) {
      setError(p.problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await teacherApplicationsAdminApi.approve(app.id, p.body);
      onApproved(
        `${fullName(app)}: approved. Teacher account @${res.teacher.username} created${res.emailVerificationRequired ? "; an activation e-mail was sent" : ""}.`,
      );
      onClose();
    } catch (e) {
      setError(errorMessage(onError(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal wide={needsSchool} title="Approve this application?" onClose={busy ? () => undefined : onClose}>
      <div className="space-y-4" data-testid="teacher-approve-dialog">
        <p className="text-sm text-gray-600">
          {fullName(app)} (@{app.username}) gets a Teacher account and sees the verified students of the school below.
        </p>
        {needsSchool ? (
          <>
            <Alert tone="info">
              The applicant&apos;s school <strong>{app.proposedSchoolName}</strong> ({applicationSchoolPlace(app) || "no place given"}) is not in the directory. Choose the official school to
              assign. If it doesn&apos;t exist yet, first create it under{" "}
              <Link href="/admin/schools" className="font-semibold underline">
                Schools → directory
              </Link>
              , then come back.
            </Alert>
            {locations.isError ? (
              <ErrorState error={locations.error} title="Couldn't load the list of places" onRetry={() => void locations.refetch()} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <PlaceSelect
                  label="Province"
                  value={province}
                  onChange={(v) => {
                    setProvince(v);
                    setDistrict("");
                    setSchool(null);
                  }}
                  options={provincesOf(locations.data)}
                  placeholder={locations.isPending ? "Loading…" : "Choose"}
                  disabled={locations.isPending}
                />
                <PlaceSelect
                  label="District"
                  value={district}
                  onChange={(v) => {
                    setDistrict(v);
                    setSchool(null);
                  }}
                  options={districtsOf(locations.data, province)}
                  disabled={!province}
                />
              </div>
            )}
            <DistrictSchoolSelect province={province} district={district} value={school} onChange={setSchool} />
          </>
        ) : (
          <p className="text-sm text-gray-800">
            School: <strong>{app.school!.name}</strong>
            {app.school!.code ? ` (code ${app.school!.code})` : ""}
            <span className="block text-xs text-gray-500">{applicationSchoolPlace(app)}</span>
          </p>
        )}
        <div>
          <label htmlFor="approve-note" className="block text-xs font-semibold text-gray-600 mb-1">
            Note <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            id="approve-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={APPROVAL_NOTE_MAX}
            className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="px-5 py-2 text-sm text-gray-600 disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={approve} disabled={busy || (needsSchool && !school)} className={btnPrimary}>
            {busy && <Spinner className="h-3.5 w-3.5 !text-white" />}
            Approve
          </button>
        </div>
      </div>
    </Modal>
  );
}
