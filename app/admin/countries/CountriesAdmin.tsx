"use client";

/**
 * Countries (`/admin/countries`, capability `countries`, permission reference.manage; owner decision 2026-11-19).
 * Every ISO 3166-1 alpha-2 country with its calling code and number of schools; an Administrator corrects a name or a
 * calling code (audited). There is deliberately no on / off switch: ROF is a global Olympiad platform and no country is
 * ever blocked; a country never sets a student's level or division. Rules: lib/countries/reference.ts.
 */
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminCountriesApi, type AdminCountry } from "@/lib/api/countries";
import { errorMessage } from "@/lib/api/errors";
import { useSession } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query/keys";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { countriesPageMode, countryChange, countryEditProblems, filterCountries } from "@/lib/countries/reference";
import { formatDateTime } from "@/lib/format";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { AdminPage, Modal, Notice, SearchInput, TableCard, TableMessage, btnPrimary, btnSecondary, linkBtn, td, th } from "../components/adminUi";

const inputCls =
  "w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500";
const labelCls = "block text-sm font-semibold text-slate-700 mb-1";

export default function CountriesAdmin() {
  const { permissionsStatus, can, retry: retrySession } = useSession();
  const caps = useBackendCapabilities();
  const mode = countriesPageMode({ detection: caps.detection, detectionLoading: caps.loading, permissionsStatus, can });
  const visible = mode === "visible";
  const list = useQuery({ queryKey: queryKeys.countries.admin(), queryFn: () => adminCountriesApi.list(), enabled: visible });
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<AdminCountry | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!visible) {
    return (
      <AdminPage title="Countries">
        {mode === "loading" && <LoadingBlock />}
        {mode === "error" && <ErrorState error={null} title="Couldn't load your permissions" onRetry={retrySession} />}
        {mode === "unsupported" && <Notice tone="info">This server does not provide the country list yet.</Notice>}
        {mode === "forbidden" && <Notice tone="info">Countries need the reference.manage permission.</Notice>}
      </AdminPage>
    );
  }

  const rows = list.data ? filterCountries(list.data, q) : [];
  return (
    <AdminPage
      title="Countries"
      description="Every country students, teachers, coaches and schools can come from. Correct a name or calling code here; every change is recorded in the audit log. No country is ever blocked."
    >
      {notice && (
        <Notice tone="success" onClose={() => setNotice(null)}>
          {notice}
        </Notice>
      )}
      {list.isPending ? (
        <LoadingBlock />
      ) : list.isError ? (
        <ErrorState error={list.error} title="Couldn't load the countries" onRetry={() => list.refetch()} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <SearchInput value={q} onChange={setQ} placeholder="Search by name or code" label="Search countries" delay={150} />
            <p className="text-xs text-gray-600">{rows.length} of {list.data.length} countries</p>
          </div>
          <TableCard>
            <thead>
              <tr className="border-b border-gray-100">
                <th className={th}>Country</th>
                <th className={th}>Code</th>
                <th className={th}>Calling code</th>
                <th className={th}>Schools</th>
                <th className={th}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/80" data-testid="admin-countries">
              {rows.length === 0 ? (
                <TableMessage colSpan={5}>No country matches.</TableMessage>
              ) : (
                rows.map((c) => (
                  <tr key={c.code} className="text-xs hover:bg-gray-50/60" data-testid={`country-${c.code}`}>
                    <td className={`${td} font-semibold text-gray-800`}>{c.name}</td>
                    <td className={`${td} font-mono text-gray-600`}>{c.code}</td>
                    <td className={`${td} text-gray-600`}>{c.phonePrefix ?? "—"}</td>
                    <td className={`${td} text-gray-600`}>{c._count.schools}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      <button type="button" className={linkBtn} onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </TableCard>
        </>
      )}
      {editing && (
        <CountryDialog
          country={editing}
          onClose={() => setEditing(null)}
          onSaved={async (name) => {
            setEditing(null);
            setNotice(`${name} was saved.`);
            await qc.invalidateQueries({ queryKey: queryKeys.countries.all });
          }}
        />
      )}
    </AdminPage>
  );
}

function CountryDialog({ country, onClose, onSaved }: { country: AdminCountry; onClose: () => void; onSaved: (name: string) => void }) {
  const [d, setD] = useState({ name: country.name, phonePrefix: country.phonePrefix ?? "" });
  const [errors, setErrors] = useState<Partial<Record<"name" | "phonePrefix", string>>>({});
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: ReturnType<typeof countryChange>) => adminCountriesApi.update(country.code, body),
    onSuccess: (c) => onSaved(c.name),
    onError: (e) => setError(errorMessage(e)),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const p = countryEditProblems(d);
    setErrors(p);
    if (Object.keys(p).length) return;
    const body = countryChange(country, d);
    if (Object.keys(body).length === 0) return onClose();
    setError(null);
    save.mutate(body);
  }

  return (
    <Modal title={`Edit ${country.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Notice tone="error">{error}</Notice>}
        <div>
          <label htmlFor="country-name" className={labelCls}>Name</label>
          <input id="country-name" className={inputCls} value={d.name} maxLength={100} onChange={(e) => setD((s) => ({ ...s, name: e.target.value }))} aria-invalid={!!errors.name} />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
        </div>
        <div>
          <label htmlFor="country-prefix" className={labelCls}>Calling code</label>
          <input id="country-prefix" className={inputCls} value={d.phonePrefix} placeholder="+254" maxLength={5} onChange={(e) => setD((s) => ({ ...s, phonePrefix: e.target.value }))} aria-invalid={!!errors.phonePrefix} />
          {errors.phonePrefix ? (
            <p className="mt-1 text-xs text-red-600">{errors.phonePrefix}</p>
          ) : (
            <p className="mt-1 text-xs text-gray-600">Leave empty for a territory without one. Code {country.code}; last changed {formatDateTime(country.updatedAt)}.</p>
          )}
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnPrimary} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}
