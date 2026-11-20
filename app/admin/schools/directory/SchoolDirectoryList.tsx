"use client";

/**
 * /admin/schools in "manage" mode: every school (official, administrator-created and legacy;
 * active and inactive) from `GET /admin/schools`, with search, filters, counts, and create /
 * edit / deactivate / reactivate. The students' school-claim review stays where it was
 * (/admin/schools/affiliations, `schoolAffiliations` + `schools.manage`).
 *
 * Schools table (2026-11-19): columns School code, School name, Country, District, Sector, Number of students (students
 * whose current school claim an Administrator verified), Primary teacher, Status. Search, filters, sort (name or number
 * of students; backends with schoolsTable) and page live in the URL; a row opens the school's page. On a small screen
 * the table scrolls sideways inside its own container.
 */
import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCountryOptions } from "@/lib/queries/countries";
import { countryDisplayName } from "@/lib/countries/reference";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, Plus } from "lucide-react";
import { hasFeature } from "@/lib/api/capabilities";
import type { DirectorySchoolRecord, SchoolSource } from "@/lib/api/school-directory";
import { useSession } from "@/lib/auth/session";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { invalidateAfterSchoolChange, useDirectorySchools, useSchoolLocations, useSyncAccess } from "@/lib/queries/school-directory";
import { formatNumber } from "@/lib/format";
import {
  RWANDA, SOURCE_LABEL, ariaSort, initialListState, isFiltered, listFilters, listStateFromParams, listStateToParams, nextSort, orDash,
  type ListState, type SchoolSort,
} from "@/lib/admin/school-directory";
import { NO_PRIMARY_TEACHER } from "@/lib/schools/primary-teacher";
import { ErrorState } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { AdminPage, Badge, Notice, SearchInput, SelectFilter, TableCard, TableMessage, btnPrimary, btnSecondary, linkBtn, td, th } from "../../components/adminUi";
import SchoolActiveDialog from "./SchoolActiveDialog";
import SchoolFormDialog from "./SchoolFormDialog";
import { useRecordBulk } from "../../components/bulk/RecordBulk";
import { bulkFilterFrom } from "@/lib/admin/bulk-records";

type Dialog = { kind: "create" } | { kind: "edit"; school: DirectorySchoolRecord } | { kind: "active"; school: DirectorySchoolRecord } | null;

export default function SchoolDirectoryList() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const state = listStateFromParams(params);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<{ text: string; href?: string; warning?: string } | null>(null);
  const qc = useQueryClient();
  const detection = useBackendCapabilities().detection;
  const sortable = hasFeature(detection, "schoolsTable");
  const filters = listFilters(state, { sortable });
  const schools = useDirectorySchools(filters);
  const locations = useSchoolLocations();
  const { can } = useSession();
  const review = hasFeature(detection, "schoolAffiliations") && can("schools.manage");
  const sync = useSyncAccess().visible;

  /** Remounts the search box on "Clear filters" (it keeps its own text while typing). */
  const [searchKey, setSearchKey] = useState(0);
  const go = (next: ListState) => {
    const query = listStateToParams(next);
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  };
  // Any change but a page change goes back to page 1; the sort is kept with every filter.
  const update = (patch: Partial<ListState>) => go({ ...state, ...patch, page: patch.page ?? 1 });
  const sortBy = (column: SchoolSort) => update(nextSort(state, column));
  const open = (id: string) => router.push(`/admin/schools/${id}`);
  // A row opens the school's page (its links and buttons keep their own action).
  const rowClick = (e: MouseEvent<HTMLTableRowElement>, id: string) => {
    if ((e.target as HTMLElement).closest("a,button")) return;
    open(id);
  };
  const rowKey = (e: KeyboardEvent<HTMLTableRowElement>, id: string) => {
    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      open(id);
    }
  };
  const sortHeader = (column: SchoolSort, label: string) =>
    sortable ? (
      <th className={th} aria-sort={ariaSort(state, column)}>
        <button
          type="button"
          onClick={() => sortBy(column)}
          className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
          data-testid={`sort-${column}`}
        >
          {label}
          {ariaSort(state, column) === "ascending" ? (
            <ArrowUp className="h-3 w-3" aria-hidden="true" />
          ) : ariaSort(state, column) === "descending" ? (
            <ArrowDown className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ArrowUpDown className="h-3 w-3 text-gray-500" aria-hidden="true" />
          )}
        </button>
      </th>
    ) : (
      <th className={th}>{label}</th>
    );
  // Province / district / sector belong to Rwanda: offered for "Any" and Rwanda, not for another country.
  const showPlaces = !state.countryCode || state.countryCode === RWANDA;
  // Every country (capability countries: the reference list; otherwise the built-in list, as before).
  const countryList = useCountryOptions();
  const countries = countryList.options;
  const provinces = locations.data ?? [];
  const districts = provinces.find((p) => p.province === state.province)?.districts ?? [];
  const sectors = districts.find((d) => d.district === state.district)?.sectors ?? [];
  const refresh = () => invalidateAfterSchoolChange(qc);
  // Bulk actions (capability bulkOperationsGeneric): tick schools, or act on every school matching the filters.
  const bulk = useRecordBulk("SCHOOL", {
    pageIds: schools.data?.data.map((s) => s.id) ?? [],
    filter: bulkFilterFrom(filters),
    total: schools.data?.meta.total,
    onStarted: () => void refresh(),
  });
  const cols = bulk.enabled ? 10 : 9;

  return (
    <AdminPage
      title="Schools"
      description="The school directory: official, administrator-added and legacy schools. Changes are recorded in the audit log."
      actions={
        <>
          {review && (
            <Link href="/admin/schools/affiliations" className={btnSecondary}>
              School verification
            </Link>
          )}
          {sync && (
            <Link href="/admin/schools/sync" className={btnSecondary}>
              Directory sync
            </Link>
          )}
          <Link href="/admin/schools/import" className={btnSecondary}>
            Import schools
          </Link>
          <button type="button" className={btnPrimary} onClick={() => setDialog({ kind: "create" })}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add school
          </button>
        </>
      }
    >
      <Link href="/admin/students" className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 mb-4">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Students
      </Link>
      {notice && (
        <Notice onClose={() => setNotice(null)}>
          {notice.text}{" "}
          {notice.href && (
            <Link href={notice.href} className="underline font-medium">
              Open
            </Link>
          )}
          {notice.warning && (
            <span className="block mt-1" data-testid="active-warning">
              {notice.warning}
            </span>
          )}
        </Notice>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-3" data-testid="school-filters">
        <SearchInput key={searchKey} value={state.q} onChange={(q) => update({ q })} placeholder="Name or code…" label="Search schools by name or code" />
        <SelectFilter
          label="Country"
          value={state.countryCode}
          // A new country clears the place filters (they belong to Rwanda).
          onChange={(v) => update({ countryCode: v, province: "", district: "", sector: "" })}
          options={[{ label: "Any", value: "" }, ...countries]}
        />
        <SelectFilter
          label="Status"
          value={state.status}
          onChange={(v) => update({ status: v as ListState["status"] })}
          options={[
            { label: "All", value: "all" },
            { label: "Active", value: "active" },
            { label: "Inactive", value: "inactive" },
          ]}
        />
        <SelectFilter
          label="Source"
          value={state.source}
          onChange={(v) => update({ source: v as SchoolSource | "" })}
          options={[{ label: "All", value: "" }, ...(Object.keys(SOURCE_LABEL) as SchoolSource[]).map((s) => ({ label: SOURCE_LABEL[s], value: s }))]}
        />
        <SelectFilter
          label="Code"
          value={state.code}
          onChange={(v) => update({ code: v as ListState["code"] })}
          options={[
            { label: "Any", value: "any" },
            { label: "With a code", value: "with" },
            { label: "Without a code", value: "without" },
          ]}
        />
      </div>
      {showPlaces && (
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <SelectFilter
            label="Province"
            value={state.province}
            onChange={(province) => update({ province, district: "", sector: "" })}
            options={[{ label: "Any", value: "" }, ...provinces.map((p) => ({ label: p.province, value: p.province }))]}
          />
          {state.province && (
            <SelectFilter
              label="District"
              value={state.district}
              onChange={(district) => update({ district, sector: "" })}
              options={[{ label: "Any", value: "" }, ...districts.map((d) => ({ label: d.district, value: d.district }))]}
            />
          )}
          {state.district && (
            <SelectFilter label="Sector" value={state.sector} onChange={(sector) => update({ sector })} options={[{ label: "Any", value: "" }, ...sectors.map((s) => ({ label: s, value: s }))]} />
          )}
        </div>
      )}
      {isFiltered(state) && (
        <button
          type="button"
          className={`${linkBtn} mb-4`}
          onClick={() => {
            setSearchKey((k) => k + 1);
            // Clears the filters; the sort stays.
            go({ ...initialListState(), sort: state.sort, order: state.order });
          }}
        >
          Clear filters
        </button>
      )}

      {schools.data && (
        <p className="text-xs text-gray-600 mb-2" data-testid="school-count">
          {formatNumber(schools.data.meta.total)} school{schools.data.meta.total === 1 ? "" : "s"}
          {isFiltered(state) ? " match the filters" : ""}
        </p>
      )}

      {bulk.toolbar}
      {schools.isError ? (
        <ErrorState error={schools.error} title="Couldn't load schools" onRetry={() => schools.refetch()} />
      ) : (
        <TableCard
          tableClassName="min-w-[1080px]"
          scrollTestId="schools-table-scroll"
          footer={
            schools.data && (
              <div className="px-4 pb-4">
                <Pagination
                  page={state.page}
                  totalPages={schools.data.meta.totalPages}
                  total={schools.data.meta.total}
                  onPage={(page) => update({ page })}
                  disabled={schools.isFetching}
                />
              </div>
            )
          }
        >
          <thead>
            <tr className="border-b border-gray-100" data-testid="schools-table-head">
              {bulk.enabled && <th className={`${th} w-8`} data-testid="bulk-select-col">{bulk.headerCheckbox}</th>}
              <th className={th}>School code</th>
              {sortHeader("name", "School name")}
              <th className={th}>Country</th>
              <th className={th}>District</th>
              <th className={th}>Sector</th>
              {sortHeader("verifiedStudents", "Number of students")}
              <th className={th}>Primary teacher</th>
              <th className={th}>Status</th>
              <th className={th}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-gray-100/80 ${schools.isFetching && schools.data ? "opacity-60" : ""}`}>
            {schools.isPending ? (
              <TableMessage colSpan={cols}>Loading schools…</TableMessage>
            ) : schools.data.data.length === 0 ? (
              <TableMessage colSpan={cols}>{isFiltered(state) ? "No schools match the filters." : "No schools yet."}</TableMessage>
            ) : (
              schools.data.data.map((s) => (
                <tr
                  key={s.id}
                  className="text-xs hover:bg-gray-50 cursor-pointer focus:outline-none focus-visible:bg-indigo-50/60"
                  data-testid="school-row"
                  tabIndex={0}
                  aria-label={`Open ${s.name}`}
                  onClick={(e) => rowClick(e, s.id)}
                  onKeyDown={(e) => rowKey(e, s.id)}
                >
                  {bulk.enabled && (
                    <td className={td} onClick={(e) => e.stopPropagation()}>
                      {bulk.rowCheckbox(s.id, s.name)}
                    </td>
                  )}
                  <td className={`${td} text-gray-700 font-mono whitespace-nowrap`} data-testid="school-code">
                    {orDash(s.code)}
                  </td>
                  <td className={`${td} font-semibold text-gray-800`} data-testid="school-name">
                    {s.name}
                    <span className="block text-[11px] font-normal text-gray-500">{SOURCE_LABEL[s.source] ?? s.source}</span>
                  </td>
                  <td className={`${td} text-gray-600 whitespace-nowrap`} data-testid="school-country">
                    {countryDisplayName(s.countryCode, countryList.countries)}
                  </td>
                  <td className={`${td} text-gray-600 whitespace-nowrap`} data-testid="school-district">
                    {orDash(s.district)}
                  </td>
                  <td className={`${td} text-gray-600 whitespace-nowrap`} data-testid="school-sector">
                    {orDash(s.sector)}
                  </td>
                  <td className={`${td} text-gray-800 font-semibold tabular-nums whitespace-nowrap`} data-testid="school-students">
                    {formatNumber(s.verifiedStudents)}
                  </td>
                  <td className={`${td} whitespace-nowrap`} data-testid="school-primary-teacher">
                    {s.primaryTeacher ? (
                      <Link href={`/admin/users/${s.primaryTeacher.id}`} className="text-indigo-700 hover:underline font-medium">
                        {`${s.primaryTeacher.firstName} ${s.primaryTeacher.lastName}`.trim()}
                      </Link>
                    ) : (
                      <span className="text-gray-500">{NO_PRIMARY_TEACHER}</span>
                    )}
                  </td>
                  <td className={td} data-testid="school-status">
                    <Badge className={s.isActive ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}>{s.isActive ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    <span className="flex items-center gap-3">
                      <Link href={`/admin/schools/${s.id}`} className={linkBtn} aria-label={`View ${s.name}`}>
                        View
                      </Link>
                      <button type="button" className={linkBtn} onClick={() => setDialog({ kind: "edit", school: s })} aria-label={`Edit ${s.name}`}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className={`${linkBtn} ${s.isActive ? "!text-red-600 hover:!text-red-800" : ""}`}
                        onClick={() => setDialog({ kind: "active", school: s })}
                        aria-label={`${s.isActive ? "Deactivate" : "Reactivate"} ${s.name}`}
                      >
                        {s.isActive ? "Deactivate" : "Reactivate"}
                      </button>
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableCard>
      )}

      {dialog?.kind === "create" || dialog?.kind === "edit" ? (
        <SchoolFormDialog
          school={dialog.kind === "edit" ? dialog.school : null}
          onClose={() => setDialog(null)}
          onSaved={(saved, created) => {
            setDialog(null);
            setNotice({ text: created ? `${saved.name} was added.` : `${saved.name} was saved.`, href: `/admin/schools/${saved.id}` });
            void refresh();
          }}
        />
      ) : dialog?.kind === "active" ? (
        <SchoolActiveDialog
          school={dialog.school}
          onClose={() => setDialog(null)}
          onDone={(r) => {
            setDialog(null);
            setNotice({ text: !r.changed ? `${r.school.name} was already ${r.school.isActive ? "active" : "inactive"}.` : `${r.school.name} was ${r.school.isActive ? "reactivated" : "deactivated"}.`, warning: r.warning });
            void refresh();
          }}
        />
      ) : null}
      {bulk.dialog}
    </AdminPage>
  );
}
