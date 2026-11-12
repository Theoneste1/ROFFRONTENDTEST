"use client";

/**
 * One academic year's enrolments (`GET /admin/academic-years/:id/enrollments`,
 * academicYears.manage), filterable by grade and status. For the CURRENT year a
 * holder of enrollments.manage can correct a student's grade (which moves the
 * division when needed) or withdraw the student (`PATCH /admin/enrollments/:id`);
 * withdrawing also suspends the account. Earlier years are read-only (the
 * backend refuses changes to them).
 */
import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { academicYearsApi, type Enrollment, type EnrollmentFilters, type EnrollmentStatus } from "@/lib/api/academic-years";
import { errorMessage, isApiError } from "@/lib/api/errors";
import type { GradeLevel } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query/keys";
import { YEAR_ERRORS, formatDay } from "@/lib/admin/academic-years";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { AdminPage, Badge, ConfirmDialog, Modal, Notice, SelectFilter, TableCard, TableMessage, btnPrimary, btnSecondary, linkBtn, td, th } from "../../components/adminUi";

const GRADES: GradeLevel[] = ["S1", "S2", "S3", "S4", "S5", "S6"];
const STATUS: Record<EnrollmentStatus, { label: string; cls: string }> = {
  ACTIVE: { label: "Active", cls: "bg-emerald-50 text-emerald-700" },
  PROMOTED: { label: "Promoted", cls: "bg-indigo-50 text-indigo-700" },
  GRADUATED: { label: "Graduated", cls: "bg-blue-50 text-blue-700" },
  WITHDRAWN: { label: "Withdrawn", cls: "bg-gray-100 text-gray-600" },
};
const PAGE_SIZE = 50;
const enrolError = (e: unknown) => (isApiError(e) && e.code && YEAR_ERRORS[e.code]) || errorMessage(e);

export default function EnrollmentsClient({ yearId }: { yearId: string }) {
  const { can, permissionsStatus } = useSession();
  const allowed = permissionsStatus === "ready" && can("academicYears.manage");
  const mayChange = can("enrollments.manage");
  const qc = useQueryClient();
  const years = useQuery({ queryKey: queryKeys.academicYears.list(), queryFn: academicYearsApi.list, enabled: allowed });
  const year = years.data?.find((y) => y.id === yearId) ?? null;
  const [grade, setGrade] = useState<"" | GradeLevel>("");
  const [status, setStatus] = useState<"" | EnrollmentStatus>("");
  const [page, setPage] = useState(1);
  const filters: EnrollmentFilters = { gradeLevel: grade || undefined, status: status || undefined, page, limit: PAGE_SIZE };
  const rows = useQuery({
    queryKey: queryKeys.academicYears.enrollments(yearId, filters),
    queryFn: () => academicYearsApi.enrollments(yearId, filters),
    enabled: allowed,
    placeholderData: keepPreviousData,
  });
  const [regrading, setRegrading] = useState<Enrollment | null>(null);
  const [withdrawing, setWithdrawing] = useState<Enrollment | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.academicYears.all });
    void qc.invalidateQueries({ queryKey: queryKeys.admin.all });
  };
  const editable = mayChange && year?.status === "ACTIVE";

  const back = (
    <Link href="/admin/academic-years" className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 mb-4">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Academic years
    </Link>
  );
  if (permissionsStatus === "ready" && !allowed) {
    return (
      <AdminPage title="Enrolments">
        {back}
        <Notice tone="info">Viewing enrolments needs the academicYears.manage permission.</Notice>
      </AdminPage>
    );
  }

  const name = (e: Enrollment) => `${e.student.firstName} ${e.student.lastName}`;
  const cols = editable ? 6 : 5;

  return (
    <AdminPage
      title={year ? `Enrolments · ${year.name}` : "Enrolments"}
      description={year ? `${formatDay(year.startsOn)} – ${formatDay(year.endsOn)}${year.status === "ACTIVE" ? " · current year" : year.status === "CLOSED" ? " · closed (read-only)" : " · planned"}` : undefined}
    >
      {back}
      {notice && (
        <Notice tone="success" onClose={() => setNotice(null)}>
          {notice}
        </Notice>
      )}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <SelectFilter
          label="Grade"
          value={grade}
          onChange={(v) => {
            setGrade(v as "" | GradeLevel);
            setPage(1);
          }}
          options={[{ label: "All grades", value: "" }, ...GRADES.map((g) => ({ label: g, value: g }))]}
        />
        <SelectFilter
          label="Status"
          value={status}
          onChange={(v) => {
            setStatus(v as "" | EnrollmentStatus);
            setPage(1);
          }}
          options={[{ label: "All statuses", value: "" }, ...(Object.keys(STATUS) as EnrollmentStatus[]).map((s) => ({ label: STATUS[s].label, value: s }))]}
        />
      </div>

      {rows.isError ? (
        <ErrorState error={rows.error} title={isApiError(rows.error) && rows.error.status === 404 ? "Academic year not found" : "Couldn't load the enrolments"} onRetry={() => rows.refetch()} />
      ) : rows.isPending ? (
        <LoadingBlock />
      ) : (
        <TableCard footer={<Pagination page={page} totalPages={rows.data.meta.totalPages} total={rows.data.meta.total} onPage={setPage} disabled={rows.isFetching} />}>
          <thead className="bg-gray-50/60 border-b border-gray-100">
            <tr>
              <th className={th}>Student</th>
              <th className={th}>Grade</th>
              <th className={th}>Division</th>
              <th className={th}>School</th>
              <th className={th}>Status</th>
              {editable && <th className={`${th} text-right`}>Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50" data-testid="enrollments">
            {rows.data.data.length === 0 ? (
              <TableMessage colSpan={cols}>{grade || status ? "No enrolment matches these filters." : "No students are enrolled in this year."}</TableMessage>
            ) : (
              rows.data.data.map((e) => (
                <tr key={e.id}>
                  <td className={td}>
                    <Link href={`/admin/users/${e.student.id}`} className="font-semibold text-gray-800 hover:text-indigo-700">
                      {name(e)}
                    </Link>
                    <p className="text-xs text-gray-400">
                      @{e.student.username}
                      {!e.student.isActive && " · suspended"}
                    </p>
                  </td>
                  <td className={`${td} text-gray-700`}>{e.gradeLevel}</td>
                  <td className={`${td} text-gray-600`}>{e.division.name}</td>
                  <td className={`${td} text-gray-600`}>{e.school?.name ?? "—"}</td>
                  <td className={td}>
                    <Badge className={STATUS[e.status].cls}>{STATUS[e.status].label}</Badge>
                  </td>
                  {editable && (
                    <td className={`${td} text-right whitespace-nowrap space-x-3`}>
                      {e.status === "ACTIVE" && (
                        <>
                          <button type="button" className={linkBtn} onClick={() => setRegrading(e)} aria-label={`Change grade of ${name(e)}`}>
                            Change grade
                          </button>
                          <button type="button" className={linkBtn} onClick={() => setWithdrawing(e)} aria-label={`Withdraw ${name(e)}`}>
                            Withdraw
                          </button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </TableCard>
      )}

      {regrading && (
        <GradeDialog
          enrollment={regrading}
          onClose={() => setRegrading(null)}
          onDone={(g) => {
            setNotice(`${name(regrading)} is now in ${g}.`);
            setRegrading(null);
            refresh();
          }}
          onStale={refresh}
        />
      )}
      {withdrawing && (
        <ConfirmDialog
          title={`Withdraw ${name(withdrawing)}?`}
          body="The enrolment ends and the student's account is suspended (they can't sign in). Their work and results are kept. An administrator can reactivate the account later."
          confirmLabel="Withdraw student"
          tone="danger"
          onClose={() => setWithdrawing(null)}
          onConfirm={async () => {
            try {
              await academicYearsApi.updateEnrollment(withdrawing.id, { status: "WITHDRAWN" });
            } catch (e) {
              if (isApiError(e) && e.code === "INVALID_STATE_TRANSITION") refresh();
              throw e;
            }
            setNotice(`${name(withdrawing)} was withdrawn and their account suspended.`);
            refresh();
          }}
        />
      )}
    </AdminPage>
  );
}

function GradeDialog({ enrollment: e, onClose, onDone, onStale }: { enrollment: Enrollment; onClose: () => void; onDone: (g: GradeLevel) => void; onStale: () => void }) {
  const [grade, setGrade] = useState<GradeLevel>(e.gradeLevel);
  const save = useMutation({
    mutationFn: () => academicYearsApi.updateEnrollment(e.id, { gradeLevel: grade }),
    onSuccess: () => onDone(grade),
    onError: (err) => {
      if (isApiError(err) && err.code === "INVALID_STATE_TRANSITION") onStale();
    },
  });
  const crosses = (["S1", "S2", "S3"].includes(e.gradeLevel) ? "J" : "S") !== (["S1", "S2", "S3"].includes(grade) ? "J" : "S");
  return (
    <Modal title={`Change grade · ${e.student.firstName} ${e.student.lastName}`} onClose={onClose}>
      <div className="space-y-4" data-testid="grade-dialog">
        <label className="block text-xs font-semibold text-gray-600">
          Grade in the current year
          <select value={grade} onChange={(ev) => setGrade(ev.target.value as GradeLevel)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        {crosses && <p className="text-xs text-amber-700">This moves the student to the {["S1", "S2", "S3"].includes(grade) ? "Junior" : "Senior"} division.</p>}
        {save.isError && <p className="text-xs text-red-600">{enrolError(save.error)}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          <button type="button" className={btnPrimary} disabled={save.isPending || grade === e.gradeLevel} onClick={() => save.mutate()}>
            Save grade
          </button>
        </div>
      </div>
    </Modal>
  );
}
