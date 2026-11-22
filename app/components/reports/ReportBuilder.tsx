"use client";

/**
 * Build or edit a custom report: name and description, the source, the columns (chosen and ordered), filters and a
 * sort; preview on live data (only the rows the viewer may see), then save. Builders (reports.build) choose from every
 * field of the source; a user with Edit access but without reports.build changes the name, description and the order
 * of the columns already chosen (the field catalogue is for builders).
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { errorMessage } from "@/lib/api/errors";
import {
  OP_LABEL, REPORT_TEMPLATES, customReportsApi, definitionProblems, needsValue, opsFor, saveProblems, templateDefinition,
  type CustomReport, type FieldType, type FilterOp, type ReportDefinition, type ReportPage, type ReportSource,
} from "@/lib/reports/custom-reports";
import { useReportCatalogue, useSaveReport } from "@/lib/queries/custom-reports";
import { useDivisions } from "@/lib/queries/divisions";
import { activeDivisions } from "@/lib/divisions/divisions";
import { Alert, LoadingBlock } from "@/app/components/ui/feedback";
import ReportTable from "./ReportTable";

const field = "w-full text-sm text-gray-800 bg-white border border-gray-300 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-[#00428C]/20 focus:border-[#00428C]";
const btn = "inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60";
const primary = `${btn} bg-[#00428C] text-white hover:bg-[#003370]`;
const secondary = `${btn} border border-gray-300 bg-white text-gray-800 hover:bg-gray-50`;
const EMPTY: ReportDefinition = { source: "STUDENTS", columns: ["fullName"], filters: [], sort: [] };

function move<T>(list: T[], i: number, by: -1 | 1): T[] {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

function ValueInput({ type, values, op, value, onChange, fieldKey }: { type: FieldType; values: string[] | null; op: FilterOp; value: unknown; onChange: (v: unknown) => void; fieldKey: string }) {
  const divisions = useDivisions();
  if (!needsValue(op)) return null;
  const options = fieldKey === "olympiadLevel" ? activeDivisions(divisions.data).map((d) => ({ value: d.code, label: d.name })) : (values ?? []).map((v) => ({ value: v, label: v }));
  if (type === "boolean") return <select className={field} value={value === false ? "false" : "true"} onChange={(e) => onChange(e.target.value === "true")}><option value="true">Yes</option><option value="false">No</option></select>;
  if (type === "date") return <input type="date" className={field} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
  if (options.length && op === "in") {
    const list = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="inline-flex items-center gap-1 text-xs">
            <input type="checkbox" checked={list.includes(o.value)} onChange={() => onChange(list.includes(o.value) ? list.filter((x) => x !== o.value) : [...list, o.value])} /> {o.label}
          </label>
        ))}
      </div>
    );
  }
  if (options.length) return <select className={field} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}><option value="">Choose…</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
  return <input className={field} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} maxLength={200} />;
}

export default function ReportBuilder({ report, base, builder }: { report?: CustomReport; base: string; builder: boolean }) {
  const router = useRouter();
  const catalogue = useReportCatalogue(builder);
  const save = useSaveReport(report?.id);
  const [name, setName] = useState(report?.name ?? "");
  const [description, setDescription] = useState(report?.description ?? "");
  const [d, setD] = useState<ReportDefinition>(report ? { source: report.source, columns: report.columns, filters: report.filters, sort: report.sort } : EMPTY);
  const [preview, setPreview] = useState<ReportPage | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const source: ReportSource | undefined = useMemo(() => {
    const s = catalogue.data?.sources.find((x) => x.key === d.source);
    if (s) return s;
    // Without the catalogue (Edit access only): the chosen columns, by their keys.
    return builder ? undefined : { key: d.source, label: d.source, fields: d.columns.map((k) => ({ key: k, label: k, type: "text" as const, values: null, filterable: false, sortable: false })) };
  }, [catalogue.data, d.source, d.columns, builder]);
  const labelOf = (k: string) => source?.fields.find((f) => f.key === k)?.label ?? k;
  const types = Object.fromEntries((source?.fields ?? []).map((f) => [f.key, f.type])) as Record<string, FieldType>;
  const change = (next: ReportDefinition) => { setD(next); setPreview(null); setProblem(null); };

  async function runPreview(p = 1) {
    const problems = builder ? definitionProblems(d, source) : [];
    if (problems.length) return setProblem(problems.join(" "));
    setBusy(true);
    setProblem(null);
    try {
      setPreview(report && !builder ? await customReportsApi.previewFor(report.id, d, p) : await customReportsApi.preview(d, p));
      setPage(p);
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    const p = saveProblems(name) ?? (builder ? definitionProblems(d, source)[0] : undefined);
    if (p) return setProblem(p);
    try {
      const r = await save.mutateAsync({ name: name.trim(), description: description.trim() || undefined, ...d });
      router.push(`${base}/${r.id}`);
    } catch (err) {
      setProblem(errorMessage(err));
    }
  }

  if (builder && catalogue.isPending) return <LoadingBlock />;
  if (builder && catalogue.isError) return <Alert tone="error">{errorMessage(catalogue.error)}</Alert>;
  const unused = (source?.fields ?? []).filter((f) => !d.columns.includes(f.key));

  return (
    <div className="flex flex-col gap-6" data-testid="report-builder">
      {builder && !report && (
        <section data-testid="report-templates">
          <h2 className="mb-2 text-sm font-bold text-gray-900">Start from an example</h2>
          <div className="flex flex-wrap gap-2">
            {REPORT_TEMPLATES.map((t) => (
              <button key={t.name} type="button" className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-800 hover:border-[#00428C] hover:text-[#00428C]" title={t.description}
                onClick={() => { setName(t.name); setDescription(t.description); change(templateDefinition(t, new Date())); }}>
                {t.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:grid-cols-3">
        <div>
          <label htmlFor="report-name" className="mb-1 block text-xs font-semibold text-gray-700">Name</label>
          <input id="report-name" className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} data-testid="report-name" />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="report-desc" className="mb-1 block text-xs font-semibold text-gray-700">Description (optional)</label>
          <input id="report-desc" className={field} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
        </div>
        {builder && (
          <div>
            <label htmlFor="report-source" className="mb-1 block text-xs font-semibold text-gray-700">Lists</label>
            <select id="report-source" className={field} value={d.source} data-testid="report-source"
              onChange={(e) => change({ source: e.target.value, columns: ["fullName"], filters: [], sort: [] })}>
              {catalogue.data!.sources.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-gray-900">Columns, in order</h2>
        <ol className="mb-3 divide-y divide-gray-100 rounded-xl border border-gray-200" data-testid="report-columns">
          {d.columns.map((c, i) => (
            <li key={c} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className="flex-1 font-medium text-gray-900">{labelOf(c)}</span>
              <button type="button" aria-label={`Move ${labelOf(c)} up`} className="rounded p-1 hover:bg-gray-100 disabled:opacity-30" disabled={i === 0} onClick={() => change({ ...d, columns: move(d.columns, i, -1) })}><ArrowUp className="h-4 w-4" aria-hidden="true" /></button>
              <button type="button" aria-label={`Move ${labelOf(c)} down`} className="rounded p-1 hover:bg-gray-100 disabled:opacity-30" disabled={i === d.columns.length - 1} onClick={() => change({ ...d, columns: move(d.columns, i, 1) })}><ArrowDown className="h-4 w-4" aria-hidden="true" /></button>
              <button type="button" aria-label={`Remove ${labelOf(c)}`} className="rounded p-1 text-red-700 hover:bg-red-50 disabled:opacity-30" disabled={d.columns.length === 1}
                onClick={() => change({ ...d, columns: d.columns.filter((x) => x !== c), sort: d.sort })}><X className="h-4 w-4" aria-hidden="true" /></button>
            </li>
          ))}
        </ol>
        {builder && unused.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {unused.map((f) => (
              <button key={f.key} type="button" className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:border-[#00428C] hover:text-[#00428C]"
                onClick={() => change({ ...d, columns: [...d.columns, f.key] })} data-testid={`add-column-${f.key}`}>
                <Plus className="h-3 w-3" aria-hidden="true" /> {f.label}
              </button>
            ))}
          </div>
        )}
      </section>

      {builder && source && (
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-gray-900">Filters</h2>
          {d.filters.length === 0 && <p className="mb-2 text-xs text-gray-600">No filter: every row you may see.</p>}
          <ul className="flex flex-col gap-2">
            {d.filters.map((f, i) => {
              const def = source.fields.find((x) => x.key === f.field);
              const set = (patch: Partial<typeof f>) => change({ ...d, filters: d.filters.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
              return (
                <li key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-center">
                  <select className={field} value={f.field} aria-label="Field" onChange={(e) => { const nd = source.fields.find((x) => x.key === e.target.value)!; set({ field: nd.key, op: opsFor(nd)[0], value: undefined }); }}>
                    {source.fields.filter((x) => x.filterable).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                  </select>
                  <select className={field} value={f.op} aria-label="Condition" onChange={(e) => set({ op: e.target.value as FilterOp, value: undefined })}>
                    {def && opsFor(def).map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}
                  </select>
                  {def ? <ValueInput type={def.type} values={def.values} op={f.op} value={f.value} onChange={(v) => set({ value: v })} fieldKey={def.key} /> : <span />}
                  <button type="button" aria-label="Remove filter" className="rounded p-2 text-red-700 hover:bg-red-50" onClick={() => change({ ...d, filters: d.filters.filter((_, j) => j !== i) })}><X className="h-4 w-4" aria-hidden="true" /></button>
                </li>
              );
            })}
          </ul>
          <button type="button" className={`${secondary} mt-3`} disabled={d.filters.length >= 20}
            onClick={() => { const first = source.fields.find((x) => x.filterable)!; change({ ...d, filters: [...d.filters, { field: first.key, op: opsFor(first)[0] }] }); }} data-testid="add-filter">
            <Plus className="h-4 w-4" aria-hidden="true" /> Add a filter
          </button>

          <h2 className="mb-2 mt-6 text-sm font-bold text-gray-900">Sort</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select className={`${field} max-w-xs`} aria-label="Sort by" value={d.sort[0]?.field ?? ""} onChange={(e) => change({ ...d, sort: e.target.value ? [{ field: e.target.value, dir: d.sort[0]?.dir ?? "asc" }] : [] })}>
              <option value="">Default (registration date, newest first)</option>
              {source.fields.filter((x) => x.sortable).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
            {d.sort[0] && (
              <select className={`${field} max-w-[10rem]`} aria-label="Direction" value={d.sort[0].dir} onChange={(e) => change({ ...d, sort: [{ field: d.sort[0].field, dir: e.target.value as "asc" | "desc" }] })}>
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            )}
          </div>
        </section>
      )}

      {problem && <Alert tone="error">{problem}</Alert>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondary} disabled={busy} onClick={() => void runPreview(1)} data-testid="report-preview">{busy ? "Loading…" : "Preview"}</button>
        <button type="button" className={primary} disabled={save.isPending} onClick={() => void submit()} data-testid="report-save">{save.isPending ? "Saving…" : report ? "Save changes" : "Save report"}</button>
        <button type="button" className={secondary} onClick={() => router.push(report ? `${base}/${report.id}` : base)}>Cancel</button>
      </div>
      {preview && <ReportTable data={preview} types={types} page={page} onPage={(p) => void runPreview(p)} busy={busy} />}
    </div>
  );
}
