"use client";

/**
 * Registration data (owner 2026-11-23) — Super Administrators: choose a category, the columns (any registration field,
 * in any order, saved per category), filter on any field (AND / OR groups), sort, page, save and reuse filters, export
 * exactly what is shown (CSV or Excel, every matching row), and open a record to edit it. All filtering, sorting and
 * paging is done by the server; the fields come from the server, so new registration fields appear here on their own.
 */
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Download, Filter, Save } from "lucide-react";
import { errorMessage } from "@/lib/api/errors";
import { saveFile } from "@/lib/api/client";
import {
  cellText, countConditions, emptyGroup, filterProblems, groupFields, knownColumns, moveItem, pruneFilter, REGISTRATION_DATA_PERMISSION,
  registrationDataApi, saveFilterProblem, type CategoryKey, type FieldCatalogue, type FilterGroup, type RegistrationField, type SavedFilter, type SortSpec,
} from "@/lib/admin/registration-data";
import {
  useChangeColumnLayout, useColumnLayout, useDeleteFilter, useRegistrationFields, useRegistrationQuery, useSavedFilters, useSaveFilter,
} from "@/lib/queries/registration-data";
import { Alert, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { AdminPage, FilterPills, Modal, RequirePermission, SearchInput, TableCard, TableMessage, btnPrimary, btnSecondary, td, th } from "../components/adminUi";
import { FilterBuilder } from "./FilterBuilder";
import { RecordEditor } from "./RecordEditor";

const CATEGORY_LABELS: Array<{ value: CategoryKey; label: string }> = [
  { value: "STUDENTS", label: "Students" },
  { value: "TEACHERS", label: "Teachers" },
  { value: "COACHES", label: "Coaches" },
  { value: "HEAD_COACHES", label: "Head Coaches" },
  { value: "ADMINS", label: "Administrators" },
  { value: "ALL", label: "All users" },
];

export default function RegistrationDataClient() {
  return (
    <RequirePermission permission={REGISTRATION_DATA_PERMISSION} title="Registration data">
      <RegistrationData />
    </RequirePermission>
  );
}

function RegistrationData() {
  const [category, setCategory] = useState<CategoryKey>("STUDENTS");
  const catalogue = useRegistrationFields(category);
  const layout = useColumnLayout(category);
  return (
    <AdminPage
      title="Registration data"
      description="Everything people entered when they registered. Choose the columns, filter on any field, export what you see, and open a record to correct it."
    >
      <div className="mb-4">
        <FilterPills label="Category" options={CATEGORY_LABELS} value={category} onChange={(v) => setCategory(v)} />
      </div>
      {(catalogue.isLoading || layout.isLoading) && <LoadingBlock />}
      {catalogue.error && <ErrorState error={catalogue.error} title="Couldn't load the fields" onRetry={() => void catalogue.refetch()} />}
      {layout.error && <ErrorState error={layout.error} title="Couldn't load your columns" onRetry={() => void layout.refetch()} />}
      {catalogue.data && layout.data && catalogue.data.category === category && (
        <Workspace key={category} catalogue={catalogue.data} initialColumns={knownColumns(layout.data.columns, catalogue.data.fields)} />
      )}
    </AdminPage>
  );
}

function Workspace({ catalogue, initialColumns }: { catalogue: FieldCatalogue; initialColumns: string[] }) {
  const category = catalogue.category;
  const fields = catalogue.fields;
  const byKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const [columns, setColumns] = useState<string[]>(initialColumns.length ? initialColumns : catalogue.defaultColumns);
  const [draft, setDraft] = useState<FilterGroup>(emptyGroup());
  const [applied, setApplied] = useState<FilterGroup>(emptyGroup());
  const [sort, setSort] = useState<SortSpec[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [showFilter, setShowFilter] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [saving, setSaving] = useState<SavedFilter | "new" | null>(null);
  const [current, setCurrent] = useState<SavedFilter | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);

  const problems = filterProblems(draft, fields, catalogue.operators);
  const query = useMemo(() => ({ category, columns, filter: pruneFilter(applied), sort, search }), [category, columns, applied, sort, search]);
  const rows = useRegistrationQuery(query, page, limit);
  const saved = useSavedFilters(category);
  const saveFilter = useSaveFilter();
  const deleteFilter = useDeleteFilter();
  // Whatever changes the rows starts again at the first page.
  const fromFirstPage = <T,>(set: (v: T) => void) => (v: T) => {
    setPage(1);
    set(v);
  };
  const changeSearch = fromFirstPage(setSearch);
  const changeLimit = fromFirstPage(setLimit);

  function apply() {
    if (problems.length) return;
    setPage(1);
    setApplied(draft);
    setNotice(null);
  }
  function clear() {
    setPage(1);
    setDraft(emptyGroup());
    setApplied(emptyGroup());
    setCurrent(null);
  }
  function applySaved(f: SavedFilter) {
    setPage(1);
    setCurrent(f);
    setDraft(f.filter);
    setApplied(f.filter);
    setColumns(knownColumns(f.columns, fields));
    setSort(f.sort ?? []);
    setShowFilter(true);
    setNotice({ tone: "info", text: `Applied the saved filter “${f.name}”.` });
  }
  function toggleSort(key: string) {
    const f = byKey.get(key);
    if (!f?.sortable) return;
    setPage(1);
    setSort((cur) => {
      const now = cur[0]?.field === key ? cur[0].dir : null;
      return now === null ? [{ field: key, dir: "asc" }] : now === "asc" ? [{ field: key, dir: "desc" }] : [];
    });
  }
  async function download(format: "csv" | "xlsx") {
    setExporting(format);
    setNotice(null);
    try {
      saveFile(await registrationDataApi.export(query, format));
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err, "Couldn't create the export. Please try again.") });
    } finally {
      setExporting(null);
    }
  }

  const activeCount = countConditions(pruneFilter(applied));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={changeSearch} placeholder="Search name, e-mail or username…" label="Search accounts" />
        <button type="button" className={btnSecondary} onClick={() => setShowFilter((v) => !v)} aria-expanded={showFilter} data-testid="toggle-filter">
          <Filter className="h-3.5 w-3.5" aria-hidden="true" /> Filter{activeCount ? ` (${activeCount})` : ""}
        </button>
        <button type="button" className={btnSecondary} onClick={() => setShowColumns(true)} data-testid="open-columns">
          <Columns3 className="h-3.5 w-3.5" aria-hidden="true" /> Columns ({columns.length})
        </button>
        <SavedFilterMenu saved={saved.data ?? []} current={current} onUse={applySaved} />
        <div className="ml-auto flex gap-2">
          <button type="button" className={btnSecondary} disabled={!!exporting} onClick={() => void download("csv")} data-testid="export-csv">
            <Download className="h-3.5 w-3.5" aria-hidden="true" /> {exporting === "csv" ? "Preparing…" : "CSV"}
          </button>
          <button type="button" className={btnSecondary} disabled={!!exporting} onClick={() => void download("xlsx")} data-testid="export-xlsx">
            <Download className="h-3.5 w-3.5" aria-hidden="true" /> {exporting === "xlsx" ? "Preparing…" : "Excel"}
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500">Exports contain the columns shown, in this order, and every row that matches the search and the filter (not only this page).</p>

      {showFilter && (
        <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-4" data-testid="filter-panel">
          {current && (
            <p className="text-xs text-gray-600">
              Saved filter: <strong>{current.name}</strong>{!current.mine && ` (shared by ${current.owner.name})`}
            </p>
          )}
          <FilterBuilder value={draft} onChange={setDraft} fields={fields} operators={catalogue.operators} />
          {problems.length > 0 && countConditions(draft) > 0 && <Alert tone="info">{problems[0]}{problems.length > 1 ? ` (and ${problems.length - 1} more)` : ""}</Alert>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} onClick={apply} disabled={problems.length > 0} data-testid="apply-filter">Apply filter</button>
            <button type="button" className={btnSecondary} onClick={clear} data-testid="clear-filter">Clear</button>
            <button type="button" className={btnSecondary} onClick={() => setSaving(current?.mine ? current : "new")} disabled={problems.length > 0 || countConditions(draft) === 0} data-testid="save-filter">
              <Save className="h-3.5 w-3.5" aria-hidden="true" /> {current?.mine ? "Save changes" : "Save filter"}
            </button>
            {current?.mine && (
              <button type="button" className={btnSecondary} onClick={() => setSaving("new")}>Save as new</button>
            )}
            {current?.mine && (
              <button
                type="button"
                className={`${btnSecondary} text-red-700`}
                data-testid="delete-filter"
                onClick={async () => {
                  try {
                    await deleteFilter.mutateAsync(current.id);
                    setNotice({ tone: "success", text: `Deleted the saved filter “${current.name}”.` });
                    clear();
                  } catch (err) {
                    setNotice({ tone: "error", text: errorMessage(err) });
                  }
                }}
              >
                Delete saved filter
              </button>
            )}
          </div>
        </div>
      )}

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {rows.error && <ErrorState error={rows.error} title="Couldn't load the accounts" onRetry={() => void rows.refetch()} />}

      <TableCard
        scrollTestId="registration-table"
        footer={
          rows.data && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3">
              <label className="flex items-center gap-2 text-xs text-gray-600">
                Rows per page
                <select className="rounded border border-gray-200 px-2 py-1" value={limit} onChange={(e) => changeLimit(Number(e.target.value))}>
                  {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <Pagination page={rows.data.meta.page} totalPages={rows.data.meta.totalPages} total={rows.data.meta.total} onPage={setPage} disabled={rows.isFetching} />
            </div>
          )
        }
      >
        <thead className="bg-gray-50">
          <tr>
            {columns.map((k) => {
              const f = byKey.get(k);
              const dir = sort[0]?.field === k ? sort[0].dir : null;
              return (
                <th key={k} className={th} aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}>
                  {f?.sortable ? (
                    <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-gray-800" onClick={() => toggleSort(k)} data-testid={`sort-${k}`}>
                      {f.label}
                      {dir === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : dir === "desc" ? <ArrowDown className="h-3 w-3" aria-hidden="true" /> : <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />}
                    </button>
                  ) : (
                    f?.label ?? k
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.isLoading && <TableMessage colSpan={columns.length}>Loading…</TableMessage>}
          {rows.data && rows.data.rows.length === 0 && <TableMessage colSpan={columns.length}>No accounts match. Change the search or the filter.</TableMessage>}
          {rows.data?.rows.map((r) => (
            <tr
              key={r.id}
              className="cursor-pointer hover:bg-indigo-50/40 focus-within:bg-indigo-50/40"
              onClick={() => setOpenId(r.id)}
              data-testid="registration-row"
            >
              {columns.map((k, i) => {
                const f = byKey.get(k);
                const text = f ? cellText(r.values[k], f) : "—";
                return (
                  <td key={k} className={`${td} text-sm text-gray-800 max-w-[18rem] truncate`} title={text}>
                    {i === 0 ? (
                      <button type="button" className="text-left font-semibold text-indigo-700 hover:underline" onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }}>
                        {text}
                      </button>
                    ) : text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </TableCard>

      {showColumns && <ColumnsDialog category={category} fields={fields} columns={columns} defaults={catalogue.defaultColumns} onApply={setColumns} onClose={() => setShowColumns(false)} />}
      {saving && (
        <SaveFilterDialog
          existing={saving === "new" ? null : saving}
          onClose={() => setSaving(null)}
          onSave={async (name, shared) => {
            const input = { name, shared, category, filter: pruneFilter(draft), columns, sort };
            const r = await saveFilter.mutateAsync({ id: saving === "new" ? undefined : saving.id, input });
            setCurrent(r);
            setApplied(draft);
            setSaving(null);
            setNotice({ tone: "success", text: `Saved the filter “${r.name}”.` });
          }}
        />
      )}
      {openId && <RecordEditor id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function SavedFilterMenu({ saved, current, onUse }: { saved: SavedFilter[]; current: SavedFilter | null; onUse: (f: SavedFilter) => void }) {
  if (!saved.length) return null;
  return (
    <label className="flex items-center gap-2 text-xs text-gray-600">
      <span className="font-semibold">Saved filters</span>
      <select
        className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700"
        value={current?.id ?? ""}
        onChange={(e) => {
          const f = saved.find((x) => x.id === e.target.value);
          if (f) onUse(f);
        }}
        data-testid="saved-filters"
      >
        <option value="">Choose…</option>
        {saved.map((f) => (
          <option key={f.id} value={f.id}>{f.name}{f.mine ? "" : ` — shared by ${f.owner.name}`}</option>
        ))}
      </select>
    </label>
  );
}

function SaveFilterDialog({ existing, onClose, onSave }: { existing: SavedFilter | null; onClose: () => void; onSave: (name: string, shared: boolean) => Promise<void> }) {
  const [name, setName] = useState(existing?.name ?? "");
  const [shared, setShared] = useState(existing?.shared ?? false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={existing ? "Save changes to the filter" : "Save this filter"} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const p = saveFilterProblem(name);
          if (p) return setProblem(p);
          setBusy(true);
          setProblem(null);
          try {
            await onSave(name.trim(), shared);
          } catch (err) {
            setProblem(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block text-xs font-semibold text-gray-700">
          Name
          <input className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} data-testid="filter-name" autoFocus />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          Share with the other Super Administrators (they can use it, not change it)
        </label>
        <p className="text-xs text-gray-500">The filter, the columns in their order and the sort are saved together.</p>
        {problem && <Alert tone="error">{problem}</Alert>}
        <div className="flex gap-2">
          <button type="submit" className={btnPrimary} disabled={busy} data-testid="confirm-save-filter">{busy ? "Saving…" : "Save"}</button>
          <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function ColumnsDialog({ category, fields, columns, defaults, onApply, onClose }: {
  category: CategoryKey; fields: RegistrationField[]; columns: string[]; defaults: string[]; onApply: (c: string[]) => void; onClose: () => void;
}) {
  const change = useChangeColumnLayout(category);
  const [chosen, setChosen] = useState<string[]>(columns);
  const [problem, setProblem] = useState<string | null>(null);
  const label = (k: string) => fields.find((f) => f.key === k)?.label ?? k;
  const toggle = (k: string) => setChosen((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  async function run(save: boolean | "reset") {
    setProblem(null);
    if (!chosen.length) return setProblem("Choose at least one column.");
    try {
      if (save === "reset") {
        const l = await change.mutateAsync(null);
        onApply(l.columns);
      } else {
        if (save) await change.mutateAsync(chosen);
        onApply(chosen);
      }
      onClose();
    } catch (err) {
      setProblem(errorMessage(err));
    }
  }

  return (
    <Modal title="Columns" onClose={onClose} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Shown, in order ({chosen.length})</h3>
          <ol className="divide-y divide-gray-100 rounded-xl border border-gray-200" data-testid="chosen-columns">
            {chosen.map((k, i) => (
              <li key={k} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <span className="flex-1 truncate">{label(k)}</span>
                <button type="button" className="rounded p-1 text-gray-600 hover:bg-gray-100 disabled:opacity-30" disabled={i === 0} onClick={() => setChosen((c) => moveItem(c, i, -1))} aria-label={`Move ${label(k)} up`}>
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" className="rounded p-1 text-gray-600 hover:bg-gray-100 disabled:opacity-30" disabled={i === chosen.length - 1} onClick={() => setChosen((c) => moveItem(c, i, 1))} aria-label={`Move ${label(k)} down`}>
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className="max-h-[55vh] overflow-y-auto pr-1">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Every field ({fields.length})</h3>
          {groupFields(fields).map((g) => (
            <fieldset key={g.group} className="mb-3">
              <legend className="mb-1 text-xs font-semibold text-gray-700">{g.group}</legend>
              {g.fields.map((f) => (
                <label key={f.key} className="flex items-center gap-2 py-0.5 text-sm text-gray-800">
                  <input type="checkbox" checked={chosen.includes(f.key)} onChange={() => toggle(f.key)} data-testid={`column-${f.key}`} />
                  {f.label}
                  {f.personal && <span className="rounded-full bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-800">personal</span>}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      </div>
      {problem && <div className="mt-3"><Alert tone="error">{problem}</Alert></div>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} disabled={change.isPending} onClick={() => void run(true)} data-testid="save-columns">Save for this category</button>
        <button type="button" className={btnSecondary} disabled={change.isPending} onClick={() => void run(false)} data-testid="apply-columns">Use without saving</button>
        <button type="button" className={btnSecondary} disabled={change.isPending} onClick={() => setChosen(defaults)}>Default columns</button>
        <button type="button" className={btnSecondary} disabled={change.isPending} onClick={() => void run("reset")}>Forget my saved columns</button>
      </div>
    </Modal>
  );
}
