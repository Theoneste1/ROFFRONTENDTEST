"use client";

/**
 * /admin/schools/:id in "manage" mode: the school record (`GET /admin/schools/:id`), what refers
 * to it (counts), its students with their claim for this school (`/students`) and its history
 * (`/history`: source records, and audit entries when the user holds `audit.view`), its contacts
 * (view, edit, verify) and its offerings (education levels and programmes).
 */
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { isApiError } from "@/lib/api/errors";
import type { DirectorySchoolDetail, SchoolClaimStatus } from "@/lib/api/school-directory";
import { invalidateAfterSchoolChange, useDirectorySchool, useDirectorySchoolHistory, useDirectorySchoolStudents } from "@/lib/queries/school-directory";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { ACCOMMODATION_LABEL, CLAIM_LABEL, OWNERSHIP_LABEL, RWANDA, SOURCE_LABEL, describeAuditEntry, isUuid, placeLabel, schoolVerification } from "@/lib/admin/school-directory";
import { adminSchoolsApi } from "@/lib/api/school-directory";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { AdminPage, Badge, Card, MetricCard, Notice, TableCard, TableMessage, btnDanger, btnPrimary, btnSecondary, linkBtn, td, th } from "../../components/adminUi";
import SchoolActiveDialog from "./SchoolActiveDialog";
import SchoolContactsTab from "./SchoolContactsTab";
import SchoolTeachersTab from "./SchoolTeachersTab";
import { useSession } from "@/lib/auth/session";
import { schoolTeachersVisible } from "@/lib/schools/school-teachers";
import SchoolFormDialog from "./SchoolFormDialog";
import SchoolOfferingsTab from "./SchoolOfferingsTab";
import { useSchoolAccessPageAvailable } from "@/lib/queries/teacher";

type Tab = "students" | "teachers" | "contacts" | "offerings" | "history";
const TAB_LABEL: Record<Tab, string> = { students: "Students", teachers: "Teachers", contacts: "Contacts", offerings: "Offerings", history: "History" };

const CLAIM_BADGE: Record<SchoolClaimStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  VERIFIED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-700",
  REVOKED: "bg-gray-100 text-gray-600",
};

export default function SchoolDirectoryDetail({ schoolId }: { schoolId: string }) {
  const valid = isUuid(schoolId);
  const school = useDirectorySchool(schoolId, valid);
  // ?tab=contacts (the schools list links there when it is filtered by a contact): opens on that tab.
  const asked = useSearchParams().get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(asked && asked in TAB_LABEL ? asked : "students");
  const { can } = useSession();
  const [dialog, setDialog] = useState<"edit" | "active" | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [notice, setNotice] = useState<{ text: string; warning?: string } | null>(null);
  const qc = useQueryClient();
  const accessPage = useSchoolAccessPageAvailable();
  const back = (
    <Link href="/admin/schools" className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 mb-4">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> All schools
    </Link>
  );

  if (!valid || (school.isError && isApiError(school.error) && (school.error.status === 404 || school.error.status === 400))) {
    return (
      <AdminPage title="School">
        {back}
        <ErrorState error={null} title="School not found" />
      </AdminPage>
    );
  }
  if (school.isPending) return <AdminPage title="School">{back}<LoadingBlock /></AdminPage>;
  if (school.isError)
    return (
      <AdminPage title="School">
        {back}
        <ErrorState error={school.error} title="Couldn't load this school" onRetry={() => school.refetch()} />
      </AdminPage>
    );

  const s = school.data;
  const refresh = () => invalidateAfterSchoolChange(qc);
  const verification = schoolVerification(s);
  const verify = async () => {
    setVerifying(true);
    try {
      await adminSchoolsApi.verify(s.id);
      setNotice({ text: verification.verified ? "The school was verified again." : "The school is now verified." });
      void refresh();
    } catch (err) {
      setNotice({ text: isApiError(err) ? err.message : "Couldn't verify the school. Please try again." });
    } finally {
      setVerifying(false);
    }
  };
  return (
    <AdminPage
      title={s.name}
      description={placeLabel(s)}
      actions={
        <>
          {accessPage && (
            <Link href={`/admin/schools/${s.id}/access`} className={btnSecondary} data-testid="school-access-link">
              Teacher &amp; student access
            </Link>
          )}
          <button type="button" className={btnSecondary} onClick={() => setDialog("edit")}>
            Edit
          </button>
          {verification.canVerify && (
            <button type="button" className={btnSecondary} onClick={() => void verify()} disabled={verifying} data-testid="verify-school">
              {verifying ? "Verifying…" : verification.verified ? "Verify again" : "Mark as verified"}
            </button>
          )}
          <button type="button" className={s.isActive ? btnDanger : btnPrimary} onClick={() => setDialog("active")}>
            {s.isActive ? "Deactivate" : "Reactivate"}
          </button>
        </>
      }
    >
      {back}
      {notice && (
        <Notice onClose={() => setNotice(null)}>
          {notice.text}
          {notice.warning && (
            <span className="block mt-1" data-testid="active-warning">
              {notice.warning}
            </span>
          )}
        </Notice>
      )}
      {!s.isActive && (
        <Notice tone="info">This school is inactive: it accepts no new registrations, claims, verifications or Teacher assignments. Existing records are kept.</Notice>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6" data-testid="school-counts">
        <MetricCard label="Students" value={formatNumber(s.counts.students)} />
        <MetricCard label="Verified" value={formatNumber(s.counts.verifiedStudents)} />
        <MetricCard label="Pending claims" value={formatNumber(s.counts.pendingClaims)} />
        <MetricCard label="Teacher assignments" value={formatNumber(s.counts.activeTeacherAssignments)} subtext="active" />
        <MetricCard label="Enrolments" value={formatNumber(s.counts.enrolments)} />
      </div>

      <SchoolRecord school={s} />

      <div role="tablist" aria-label="School information" className="flex gap-2 my-4">
        {(Object.keys(TAB_LABEL) as Tab[]).filter((t) => t !== "teachers" || schoolTeachersVisible(can)).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold ${tab === t ? "bg-indigo-600 text-white" : "bg-white text-gray-600 border border-gray-200"}`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
      {tab === "students" ? (
        <StudentsTab schoolId={s.id} />
      ) : tab === "teachers" && schoolTeachersVisible(can) ? (
        <SchoolTeachersTab schoolId={s.id} schoolName={s.name} />
      ) : tab === "contacts" ? (
        <SchoolContactsTab schoolId={s.id} />
      ) : tab === "offerings" ? (
        <SchoolOfferingsTab schoolId={s.id} />
      ) : (
        <HistoryTab schoolId={s.id} />
      )}

      {dialog === "edit" && (
        <SchoolFormDialog
          school={s}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setDialog(null);
            setNotice({ text: `${saved.name} was saved.` });
            void refresh();
          }}
        />
      )}
      {dialog === "active" && (
        <SchoolActiveDialog
          school={s}
          onClose={() => setDialog(null)}
          onDone={(r) => {
            setDialog(null);
            setNotice({
              text: !r.changed ? `The school was already ${r.school.isActive ? "active" : "inactive"}.` : r.school.isActive ? "The school was reactivated." : "The school was deactivated.",
              warning: r.warning,
            });
            void refresh();
          }}
        />
      )}
    </AdminPage>
  );
}

function SchoolRecord({ school: s }: { school: DirectorySchoolDetail }) {
  const rows: Array<[string, string]> = [
    ["Status", s.isActive ? "Active" : "Inactive"],
    ["Source", SOURCE_LABEL[s.source] ?? s.source],
    ["Country", s.countryCode === RWANDA ? "Rwanda (RW)" : s.countryCode],
    ...(s.countryCode === RWANDA
      ? ([
          ["Official code", s.code ?? "—"],
          ["Province", s.province ?? "—"],
          ["District", s.district ?? "—"],
          ["Sector", s.sector ?? "—"],
          ["Cell", s.cell ?? "—"],
          ["Village", s.village ?? "—"],
        ] as Array<[string, string]>)
      : []),
    ["Location", s.location || "—"],
    ["Ownership", s.ownership ? OWNERSHIP_LABEL[s.ownership] : "—"],
    ["Accommodation", s.accommodation ? ACCOMMODATION_LABEL[s.accommodation] : "—"],
    ["Added", `${formatDate(s.createdAt)}${s.createdBy ? ` by @${s.createdBy.username}` : ""}`],
    ["Last changed", formatDateTime(s.updatedAt)],
    ...(s.lastSourceSyncAt ? ([["Last directory sync", formatDateTime(s.lastSourceSyncAt)]] as Array<[string, string]>) : []),
    ["Verified", s.lastVerifiedAt ? `${formatDateTime(s.lastVerifiedAt)}${s.lastVerifiedBy ? ` by @${s.lastVerifiedBy.username}` : ""}` : "Not verified"],
    ...(s.countryCode === RWANDA && s.code === null
      ? ([["Teachers", schoolVerification(s).teacherEligible ? "Can choose this school" : "Not offered (needs an administrator-created, verified school)"]] as Array<[string, string]>)
      : []),
  ];
  return (
    <Card>
      <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 p-5 text-sm" data-testid="school-record">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{k}</dt>
            <dd className="text-gray-800">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function StudentsTab({ schoolId }: { schoolId: string }) {
  const [page, setPage] = useState(1);
  const students = useDirectorySchoolStudents(schoolId, page);
  if (students.isError) return <ErrorState error={students.error} title="Couldn't load the students" onRetry={() => students.refetch()} />;
  return (
    <TableCard
      footer={
        students.data && (
          <div className="px-4 pb-4">
            <Pagination page={page} totalPages={students.data.meta.totalPages} total={students.data.meta.total} onPage={setPage} disabled={students.isFetching} />
          </div>
        )
      }
    >
      <thead>
        <tr className="border-b border-gray-100">
          <th className={th}>Student</th>
          <th className={th}>Division</th>
          <th className={th}>Claim for this school</th>
          <th className={th}>Account</th>
          <th className={th}>
            <span className="sr-only">Action</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100/80" data-testid="school-students">
        {students.isPending ? (
          <TableMessage colSpan={5}>Loading students…</TableMessage>
        ) : students.data.data.length === 0 ? (
          <TableMessage colSpan={5}>No students at this school.</TableMessage>
        ) : (
          students.data.data.map((st) => (
            <tr key={st.id} className="text-xs hover:bg-gray-50/60">
              <td className={`${td} font-semibold text-gray-800 whitespace-nowrap`}>
                {st.firstName} {st.lastName}
                <span className="block text-[11px] font-normal text-gray-500">@{st.username}</span>
              </td>
              <td className={`${td} text-gray-600 whitespace-nowrap`}>
                {st.division?.name.replace(/ division$/i, "") ?? "—"}
                {st.gradeLevel && <span className="text-gray-500"> · {st.gradeLevel}</span>}
              </td>
              <td className={td}>{st.claim ? <Badge className={CLAIM_BADGE[st.claim.status]}>{CLAIM_LABEL[st.claim.status]}</Badge> : <span className="text-gray-500">No claim</span>}</td>
              <td className={td}>
                <Badge className={!st.isApproved ? "bg-amber-50 text-amber-700" : st.isActive ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}>
                  {!st.isApproved ? "Awaiting approval" : st.isActive ? "Active" : "Suspended"}
                </Badge>
              </td>
              <td className={td}>
                <Link href={`/admin/users/${st.id}`} className={linkBtn}>
                  View
                </Link>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </TableCard>
  );
}

function HistoryTab({ schoolId }: { schoolId: string }) {
  const [page, setPage] = useState(1);
  const history = useDirectorySchoolHistory(schoolId, page);
  if (history.isPending) return <LoadingBlock />;
  if (history.isError) return <ErrorState error={history.error} title="Couldn't load the history" onRetry={() => history.refetch()} />;
  const h = history.data;
  return (
    <div className="space-y-4" data-testid="school-history">
      <Card>
        <div className="p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-3">Changes</h2>
          {!h.auditVisible || !h.audit ? (
            <p className="text-xs text-gray-600">Changes are listed only for administrators who can view the audit log (audit.view).</p>
          ) : h.audit.data.length === 0 ? (
            <p className="text-xs text-gray-600">No recorded changes.</p>
          ) : (
            <>
              <ol className={`divide-y divide-gray-100 ${history.isFetching ? "opacity-60" : ""}`}>
                {h.audit.data.map((entry) => {
                  const d = describeAuditEntry(entry);
                  return (
                    <li key={entry.id} className="py-3 text-xs">
                      <p className="font-semibold text-gray-800">
                        {d.title}
                        <span className="font-normal text-gray-500">
                          {" "}
                          · {formatDateTime(entry.createdAt)}
                          {entry.actorUsername ? ` · @${entry.actorUsername}` : ""}
                        </span>
                      </p>
                      {d.lines.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-gray-600">
                          {d.lines.map((l, i) => (
                            <li key={i}>{l}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ol>
              <div className="pt-3">
                <Pagination page={page} totalPages={h.audit.meta.totalPages} total={h.audit.meta.total} onPage={setPage} disabled={history.isFetching} />
              </div>
            </>
          )}
        </div>
      </Card>
      <Card>
        <div className="p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-3">Official directory records</h2>
          {h.sourceRecords.length === 0 ? (
            <p className="text-xs text-gray-600">This school has not been matched with an official directory record.</p>
          ) : (
            <ul className="divide-y divide-gray-100 text-xs">
              {h.sourceRecords.map((r) => {
                const issues = Array.isArray(r.issues) ? r.issues.length : 0;
                return (
                  <li key={r.id} className="py-2">
                    <span className="font-semibold text-gray-800">{r.datasetLabel ?? r.dataSource.name}</span>
                    <span className="text-gray-600">
                      {" "}
                      · {formatDate(r.createdAt)}
                      {r.sourceRef ? ` · row ${r.sourceRef}` : ""}
                      {r.matchedBy ? ` · matched by ${r.matchedBy.toLowerCase().replace(/_/g, " ")}` : ""}
                      {issues ? ` · ${issues} data issue${issues === 1 ? "" : "s"}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
