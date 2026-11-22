"use client";

/**
 * Teacher applications (`/admin/teacher-applications`, users.manageTeachers), only on a backend
 * advertising `teacherSelfRegistration`. An application is PENDING until an Administrator decides:
 *   listed school  → approve (confirm, optional note) or reject (reason)
 *   missing school → first "Verify school": the Administrator matches an EXISTING official school
 *                    (a new school is first created under Schools → directory, never a duplicate);
 *                    the applicant is e-mailed that the school was verified and the application
 *                    stays PENDING. Approve is disabled until then. Reject (reason) at any time.
 * Approval never chooses a school; it creates the TEACHER account and its school assignment and
 * notifies the teacher (e-mail and in-app). Nothing exists before.
 * The rules live in lib/admin/teacher-applications.ts (unit-tested).
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
import { interpretSaveError } from "@/lib/admin/school-directory";
import type { DuplicateCandidate } from "@/lib/api/school-directory";
import { useSession } from "@/lib/auth/session";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { queryKeys } from "@/lib/query/keys";
import { formatDate, formatDateTime } from "@/lib/format";
import { countryLabel } from "@/lib/accounts/school-claim";
import {
  APPROVAL_NOTE_MAX,
  REFRESH_AFTER,
  REJECTION_REASON,
  TEACHER_APPLICATION_STATUSES,
  TEACHER_REVIEW_ERRORS,
  VERIFY_NOTE_MAX,
  applicationSchoolPlace,
  approvalPayload,
  approvalCreatesSchool,
  proposedSchoolDetails,
  isMissingSchoolApplication,
  teacherReviewActions,
  teacherReviewMode,
  verifySchoolPayload,
} from "@/lib/admin/teacher-applications";
import { Alert, ErrorState, LoadingBlock, Spinner } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { PlaceSelects, SectorSchoolSelect } from "@/app/components/schools/SchoolCascade";
import type { Place } from "@/lib/schools/school-cascade";
import { AdminPage, ConfirmDialog, FilterPills, Modal, Notice, TableCard, TableMessage, btnPrimary, btnSecondary, linkBtn, td, th } from "../components/adminUi";
import { useRecordBulk } from "../components/bulk/RecordBulk";
import { bulkFilterFrom } from "@/lib/admin/bulk-records";
import { AskForInformation, InfoRequestHistory } from "@/app/components/applications/InfoRequests";
import { SchoolPicker } from "../users/components/userUi";
import ApplicationPictureReview from "@/app/components/applications/ApplicationPictureReview";
import { pictureReviewShown, withPictureDecision } from "@/lib/accounts/application-picture";
import type { SchoolRef } from "@/lib/api/types";
import { interestsWithOtherText } from "@/lib/accounts/olympiad-interests";

/** The backend's error with a message for its code (shown by the dialogs). */
function explain(e: unknown): unknown {
  if (isApiError(e) && TEACHER_REVIEW_ERRORS[e.code]) return new ApiError(e.status, e.code, TEACHER_REVIEW_ERRORS[e.code], e.details, e.requestId);
  return e;
}

const fullName = (a: { firstName: string; lastName: string }) => `${a.firstName} ${a.lastName}`;

export default function TeacherApplicationsReview() {
  const caps = useBackendCapabilities();
  const { permissionsStatus, can, retry: retrySession } = useSession();
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
  const [verifying, setVerifying] = useState<TeacherApplication | null>(null);
  const [approving, setApproving] = useState<TeacherApplication | null>(null);
  const [rejecting, setRejecting] = useState<TeacherApplication | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.teacherApplications.all });
  // Bulk actions (capability bulkOperationsGeneric): reject many applications (approval stays one by one).
  const bulk = useRecordBulk("TEACHER_APPLICATION", {
    pageIds: list.data?.data.map((a) => a.id) ?? [],
    filter: bulkFilterFrom(filters),
    total: list.data?.meta.total,
    onStarted: () => void refresh(),
  });
  const cols = bulk.enabled ? 6 : 5;
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
  if (mode === "error") {
    return (
      <AdminPage title="Teacher applications">
        <ErrorState error={null} title="Couldn't load your permissions" onRetry={retrySession} />
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
    <AdminPage
      title="Teacher applications"
      description="Teachers who applied for an account. A school that wasn't listed is verified first; approving creates the Teacher account and assigns it to the school."
    >
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
      {bulk.toolbar}
      {list.isError ? (
        <ErrorState error={list.error} title="Couldn't load the teacher applications" onRetry={() => list.refetch()} />
      ) : (
        <TableCard footer={list.data && <Pagination page={page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} disabled={list.isFetching} />}>
          <thead className="bg-gray-50/60 border-b border-gray-100">
            <tr>
              {bulk.enabled && <th className={`${th} w-8`}>{bulk.headerCheckbox}</th>}
              <th className={th}>Applicant</th>
              <th className={th}>School</th>
              <th className={th}>Subjects</th>
              <th className={th}>{status === "PENDING" ? "Sent" : "Decided"}</th>
              <th className={`${th} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50" data-testid="teacher-applications">
            {list.isPending ? (
              <TableMessage colSpan={cols}>Loading…</TableMessage>
            ) : rows.length === 0 ? (
              <TableMessage colSpan={cols}>No {TEACHER_APPLICATION_STATUSES.find((s) => s.value === status)!.label.toLowerCase()} applications.</TableMessage>
            ) : (
              rows.map((a) => (
                <tr key={a.id}>
                  {bulk.enabled && <td className={td}>{bulk.rowCheckbox(a.id, fullName(a))}</td>}
                  <td className={td}>
                    <p className="font-semibold text-gray-800">{fullName(a)}</p>
                    <p className="text-xs text-gray-500">
                      @{a.username} · {a.email}
                    </p>
                  </td>
                  <td className={`${td} text-gray-700`}>
                    <SchoolCell app={a} />
                  </td>
                  <td className={`${td} text-xs text-gray-600`}>{interestsWithOtherText(a.olympiadInterests, a.olympiadInterestOther)}</td>
                  <td className={`${td} text-xs text-gray-600`}>
                    {a.status === "PENDING" ? (
                      formatDate(a.createdAt)
                    ) : (
                      <>
                        {formatDate(a.decidedAt)}
                        {a.decidedBy && <span className="block text-gray-500">by {fullName(a.decidedBy)}</span>}
                      </>
                    )}
                  </td>
                  <td className={`${td} text-right whitespace-nowrap space-x-3`}>
                    <button type="button" className={linkBtn} onClick={() => setViewing(a)}>
                      View
                    </button>
                    <ReviewButtons app={a} onVerify={setVerifying} onApprove={setApproving} onReject={setRejecting} />
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
          onVerify={(a) => {
            setViewing(null);
            setVerifying(a);
          }}
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
      {verifying && (
        <VerifySchoolDialog
          app={verifying}
          onClose={() => setVerifying(null)}
          onError={onError}
          onVerified={(text) => {
            setNotice(text);
            void refresh();
          }}
        />
      )}
      {approving && (
        <ApproveDialog
          app={approving}
          pictureReview={pictureReviewShown(caps.detection, approving.avatarFileId)}
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
      {bulk.dialog}
    </AdminPage>
  );
}

/** Verify school / Approve (disabled with its reason until the school is verified) / Reject. */
function ReviewButtons({
  app,
  onVerify,
  onApprove,
  onReject,
}: {
  app: TeacherApplication;
  onVerify: (a: TeacherApplication) => void;
  onApprove: (a: TeacherApplication) => void;
  onReject: (a: TeacherApplication) => void;
}) {
  const actions = teacherReviewActions(app);
  return (
    <>
      {actions.verifySchool && (
        <button type="button" className={linkBtn} onClick={() => onVerify(app)}>
          Verify school
        </button>
      )}
      {actions.approve.shown && (
        <button
          type="button"
          className={`${linkBtn} disabled:text-gray-300 disabled:cursor-not-allowed`}
          disabled={!actions.approve.enabled}
          title={actions.approve.enabled ? undefined : actions.approve.reason}
          onClick={() => onApprove(app)}
        >
          Approve
        </button>
      )}
      {actions.reject && (
        <button type="button" className={linkBtn} onClick={() => onReject(app)}>
          Reject
        </button>
      )}
    </>
  );
}

function SchoolCell({ app }: { app: TeacherApplication }) {
  const place = applicationSchoolPlace(app);
  if (app.school) {
    return (
      <>
        {app.school.name}
        {isMissingSchoolApplication(app) && app.schoolVerifiedAt && <span className="ml-1 text-[11px] text-emerald-700">(verified)</span>}
        <span className="block text-xs text-gray-500">
          {app.school.code ? `code ${app.school.code} · ` : ""}
          {place}
        </span>
        {app.proposedSchoolName && app.proposedSchoolName !== app.school.name && (
          <span className="block text-[11px] text-gray-500">applied as &ldquo;{app.proposedSchoolName}&rdquo;</span>
        )}
      </>
    );
  }
  const details = proposedSchoolDetails(app);
  return (
    <>
      {app.proposedSchoolName ?? "—"}{" "}
      <span className="text-[11px] text-amber-700">{approvalCreatesSchool(app) ? "(not listed — approving adds it)" : "(not listed — verify first)"}</span>
      <span className="block text-xs text-gray-500">{place || "No place given"}</span>
      {details.length > 0 && <span className="block text-[11px] text-gray-500">{details.join(" · ")}</span>}
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-3 py-2">
      <dt className="text-xs font-semibold text-gray-600">{label}</dt>
      <dd className="sm:col-span-2 text-sm text-gray-800 break-words">{children}</dd>
    </div>
  );
}

function DetailDialog({
  app,
  onClose,
  onVerify,
  onApprove,
  onReject,
}: {
  app: TeacherApplication;
  onClose: () => void;
  onVerify: (a: TeacherApplication) => void;
  onApprove: (a: TeacherApplication) => void;
  onReject: (a: TeacherApplication) => void;
}) {
  const detail = useQuery({ queryKey: queryKeys.teacherApplications.detail(app.id), queryFn: () => teacherApplicationsAdminApi.get(app.id), placeholderData: app });
  const a = detail.data ?? app;
  const status = TEACHER_APPLICATION_STATUSES.find((s) => s.value === a.status)?.label ?? a.status;
  const actions = teacherReviewActions(a);
  const missing = isMissingSchoolApplication(a);
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
          <Row label="Olympiad interests">{interestsWithOtherText(a.olympiadInterests, a.olympiadInterestOther) || "—"}</Row>
          {a.position !== undefined && <Row label="Position">{a.position || "—"}</Row>}
          {a.yearsOfExperience !== undefined && <Row label="Years of experience">{a.yearsOfExperience ?? "—"}</Row>}
          {missing && (
            <Row label="School requested (not listed)">
              {a.proposedSchoolName ?? "—"}
              <span className="block text-xs text-gray-600">{[a.schoolSector, a.schoolDistrict, a.schoolProvince].filter(Boolean).join(", ") || "No place given"}</span>
              {proposedSchoolDetails(a).length > 0 && (
                <span className="block text-xs text-gray-600" data-testid="proposed-school-details">{proposedSchoolDetails(a).join(" · ")}</span>
              )}
            </Row>
          )}
          {missing && (
            <Row label="School verified">
              {a.schoolVerifiedAt ? (
                <>
                  {formatDateTime(a.schoolVerifiedAt)}
                  {a.schoolVerifiedBy && ` by ${fullName(a.schoolVerifiedBy)}`}
                </>
              ) : (
                <span className="text-amber-700">Not yet</span>
              )}
            </Row>
          )}
          {a.school && (
            <Row label={missing ? "Official school" : "School"}>
              {a.school.name}
              <span className="block text-xs text-gray-600">
                {a.school.code ? `School code ${a.school.code}` : "No school code"} · Sector {a.school.sector ?? "—"} · {[a.school.district, a.school.province].filter(Boolean).join(", ")}
              </span>
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
        <InfoRequestHistory requests={a.infoRequests} />
        {a.status === "PENDING" && a.infoRequests !== undefined && (
          <div className="pt-3 text-right">
            <AskForInformation kind="TEACHER" applicationId={a.id} applicantName={fullName(a)} requests={a.infoRequests} onAsked={() => void detail.refetch()} />
          </div>
        )}
        {a.status === "PENDING" && (
          <div className="pt-4 space-y-3">
            {actions.approve.shown && !actions.approve.enabled && <p className="text-xs text-amber-700 text-right">{actions.approve.reason}</p>}
            <div className="flex flex-wrap justify-end gap-3">
              {actions.reject && (
                <button type="button" className="px-5 py-2 text-sm text-red-600" onClick={() => onReject(a)}>
                  Reject
                </button>
              )}
              {actions.verifySchool && (
                <button type="button" className={btnSecondary} onClick={() => onVerify(a)}>
                  Verify school
                </button>
              )}
              {actions.approve.shown && (
                <button type="button" className={btnPrimary} disabled={!actions.approve.enabled} onClick={() => onApprove(a)}>
                  Approve
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function NoteField({ id, value, onChange, max }: { id: string; value: string; onChange: (v: string) => void; max: number }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-gray-600 mb-1">
        Note <span className="font-normal text-gray-500">(optional)</span>
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        maxLength={max}
        className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </div>
  );
}

/**
 * Verify a missing school by matching it to an EXISTING official school (POST …/:id/school).
 * The application stays PENDING; the applicant is e-mailed that the school was verified.
 */
function VerifySchoolDialog({ app, onClose, onError, onVerified }: { app: TeacherApplication; onClose: () => void; onError: (e: unknown) => unknown; onVerified: (notice: string) => void }) {
  // Province → District → Sector → School, starting from the place the applicant gave.
  const [place, setPlace] = useState<Place>({ province: app.schoolProvince ?? "", district: app.schoolDistrict ?? "", sector: app.schoolSector ?? "" });
  const [school, setSchool] = useState<DirectorySchool | null>(null);
  // A school just created under Schools (perhaps without its official code yet) is not in the public
  // directory list above; the administrators' search of all schools finds it (as the student match dialog does).
  const [other, setOther] = useState<SchoolRef | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = school ?? other;

  async function verify() {
    const p = verifySchoolPayload(chosen?.id ?? null, note);
    if (!p.ok) {
      setError(p.problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await teacherApplicationsAdminApi.verifySchool(app.id, p.body);
      onVerified(
        `${fullName(app)}: school verified as ${res.school?.name ?? chosen?.name ?? "the chosen school"}. The applicant will be e-mailed that their school was verified; the application is still waiting for approval.`,
      );
      onClose();
    } catch (e) {
      setError(errorMessage(onError(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal wide title="Verify the applicant's school" onClose={busy ? () => undefined : onClose}>
      <div className="space-y-4" data-testid="teacher-verify-school-dialog">
        <Alert tone="info">
          {fullName(app)} named a school that isn&apos;t in the directory: <strong>{app.proposedSchoolName ?? "—"}</strong> ({applicationSchoolPlace(app) || "no place given"}). Choose
          the existing official school it corresponds to.
        </Alert>
        <p className="text-sm text-gray-600">
          If the school really isn&apos;t in the directory yet, first create it under{" "}
          <Link href="/admin/schools" className="font-semibold text-indigo-700 underline">
            Schools → directory
          </Link>
          , then come back. Check the directory carefully before creating one: the school may already be listed (perhaps under a slightly different name), and a school that already exists must
          never be added again.
        </p>
        <PlaceSelects
          variant="admin"
          value={place}
          onChange={(p) => {
            setPlace(p);
            setSchool(null);
          }}
        />
        <SectorSchoolSelect
          variant="admin"
          place={place}
          schoolId={school?.id ?? ""}
          onChange={(s) => {
            setSchool(s);
            if (s) setOther(null);
          }}
          label="Official school"
        />
        <SchoolPicker
          label="Or choose another school (including one you have just created)"
          value={other}
          onChange={(s) => {
            setOther(s);
            if (s) setSchool(null);
          }}
        />
        <NoteField id="verify-note" value={note} onChange={setNote} max={VERIFY_NOTE_MAX} />
        <Alert tone="info">
          The applicant will be e-mailed at <strong>{app.email}</strong> that their school was verified. This does <strong>not</strong> approve the teacher: the application keeps
          waiting, and you approve or reject it separately.
        </Alert>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="px-5 py-2 text-sm text-gray-600 disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={verify} disabled={busy || !chosen} className={btnPrimary}>
            {busy && <Spinner className="h-3.5 w-3.5 !text-white" />}
            Verify school
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Approve with an optional note. Never chooses a school: the application's own (listed or verified) is used. */
function ApproveDialog({
  app,
  pictureReview,
  onClose,
  onError,
  onApproved,
}: {
  app: TeacherApplication;
  /** The application has a picture and the backend reviews pictures (applicationPictureReview). */
  pictureReview: boolean;
  onClose: () => void;
  onError: (e: unknown) => unknown;
  onApproved: (notice: string) => void;
}) {
  const actions = teacherReviewActions(app);
  const blocked = actions.approve.shown && !actions.approve.enabled ? actions.approve.reason : null;
  const [note, setNote] = useState("");
  // Owner policy: the picture is kept only when the Administrator saw it and ticked the box (unticked by default).
  const [keepPicture, setKeepPicture] = useState(false);
  const [pictureLoaded, setPictureLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One step (owner 2026-11-22): the approval adds the school; schools with the same name nearby are confirmed first.
  const createsSchool = approvalCreatesSchool(app);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[] | null>(null);
  const [differentSchool, setDifferentSchool] = useState(false);

  async function approve() {
    const p = approvalPayload(note);
    if (!p.ok) {
      setError(p.problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = withPictureDecision({ ...p.body, ...(duplicates && differentSchool && { confirmPossibleDuplicate: true }) }, { shown: pictureReview, loaded: pictureLoaded, keep: keepPicture });
      const res = await teacherApplicationsAdminApi.approve(app.id, body);
      onApproved(
        `${fullName(app)}: approved. Teacher account @${res.teacher.username} created${res.emailVerificationRequired ? "; they must confirm their e-mail with the activation message before signing in" : ""}. The teacher is notified by e-mail and in the app.`,
      );
      onClose();
    } catch (e) {
      const dup = createsSchool && isApiError(e) && e.code === "POSSIBLE_DUPLICATE" ? interpretSaveError(e).duplicates : null;
      if (dup) {
        setDuplicates(dup);
        setDifferentSchool(false);
        setError(null);
      } else {
        setError(errorMessage(onError(e)));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Approve this application?" onClose={busy ? () => undefined : onClose}>
      <div className="space-y-4" data-testid="teacher-approve-dialog">
        <p className="text-sm text-gray-600">
          {fullName(app)} (@{app.username}) gets a Teacher account and sees the verified students of the school below.
        </p>
        {app.school && (
          <p className="text-sm text-gray-800">
            School: <strong>{app.school.name}</strong>
            {app.school.code ? ` (code ${app.school.code})` : ""}
            <span className="block text-xs text-gray-600">{applicationSchoolPlace(app)}</span>
          </p>
        )}
        {createsSchool && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm text-gray-800" data-testid="approve-creates-school">
            Approving adds this school to the official list, from the applicant&apos;s details:
            <strong className="block mt-1">{app.proposedSchoolName}</strong>
            <span className="block text-xs text-gray-600">{applicationSchoolPlace(app)}</span>
            <span className="block text-xs text-gray-600">{proposedSchoolDetails(app).join(" · ")}</span>
            <span className="block text-xs text-gray-600 mt-1">If a school with this code was listed meanwhile, that school is used instead.</span>
          </div>
        )}
        {duplicates && (
          <Alert tone="info">
            <span className="block">A school with the same name is already listed in this district:</span>
            <ul className="list-disc pl-5 text-xs">
              {duplicates.map((c) => (
                <li key={c.id}>
                  {c.name}
                  {c.code ? ` (code ${c.code})` : ""}
                  {c.district ? `, ${c.district}` : ""}
                </li>
              ))}
            </ul>
            <label className="mt-2 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={differentSchool} onChange={(e) => setDifferentSchool(e.target.checked)} data-testid="confirm-different-school" />
              The applicant&apos;s school is a different school — add it anyway
            </label>
          </Alert>
        )}
        {blocked ? (
          <Alert tone="info">{blocked}</Alert>
        ) : (
          <>
            {pictureReview && (
              <ApplicationPictureReview
                kind="teacher"
                applicationId={app.id}
                fetchPicture={teacherApplicationsAdminApi.avatar}
                keep={keepPicture}
                onKeepChange={setKeepPicture}
                onLoadedChange={setPictureLoaded}
              />
            )}
            <NoteField id="approve-note" value={note} onChange={setNote} max={APPROVAL_NOTE_MAX} />
            <p className="text-sm text-gray-600">The teacher will be notified of the approval by e-mail and in the app.</p>
          </>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="px-5 py-2 text-sm text-gray-600 disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={approve} disabled={busy || !!blocked || (!!duplicates && !differentSchool)} className={btnPrimary}>
            {busy && <Spinner className="h-3.5 w-3.5 !text-white" />}
            Approve
          </button>
        </div>
      </div>
    </Modal>
  );
}
