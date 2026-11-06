"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { RefreshCw } from "lucide-react";
import { errorMessage } from "@/lib/api/errors";
import type { PlatformSetting, SettingValue } from "@/lib/api/types";
import { usePlatformSettings, useRecomputeLeaderboard, useUpdateSettings } from "@/lib/queries/admin";
import { formatDateTime, personName } from "@/lib/format";
import { Alert, ErrorState, LoadingBlock, Spinner } from "@/app/components/ui/feedback";
import { AdminPage, Card, ConfirmDialog, btnPrimary, btnSecondary } from "../components/adminUi";

const CATEGORY: Record<PlatformSetting["category"], { title: string; description: string }> = {
  REGISTRATION: { title: "Registration", description: "How students and coaches join the platform." },
  ASSIGNMENTS: { title: "Assignments and reviews", description: "Defaults for new assignments, resubmissions and distribution." },
  NOTIFICATIONS: { title: "Notifications", description: "E-mail delivery and what students can see." },
  PLATFORM: { title: "Platform", description: "Name and contact address of the platform." },
  SUPPORT: { title: "Help and support", description: "Shown to everyone on the help page and the sign-in page." },
};
const ORDER: PlatformSetting["category"][] = ["REGISTRATION", "ASSIGNMENTS", "NOTIFICATIONS", "PLATFORM", "SUPPORT"];

/** "submissions.resubmissionRequestDays" → "Resubmission request days". */
function labelOf(key: string) {
  const last = key.split(".").pop() ?? key;
  const words = last.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words[0].toUpperCase() + words.slice(1);
}

function validate(s: PlatformSetting, v: SettingValue): string | null {
  if (s.type === "boolean") return null;
  if (v === null || v === "") return s.nullable ? null : "A value is required.";
  if (s.type === "integer") {
    const n = Number(v);
    if (!Number.isInteger(n)) return "Enter a whole number.";
    if (s.min !== undefined && n < s.min) return `At least ${s.min}.`;
    if (s.max !== undefined && n > s.max) return `At most ${s.max}.`;
    return null;
  }
  const str = String(v);
  if (s.maxLength && str.length > s.maxLength) return `At most ${s.maxLength} characters.`;
  if (s.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) return "Enter a valid e-mail address.";
  if (s.type === "url" && !/^https?:\/\/\S+$/i.test(str)) return "Enter a full address starting with https://";
  if (s.type === "enum" && s.options && !s.options.includes(str)) return "Choose one of the options.";
  return null;
}

function Control({ s, value, onChange, error }: { s: PlatformSetting; value: SettingValue; onChange: (v: SettingValue) => void; error?: string | null }) {
  const id = `setting-${s.key}`;
  const cls = `w-full sm:w-72 px-3 py-2 bg-white border rounded-lg text-sm ${error ? "border-red-400" : "border-gray-200"} focus:outline-none focus:ring-2 focus:ring-indigo-500/20`;
  if (s.type === "boolean")
    return (
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={value === true}
        aria-label={labelOf(s.key)}
        onClick={() => onChange(!(value === true))}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${value === true ? "bg-indigo-600" : "bg-gray-300"}`}
      >
        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition ${value === true ? "translate-x-4" : "translate-x-0"}`} />
      </button>
    );
  if (s.type === "enum")
    return (
      <select id={id} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={cls}>
        {(s.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o.replace(/_/g, " ").toLowerCase()}
          </option>
        ))}
      </select>
    );
  if (s.type === "integer")
    return (
      <span className="inline-flex items-center gap-2">
        <input id={id} type="number" min={s.min} max={s.max} step={1} value={value === null ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} className={`${cls} sm:w-28`} />
        {s.unit && <span className="text-xs text-gray-500">{s.unit}</span>}
      </span>
    );
  return (
    <input
      id={id}
      type={s.type === "email" ? "email" : s.type === "url" ? "url" : "text"}
      value={value === null ? "" : String(value)}
      maxLength={s.maxLength}
      onChange={(e) => onChange(e.target.value === "" && s.nullable ? null : e.target.value)}
      className={cls}
    />
  );
}

function SettingsForm({ settings }: { settings: PlatformSetting[] }) {
  const update = useUpdateSettings();
  const recompute = useRecomputeLeaderboard();
  const [values, setValues] = useState<Record<string, SettingValue>>(() => Object.fromEntries(settings.map((s) => [s.key, s.value])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [confirmRecompute, setConfirmRecompute] = useState(false);
  const changed = settings.filter((s) => values[s.key] !== s.value);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    const errs: Record<string, string> = {};
    for (const s of changed) {
      const err = validate(s, values[s.key]);
      if (err) errs[s.key] = err;
    }
    setErrors(errs);
    if (Object.keys(errs).length) return setMessage({ tone: "error", text: "Please correct the highlighted settings." });
    if (!changed.length) return setMessage({ tone: "info", text: "Nothing has changed." });
    try {
      await update.mutateAsync(Object.fromEntries(changed.map((s) => [s.key, values[s.key]])));
      setMessage({ tone: "success", text: `${changed.length} setting${changed.length === 1 ? "" : "s"} saved.` });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  }

  return (
    <form onSubmit={save} className="space-y-6" noValidate>
      {ORDER.filter((c) => settings.some((s) => s.category === c)).map((c) => (
        <Card key={c} className="p-6">
          <h2 className="text-base font-bold text-gray-900">{CATEGORY[c].title}</h2>
          <p className="text-xs text-gray-500 mb-4">{CATEGORY[c].description}</p>
          <div className="divide-y divide-gray-100">
            {settings
              .filter((s) => s.category === c)
              .map((s) => (
                <div key={s.key} className="py-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <label htmlFor={`setting-${s.key}`} className="text-sm font-semibold text-gray-800">
                      {labelOf(s.key)}
                    </label>
                    <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Default: {s.default === null || s.default === "" ? "none" : String(s.default)}
                      {s.updatedAt && ` · changed ${formatDateTime(s.updatedAt)} by ${personName(s.updatedBy, "—")}`}
                    </p>
                    {errors[s.key] && <p className="text-[11px] text-red-600 mt-1">{errors[s.key]}</p>}
                  </div>
                  <div className="shrink-0 flex items-center gap-3">
                    <Control s={s} value={values[s.key]} onChange={(v) => setValues((x) => ({ ...x, [s.key]: v }))} error={errors[s.key]} />
                    {values[s.key] !== s.default && (
                      <button type="button" onClick={() => setValues((x) => ({ ...x, [s.key]: s.default }))} className="text-[11px] text-indigo-600 hover:text-indigo-800 whitespace-nowrap">
                        Use default
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </Card>
      ))}

      <div className="sticky bottom-4 z-10">
        <div className="bg-white/95 backdrop-blur border border-gray-200 rounded-2xl shadow-lg px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 text-xs text-gray-600">{message ? <Alert tone={message.tone}>{message.text}</Alert> : changed.length ? `${changed.length} unsaved change${changed.length === 1 ? "" : "s"}` : "All settings are saved. Every change is recorded in the audit log."}</div>
          <div className="flex gap-2">
            <button type="button" disabled={!changed.length || update.isPending} onClick={() => setValues(Object.fromEntries(settings.map((s) => [s.key, s.value])))} className={btnSecondary}>
              Discard
            </button>
            <button type="submit" disabled={update.isPending} className={btnPrimary}>
              {update.isPending && <Spinner className="h-3.5 w-3.5 !text-white" />}
              Save settings
            </button>
          </div>
        </div>
      </div>

      <Card className="p-6">
        <h2 className="text-base font-bold text-gray-900">Maintenance</h2>
        <p className="text-xs text-gray-500 mb-4">Recalculate every student&apos;s points from their published results. Use it if the leaderboard looks wrong.</p>
        <button type="button" onClick={() => setConfirmRecompute(true)} className={btnSecondary}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Recompute leaderboard
        </button>
      </Card>
      {confirmRecompute && (
        <ConfirmDialog
          title="Recompute the leaderboard?"
          body="Points are recalculated from published results for every student. Rankings may change."
          confirmLabel="Recompute"
          onClose={() => setConfirmRecompute(false)}
          onConfirm={async () => {
            const r = await recompute.mutateAsync();
            setMessage({ tone: "success", text: `Points recomputed for ${r.recomputed} student${r.recomputed === 1 ? "" : "s"}.` });
          }}
        />
      )}
    </form>
  );
}

/** Platform settings (`GET`/`PATCH /admin/settings`), generated from the backend registry. */
export default function SettingsPage() {
  const settings = usePlatformSettings();
  return (
    <AdminPage
      title="Settings"
      description={
        <>
          Platform-wide settings. Your own profile, password and notification preferences are under{" "}
          <Link href="/admin/profile" className="font-semibold text-indigo-600 hover:text-indigo-800">
            My profile
          </Link>
          .
        </>
      }
    >
      {settings.isPending ? (
        <LoadingBlock />
      ) : settings.isError ? (
        <ErrorState error={settings.error} title="Couldn't load settings" onRetry={() => settings.refetch()} />
      ) : (
        <SettingsForm settings={settings.data} />
      )}
    </AdminPage>
  );
}
