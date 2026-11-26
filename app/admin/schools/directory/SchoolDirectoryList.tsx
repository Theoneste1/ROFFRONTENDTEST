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
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCountryOptions } from "@/lib/queries/countries";
import { countryDisplayName } from "@/lib/countries/reference";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, Eye, Pencil, Plus, Power, RotateCcw } from "lucide-react";
import { IconAction } from "@/app/components/ui/IconAction";
import { hasFeature } from "@/lib/api/capabilities";
import type { DirectorySchoolRecord, SchoolSource } from "@/lib/api/school-directory";
import { useSession } from "@/lib/auth/session";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { invalidateAfterSchoolChange, useDirectorySchools, useSchoolLocations, useSchoolReferenceData, useSyncAccess } from "@/lib/queries/school-directory";
import { formatNumber } from "@/lib/format";
import {
  ACCOMMODATION_LABEL, ACCOMMODATION_OPTIONS, CONTACT_SEARCH_MIN, EDUCATION_LEVEL_LABEL, OWNERSHIP_LABEL, OWNERSHIP_OPTIONS,
  PROGRAMME_CATEGORY_LABEL, RWANDA, SOURCE_LABEL, cleanPlace, ariaSort, initialListState, isFiltered, listFilters, listStateFromParams, listStateToParams, nextSort, orDash,
  type ListState, type SchoolSort,
} from "@/lib/admin/school-directory";
import { NO_PRIMARY_TEACHER } from "@/lib/schools/primary-teacher";
import { ErrorState } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { AdminPage, Badge, Notice, SearchInput, TableCard, TableMessage, btnPrimary, btnSecondary, td, th } from "../../components/adminUi";
import { FilterBar } from "@/app/components/ui/FilterBar";
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
  // Every field of the NESA file (owner 2026-11-23): ownership, cell, village, contacts, programme category.
  const allFields = hasFeature(detection, "schoolListFilters");
  const filters = listFilters(state, { sortable, allFields });
  const filtered = isFiltered(state, { allFields });
  const schools = useDirectorySchools(filters);
  const locations = useSchoolLocations();
  const { can } = useSession();
  const review = hasFeature(detection, "schoolAffiliations") && can("schools.manage");
  const sync = useSyncAccess().visible;

  /** Remounts the search box on "Clear filters" (it keeps its own text while typing). */
  const [searchKey, setSearchKey] = useState(0);
  // The latest filters asked for. Two quick changes (e.g. Status, then Province before the page re-renders) must build
  // on each other: the second one starts from what the first asked for, not from the address before it (2026-11-24 fix).
  const latest = useRef(state);
  const urlKey = params.toString();
  useEffect(() => {
    latest.current = listStateFromParams(new URLSearchParams(urlKey));   // the address changed (a change applied, or Back)
  }, [urlKey]);
  const go = (next: ListState) => {
    latest.current = next;
    const query = listStateToParams(next);
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  };
  // Any change but a page change goes back to page 1; the sort is kept with every filter.
  const update = (patch: Partial<ListState>) => go({ ...latest.current, ...patch, page: patch.page ?? 1 });
  const sortBy = (column: SchoolSort) => update(nextSort(state, column));
  // Filtered by a contact (owner 2026-11-23: "I should find the school contact"): a school opens on its Contacts tab.
  const contactsTab = state.contact.trim() !== "" || state.email !== "any" || state.phone !== "any";
  const schoolHref = (id: string) => `/admin/schools/${id}${contactsTab ? "?tab=contacts" : ""}`;
  const open = (id: string) => router.push(schoolHref(id));
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
  const reference = useSchoolReferenceData();
  // The programmes of the chosen category (all programmes when none is chosen), by name.
  const programmes = (reference.data?.programmes ?? [])
    .filter((p) => !state.programmeCategory || p.category === state.programmeCategory)
    .sort((a, b) => a.name.localeCompare(b.name));
  const presence = (any: string, withLabel: string, withoutLabel: string) => [
    { label: any, value: "any" }, { label: withLabel, value: "with" }, { label: withoutLabel, value: "without" },
  ];
  const contactTooShort = state.contact.trim().length > 0 && state.contact.trim().length < CONTACT_SEARCH_MIN;
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

      {/* Filters (owner 2026-11-25): "+ Add filter" and the active ones as chips, not every filter on screen. */}
      <FilterBar
        testId="school-filters"
        search={<SearchInput key={searchKey} value={state.q} onChange={(q) => update({ q })} placeholder="Name or code…" label="Search schools by name or code" />}
        onClearAll={() => {
          setSearchKey((k) => k + 1);
          // Clears the filters; the sort stays.
          go({ ...initialListState(), sort: state.sort, order: state.order });
        }}
        filters={[
          // A new country clears the place filters (they belong to Rwanda).
          { key: "country", kind: "select", label: "Country", value: state.countryCode, onChange: (v) => update({ countryCode: v, province: "", district: "", sector: "" }), options: countries },
          { key: "status", kind: "select", label: "Status", value: state.status, emptyValue: "all", onChange: (v) => update({ status: v as ListState["status"] }),
            options: [{ label: "Active", value: "active" }, { label: "Inactive", value: "inactive" }] },
          { key: "source", kind: "select", label: "Source", value: state.source, onChange: (v) => update({ source: v as SchoolSource | "" }),
            options: (Object.keys(SOURCE_LABEL) as SchoolSource[]).map((s) => ({ label: SOURCE_LABEL[s], value: s })) },
          { key: "code", kind: "select", label: "Code", value: state.code, emptyValue: "any", onChange: (v) => update({ code: v as ListState["code"] }),
            options: [{ label: "With a code", value: "with" }, { label: "Without a code", value: "without" }] },
          { key: "province", kind: "select", label: "Province", value: state.province, show: showPlaces, onChange: (province) => update({ province, district: "", sector: "" }),
            options: provinces.map((p) => ({ label: p.province, value: p.province })) },
          { key: "district", kind: "select", label: "District", value: state.district, show: showPlaces && !!state.province, onChange: (district) => update({ district, sector: "" }),
            options: districts.map((d) => ({ label: d.district, value: d.district })) },
          { key: "sector", kind: "select", label: "Sector", value: state.sector, show: showPlaces && !!state.district, onChange: (sector) => update({ sector }),
            options: sectors.map((s) => ({ label: s, value: s })) },
          { key: "cell", kind: "text", label: "Cell", value: state.cell, show: allFields && showPlaces, placeholder: "Cell…", onChange: (cell) => update({ cell: cleanPlace(cell) }) },
          { key: "village", kind: "text", label: "Village", value: state.village, show: allFields && showPlaces, placeholder: "Village…", onChange: (village) => update({ village: cleanPlace(village) }) },
          { key: "level", kind: "select", label: "Level", value: state.level, onChange: (level) => update({ level }),
            options: Object.entries(EDUCATION_LEVEL_LABEL).map(([value, label]) => ({ label, value })) },
          // A new type clears a programme of another type.
          { key: "programmeCategory", kind: "select", label: "Programme type", value: state.programmeCategory, show: allFields,
            onChange: (v) => update({ programmeCategory: v as ListState["programmeCategory"], programme: "" }),
            options: Object.entries(PROGRAMME_CATEGORY_LABEL).map(([value, label]) => ({ label, value })) },
          { key: "programme", kind: "select", label: "Combination / trade", value: state.programme, show: programmes.length > 0, onChange: (programme) => update({ programme }),
            options: programmes.map((p) => ({ label: p.code ? `${p.name} (${p.code})` : p.name, value: p.id })) },
          { key: "accommodation", kind: "select", label: "Day / boarding", value: state.accommodation, onChange: (v) => update({ accommodation: v as ListState["accommodation"] }),
            options: ACCOMMODATION_OPTIONS.map((a) => ({ label: ACCOMMODATION_LABEL[a], value: a })) },
          { key: "ownership", kind: "select", label: "Ownership", value: state.ownership, show: allFields, onChange: (v) => update({ ownership: v as ListState["ownership"] }),
            options: OWNERSHIP_OPTIONS.map((o) => ({ label: OWNERSHIP_LABEL[o], value: o })) },
          { key: "email", kind: "select", label: "E-mail", value: state.email, emptyValue: "any", show: allFields, onChange: (v) => update({ email: v as ListState["email"] }),
            options: presence("Any", "Has an e-mail", "No e-mail") },
          { key: "phone", kind: "select", label: "Phone", value: state.phone, emptyValue: "any", show: allFields, onChange: (v) => update({ phone: v as ListState["phone"] }),
            options: presence("Any", "Has a phone", "No phone") },
          { key: "contact", kind: "text", label: "E-mail or phone", value: state.contact, show: allFields, placeholder: "E-mail or phone…", onChange: (contact) => update({ contact }),
            hint: `At least ${CONTACT_SEARCH_MIN} characters of the e-mail or phone number.` },
          { key: "issues", kind: "select", label: "Source data", value: state.issues, emptyValue: "any", onChange: (v) => update({ issues: v as ListState["issues"] }),
            options: presence("Any", "With problems", "Without problems") },
        ]}
      />
      {contactTooShort && (
        <p className="-mt-2 mb-3 text-xs text-gray-600" data-testid="contact-too-short">
          Type at least {CONTACT_SEARCH_MIN} characters of the e-mail or phone number.
        </p>
      )}

      {schools.data && (
        <p className="text-xs text-gray-600 mb-2" data-testid="school-count">
          {formatNumber(schools.data.meta.total)} school{schools.data.meta.total === 1 ? "" : "s"}
          {filtered ? " match the filters" : ""}
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
              <TableMessage colSpan={cols}>{filtered ? "No schools match the filters." : "No schools yet."}</TableMessage>
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
                    {/* The school's name only (owner 2026-11-22): its source stays in the filter and on the school's page. */}
                    {s.name}
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
                    <span className="flex items-center gap-1.5">
                      <IconAction href={schoolHref(s.id)} icon={Eye} tone="slate" label={`View ${s.name}`} />
                      <IconAction icon={Pencil} tone="primary" label={`Edit ${s.name}`} onClick={() => setDialog({ kind: "edit", school: s })} />
                      <IconAction
                        icon={s.isActive ? Power : RotateCcw}
                        tone={s.isActive ? "danger" : "teal"}
                        label={`${s.isActive ? "Deactivate" : "Reactivate"} ${s.name}`}
                        onClick={() => setDialog({ kind: "active", school: s })}
                      />
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
