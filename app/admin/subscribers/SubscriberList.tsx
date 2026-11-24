"use client";

/** The subscriber list: filters in the page address, paging, add / import / export, and each row's actions. */
import { useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Upload } from "lucide-react";
import { errorMessage } from "@/lib/api/errors";
import { subscribersApi, type ImportResult, type Subscriber, type SubscriberInput } from "@/lib/api/subscribers";
import { useCreateSubscriber, useDeleteSubscriber, useImportSubscribers, useSubscribers, useUpdateSubscriber } from "@/lib/queries/subscribers";
import {
  KINDS, SOURCE_LABEL, STATUS_LABEL, SUBJECTS, filtersFromParams, filtersToQuery, interestsLabel, kindLabel,
  type OlympiadSubject, type SubscriberFilters, type SubscriberKind,
} from "@/lib/subscribers/rules";
import { countryName, countryOptions } from "@/lib/schools/countries";
import { formatDate, formatDateTime } from "@/lib/format";
import { Alert, ErrorState } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import {
  Badge, ConfirmDialog, CsvButton, Modal, Notice, SearchInput, SelectFilter, TableCard, TableMessage, btnPrimary, btnSecondary, linkBtn, td, th,
} from "../components/adminUi";

type NoticeFn = (tone: "success" | "error" | "info", text: string) => void;

const inputCls = "w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500";
const labelCls = "block text-sm font-semibold text-slate-700 mb-1";
const COUNTRIES = countryOptions();

export default function SubscriberList({ onNotice }: { onNotice: NoticeFn }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filters = filtersFromParams(params);
  const list = useSubscribers(filters);
  const [dialog, setDialog] = useState<
    | { kind: "add" }
    | { kind: "edit"; s: Subscriber }
    | { kind: "unsubscribe"; s: Subscriber }
    | { kind: "resubscribe"; s: Subscriber }
    | { kind: "erase"; s: Subscriber }
    | { kind: "import" }
    | null
  >(null);
  const update = useUpdateSubscriber();
  const erase = useDeleteSubscriber();

  function setFilters(next: SubscriberFilters) {
    const q = filtersToQuery(next);
    const tab = params.get("tab");
    const all = [tab ? `tab=${tab}` : "", q].filter(Boolean).join("&");
    router.replace(all ? `${pathname}?${all}` : pathname, { scroll: false });
  }
  const change = (patch: SubscriberFilters) => setFilters({ ...filters, ...patch, page: 1 });
  const filtered = Object.keys(filters).some((k) => k !== "page" && k !== "sort");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SearchInput value={filters.q ?? ""} onChange={(v) => change({ q: v || undefined })} placeholder="Search by e-mail or name" label="Search subscribers" />
        <SelectFilter label="Status" value={filters.status ?? ""} onChange={(v) => change({ status: (v || undefined) as SubscriberFilters["status"] })}
          options={[{ label: "All", value: "" }, { label: "Subscribed", value: "ACTIVE" }, { label: "Unsubscribed", value: "UNSUBSCRIBED" }]} />
        <SelectFilter label="Interest" value={filters.interest ?? ""} onChange={(v) => change({ interest: (v || undefined) as OlympiadSubject | undefined })}
          options={[{ label: "All", value: "" }, ...SUBJECTS]} />
        <SelectFilter label="Kind" value={filters.kind ?? ""} onChange={(v) => change({ kind: (v || undefined) as SubscriberKind | undefined })}
          options={[{ label: "All", value: "" }, ...KINDS]} />
        <SelectFilter label="Source" value={filters.source ?? ""} onChange={(v) => change({ source: (v || undefined) as SubscriberFilters["source"] })}
          options={[{ label: "All", value: "" }, { label: "Website", value: "WEBSITE" }, { label: "Added", value: "ADMIN" }, { label: "Imported", value: "IMPORT" }]} />
        <SelectFilter label="Country" value={filters.country ?? ""} onChange={(v) => change({ country: v || undefined })}
          options={[{ label: "All", value: "" }, ...COUNTRIES]} />
        <SelectFilter label="Sort" value={filters.sort ?? "newest"} onChange={(v) => setFilters({ ...filters, sort: v as SubscriberFilters["sort"], page: 1 })}
          options={[{ label: "Newest first", value: "newest" }, { label: "Oldest first", value: "oldest" }, { label: "Name", value: "name" }, { label: "E-mail", value: "email" }]} />
        {filtered && (
          <button type="button" className={linkBtn} onClick={() => setFilters({})}>Clear filters</button>
        )}
      </div>
      <div className="flex flex-wrap items-start justify-end gap-2 mb-4">
        <button type="button" className={btnSecondary} onClick={() => setDialog({ kind: "import" })}><Upload className="h-3.5 w-3.5" aria-hidden="true" /> Import CSV</button>
        <CsvButton onDownload={() => subscribersApi.exportCsv(filters)} label="Export CSV" note={filtered ? "Exports the filtered list." : undefined} />
        <button type="button" className={btnPrimary} onClick={() => setDialog({ kind: "add" })}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add subscriber</button>
      </div>

      {list.isError ? (
        <ErrorState error={list.error} title="Couldn't load the subscribers" onRetry={() => list.refetch()} />
      ) : (
        <TableCard
          footer={list.data && (
            <div className="px-4 pb-4">
              <Pagination page={filters.page ?? 1} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={(page) => setFilters({ ...filters, page })} disabled={list.isFetching} />
            </div>
          )}
        >
          <thead>
            <tr className="border-b border-gray-100">
              <th className={th}>E-mail</th>
              <th className={th}>Name</th>
              <th className={th}>Kind</th>
              <th className={th}>Interests</th>
              <th className={th}>Country</th>
              <th className={th}>Source</th>
              <th className={th}>Status</th>
              <th className={th}>Since</th>
              <th className={th}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-gray-100/80 ${list.isFetching && list.data ? "opacity-60" : ""}`} data-testid="subscriber-rows">
            {list.isPending ? (
              <TableMessage colSpan={9}>Loading subscribers…</TableMessage>
            ) : list.data.data.length === 0 ? (
              <TableMessage colSpan={9}>{filtered ? "Nobody matches these filters." : "Nobody has subscribed yet. People subscribe on the home page, or add them here."}</TableMessage>
            ) : (
              list.data.data.map((s) => (
                <tr key={s.id} className="text-xs hover:bg-gray-50/60" data-testid="subscriber-row" data-email={s.email}>
                  <td className={`${td} font-semibold text-gray-800 break-all`}>{s.email}</td>
                  <td className={`${td} text-gray-700`}>{s.fullName ?? "—"}</td>
                  <td className={`${td} text-gray-600`}>{kindLabel(s.kind)}</td>
                  <td className={`${td} text-gray-600`}>{interestsLabel(s.interests)}</td>
                  <td className={`${td} text-gray-600`}>{s.country ? countryName(s.country) : "—"}</td>
                  <td className={`${td} text-gray-600 whitespace-nowrap`}>{SOURCE_LABEL[s.source]}</td>
                  <td className={td}>
                    <Badge className={s.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}>{STATUS_LABEL[s.status]}</Badge>
                    {s.status === "UNSUBSCRIBED" && (
                      <span className="block mt-1 text-[11px] text-gray-500" title={s.unsubscribeReason ?? undefined}>
                        {formatDate(s.unsubscribedAt)}{s.unsubscribeReason ? ` · ${s.unsubscribeReason.length > 40 ? `${s.unsubscribeReason.slice(0, 40)}…` : s.unsubscribeReason}` : ""}
                      </span>
                    )}
                  </td>
                  <td className={`${td} text-gray-600 whitespace-nowrap`} title={formatDateTime(s.subscribedAt)}>{formatDate(s.subscribedAt)}</td>
                  <td className={`${td} whitespace-nowrap space-x-3`}>
                    <button type="button" className={linkBtn} onClick={() => setDialog({ kind: "edit", s })} aria-label={`Edit ${s.email}`}>Edit</button>
                    {s.status === "ACTIVE" ? (
                      <button type="button" className={linkBtn} onClick={() => setDialog({ kind: "unsubscribe", s })} aria-label={`Unsubscribe ${s.email}`}>Unsubscribe</button>
                    ) : (
                      <button type="button" className={linkBtn} onClick={() => setDialog({ kind: "resubscribe", s })} aria-label={`Subscribe ${s.email} again`}>Subscribe again</button>
                    )}
                    <button type="button" className="text-red-600 hover:text-red-800 font-medium text-xs" onClick={() => setDialog({ kind: "erase", s })} aria-label={`Erase ${s.email}`}>Erase</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableCard>
      )}

      {(dialog?.kind === "add" || dialog?.kind === "edit") && (
        <SubscriberDialog
          subscriber={dialog.kind === "edit" ? dialog.s : null}
          onClose={() => setDialog(null)}
          onSaved={(text) => { setDialog(null); onNotice("success", text); }}
        />
      )}
      {dialog?.kind === "unsubscribe" && (
        <ConfirmDialog
          title="Unsubscribe this person?"
          body={<>{dialog.s.email} will receive no more mailings. Their row stays on the list as unsubscribed, so an import never adds them back.</>}
          confirmLabel="Unsubscribe"
          tone="danger"
          note={{ label: "Reason", required: false, min: 3, max: 500, placeholder: "For example: asked by phone" }}
          onConfirm={async (reason) => {
            await update.mutateAsync({ id: dialog.s.id, input: { status: "UNSUBSCRIBED", ...(reason && { reason }) } });
            onNotice("success", `${dialog.s.email} is unsubscribed.`);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "resubscribe" && (
        <ConfirmDialog
          title="Subscribe this person again?"
          body={<>{dialog.s.email} chose to unsubscribe{dialog.s.unsubscribedAt ? ` on ${formatDate(dialog.s.unsubscribedAt)}` : ""}. Subscribe them again only if they asked for it, and say how.</>}
          confirmLabel="Subscribe again"
          note={{ label: "Reason", required: true, min: 3, max: 500, placeholder: "For example: asked by e-mail on 3 May" }}
          onConfirm={async (reason) => {
            await update.mutateAsync({ id: dialog.s.id, input: { status: "ACTIVE", reason } });
            onNotice("success", `${dialog.s.email} is subscribed again.`);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "erase" && (
        <ConfirmDialog
          title="Erase this subscriber?"
          body={<>Everything stored about {dialog.s.email} is deleted and their e-mails not yet sent are withdrawn. Use this for a request to delete personal data. To only stop the e-mails, unsubscribe them instead.</>}
          confirmLabel="Erase"
          tone="danger"
          onConfirm={async () => {
            await erase.mutateAsync(dialog.s.id);
            onNotice("success", `${dialog.s.email} was erased.`);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "import" && <ImportDialog onClose={() => setDialog(null)} onDone={(text) => { setDialog(null); onNotice("success", text); }} />}
    </div>
  );
}

function SubscriberDialog({ subscriber, onClose, onSaved }: { subscriber: Subscriber | null; onClose: () => void; onSaved: (text: string) => void }) {
  const [email, setEmail] = useState(subscriber?.email ?? "");
  const [fullName, setFullName] = useState(subscriber?.fullName ?? "");
  const [kind, setKind] = useState<SubscriberKind | "">(subscriber?.kind ?? "");
  const [interests, setInterests] = useState<OlympiadSubject[]>(subscriber?.interests ?? []);
  const [country, setCountry] = useState(subscriber?.country ?? "");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateSubscriber();
  const update = useUpdateSubscriber();
  const busy = create.isPending || update.isPending;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const name = fullName.trim();
    if (!subscriber && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError("Enter a valid e-mail address, for example name@example.com.");
    if (name && (name.length < 2 || name.length > 100)) return setError("The name must be 2 to 100 characters, or leave it empty.");
    setError(null);
    try {
      if (subscriber) {
        const input: SubscriberInput = { fullName: name || null, kind: kind || null, interests, country: country || null };
        await update.mutateAsync({ id: subscriber.id, input });
        onSaved(`${subscriber.email} was saved.`);
      } else {
        const created = await create.mutateAsync({ email: email.trim(), ...(name && { fullName: name }), ...(kind && { kind }), interests, ...(country && { country }) });
        onSaved(`${created.email} was added to the list. They receive the next mailing.`);
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title={subscriber ? `Edit ${subscriber.email}` : "Add a subscriber"} onClose={busy ? () => undefined : onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        {!subscriber && (
          <p className="text-xs text-gray-600">Add only people who asked to receive ROF news. They get no welcome e-mail; every mailing has an unsubscribe link.</p>
        )}
        {!subscriber && (
          <div>
            <label htmlFor="sub-email" className={labelCls}>E-mail address <span className="text-amber-600">*</span></label>
            <input id="sub-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} className={inputCls} required />
          </div>
        )}
        <div>
          <label htmlFor="sub-name" className={labelCls}>Name <span className="font-normal text-gray-500">(optional)</span></label>
          <input id="sub-name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="sub-kind" className={labelCls}>Kind</label>
            <select id="sub-kind" value={kind} onChange={(e) => setKind(e.target.value as SubscriberKind | "")} className={inputCls}>
              <option value="">Not given</option>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="sub-country" className={labelCls}>Country</label>
            <select id="sub-country" value={country} onChange={(e) => setCountry(e.target.value)} className={inputCls}>
              <option value="">Not given</option>
              {COUNTRIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>
        <fieldset>
          <legend className={labelCls}>Interests <span className="font-normal text-gray-500">(none = all subjects)</span></legend>
          <div className="flex flex-wrap gap-4">
            {SUBJECTS.map((s) => (
              <label key={s.value} className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" className="accent-brand" checked={interests.includes(s.value)}
                  onChange={() => setInterests((xs) => (xs.includes(s.value) ? xs.filter((x) => x !== s.value) : [...xs, s.value]))} />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="px-5 py-2 text-sm text-gray-600 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={busy} className={btnPrimary}>{busy ? "Saving…" : subscriber ? "Save" : "Add"}</button>
        </div>
      </form>
    </Modal>
  );
}

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: (text: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useImportSubscribers();

  async function go(dryRun: boolean) {
    if (!file) return setError("Choose a CSV file first.");
    setError(null);
    try {
      const r = await run.mutateAsync({ file, dryRun });
      if (dryRun) setCheck(r);
      else onDone(`${r.added ?? 0} subscriber(s) added. ${r.alreadyListed} already on the list, ${r.unsubscribed} unsubscribed earlier (not added), ${r.invalid} row(s) with a problem.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title="Import subscribers from a CSV file" onClose={run.isPending ? () => undefined : onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          The first row names the columns: <strong>email</strong> (required), and optionally <strong>name</strong>, <strong>kind</strong> (Parent,
          Student, Teacher, School, Other), <strong>interests</strong> (Mathematics; Physics; Computing) and <strong>country</strong> (a two-letter code
          such as RW). At most 5,000 rows. People already on the list are left as they are; people who unsubscribed are never added again.
        </p>
        <div>
          <label htmlFor="sub-import-file" className={labelCls}>CSV file</label>
          <input id="sub-import-file" type="file" accept=".csv,text/csv" className="block text-sm"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setCheck(null); setError(null); }} />
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        {check && (
          <div className="space-y-2" data-testid="import-check">
            <Notice tone={check.invalid ? "info" : "success"}>
              {check.rows} row(s): {check.wouldAdd ?? 0} will be added, {check.alreadyListed} already on the list, {check.unsubscribed} unsubscribed earlier (not added), {check.invalid} with a problem.
            </Notice>
            {check.problems.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-100">
                <table className="w-full text-xs">
                  <thead><tr className="bg-gray-50"><th className="text-left px-3 py-2">Line</th><th className="text-left px-3 py-2">E-mail</th><th className="text-left px-3 py-2">Problem</th></tr></thead>
                  <tbody>
                    {check.problems.map((p) => (
                      <tr key={`${p.line}-${p.email}`} className="border-t border-gray-100"><td className="px-3 py-1.5">{p.line}</td><td className="px-3 py-1.5 break-all">{p.email || "—"}</td><td className="px-3 py-1.5">{p.problem}</td></tr>
                    ))}
                  </tbody>
                </table>
                {check.problemsTruncated && <p className="px-3 py-2 text-xs text-gray-500">Only the first 500 problems are shown.</p>}
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={run.isPending} className="px-5 py-2 text-sm text-gray-600 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => go(true)} disabled={run.isPending || !file} className={btnSecondary}>Check the file</button>
          <button type="button" onClick={() => go(false)} disabled={run.isPending || !check || !check.wouldAdd} className={btnPrimary}
            title={!check ? "Check the file first" : undefined}>
            {run.isPending ? "Working…" : `Add ${check?.wouldAdd ?? 0} subscriber(s)`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
