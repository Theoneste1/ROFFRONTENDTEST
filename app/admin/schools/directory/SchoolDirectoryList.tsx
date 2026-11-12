"use client";

/**
 * /admin/schools in "manage" mode: every school (official, administrator-created and legacy;
 * active and inactive) from `GET /admin/schools`, with search, filters, counts, and create /
 * edit / deactivate / reactivate. The students' school-claim review stays where it was
 * (/admin/schools/affiliations, `schoolAffiliations` + `schools.manage`).
 */
import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";
import { hasFeature } from "@/lib/api/capabilities";
import type { DirectorySchoolRecord, SchoolSource } from "@/lib/api/school-directory";
import { useSession } from "@/lib/auth/session";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { useDirectorySchools, useSchoolLocations } from "@/lib/queries/school-directory";
import { queryKeys } from "@/lib/query/keys";
import { formatNumber } from "@/lib/format";
import { RWANDA, SOURCE_LABEL, initialListState, isFiltered, listFilters, placeLabel, type ListState } from "@/lib/admin/school-directory";
import { ErrorState } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { AdminPage, Badge, Notice, SearchInput, SelectFilter, TableCard, TableMessage, btnPrimary, btnSecondary, linkBtn, td, th } from "../../components/adminUi";
import SchoolActiveDialog from "./SchoolActiveDialog";
import SchoolFormDialog from "./SchoolFormDialog";

type Dialog = { kind: "create" } | { kind: "edit"; school: DirectorySchoolRecord } | { kind: "active"; school: DirectorySchoolRecord } | null;

export default function SchoolDirectoryList() {
  const [state, setState] = useState<ListState>(initialListState);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<{ text: string; href?: string } | null>(null);
  const qc = useQueryClient();
  const filters = listFilters(state);
  const schools = useDirectorySchools(filters);
  const locations = useSchoolLocations();
  const { can } = useSession();
  const review = hasFeature(useBackendCapabilities().detection, "schoolAffiliations") && can("schools.manage");

  const [otherCountry, setOtherCountry] = useState(false);
  /** Remounts the search box on "Clear filters" (it keeps its own text while typing). */
  const [searchKey, setSearchKey] = useState(0);
  const update = (patch: Partial<ListState>) => setState((s) => ({ ...s, ...patch, page: patch.page ?? 1 }));
  const countryMode = otherCountry ? "OTHER" : state.countryCode === RWANDA ? RWANDA : "";
  const showPlaces = countryMode !== "OTHER";
  const provinces = locations.data ?? [];
  const districts = provinces.find((p) => p.province === state.province)?.districts ?? [];
  const sectors = districts.find((d) => d.district === state.district)?.sectors ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.schoolDirectory.all });

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
        </Notice>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-3" data-testid="school-filters">
        <SearchInput key={searchKey} value={state.q} onChange={(q) => update({ q })} placeholder="Name or code…" label="Search schools by name or code" />
        <SelectFilter
          label="Country"
          value={countryMode}
          onChange={(v) => {
            setOtherCountry(v === "OTHER");
            update({ countryCode: v === "OTHER" ? "" : v, province: "", district: "", sector: "" });
          }}
          options={[
            { label: "Any", value: "" },
            { label: "Rwanda", value: RWANDA },
            { label: "Another country…", value: "OTHER" },
          ]}
        />
        {countryMode === "OTHER" && (
          <input
            aria-label="Country code"
            value={state.countryCode}
            onChange={(e) => update({ countryCode: e.target.value.toUpperCase().slice(0, 2) })}
            maxLength={2}
            placeholder="KE"
            className="w-16 bg-white border border-gray-200 rounded-full px-3 py-1.5 text-xs font-medium uppercase"
          />
        )}
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
      {(isFiltered(state) || otherCountry) && (
        <button
          type="button"
          className={`${linkBtn} mb-4`}
          onClick={() => {
            setOtherCountry(false);
            setSearchKey((k) => k + 1);
            setState(initialListState());
          }}
        >
          Clear filters
        </button>
      )}

      {schools.data && (
        <p className="text-xs text-gray-500 mb-2" data-testid="school-count">
          {formatNumber(schools.data.meta.total)} school{schools.data.meta.total === 1 ? "" : "s"}
          {isFiltered(state) ? " match the filters" : ""}
        </p>
      )}

      {schools.isError ? (
        <ErrorState error={schools.error} title="Couldn't load schools" onRetry={() => schools.refetch()} />
      ) : (
        <TableCard
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
            <tr className="border-b border-gray-100">
              <th className={th}>School</th>
              <th className={th}>Place</th>
              <th className={th}>Source</th>
              <th className={th}>Students</th>
              <th className={th}>Status</th>
              <th className={th}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-gray-100/80 ${schools.isFetching && schools.data ? "opacity-60" : ""}`}>
            {schools.isPending ? (
              <TableMessage colSpan={6}>Loading schools…</TableMessage>
            ) : schools.data.data.length === 0 ? (
              <TableMessage colSpan={6}>{isFiltered(state) ? "No schools match the filters." : "No schools yet."}</TableMessage>
            ) : (
              schools.data.data.map((s) => (
                <tr key={s.id} className="text-xs hover:bg-gray-50/60" data-testid="school-row">
                  <td className={`${td} font-semibold text-gray-800`}>
                    {s.name}
                    {s.code && <span className="block text-[11px] font-normal text-gray-400">Code {s.code}</span>}
                  </td>
                  <td className={`${td} text-gray-500`}>{placeLabel(s)}</td>
                  <td className={`${td} text-gray-500`}>{SOURCE_LABEL[s.source] ?? s.source}</td>
                  <td className={`${td} text-gray-600 whitespace-nowrap`}>
                    {formatNumber(s.students)}
                    <span className="block text-[11px] text-gray-400">{formatNumber(s.verifiedStudents)} verified</span>
                  </td>
                  <td className={td}>
                    <Badge className={s.isActive ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}>{s.isActive ? "Active" : "Inactive"}</Badge>
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
            setNotice({ text: !r.changed ? `${r.school.name} was already ${r.school.isActive ? "active" : "inactive"}.` : `${r.school.name} was ${r.school.isActive ? "reactivated" : "deactivated"}.` });
            void refresh();
          }}
        />
      ) : null}
    </AdminPage>
  );
}
