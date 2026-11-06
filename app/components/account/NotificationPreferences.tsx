"use client";

/**
 * Notification preferences, exactly as the backend supports them:
 * - every role: e-mail on/off per category (`GET/PUT /me/notification-preferences`;
 *   account e-mails cannot be turned off);
 * - mentors and admins: in-app and e-mail switch per notification type
 *   (`GET/PATCH /me/notification-settings`, `POST …/reset`). Students have no
 *   per-type switches in the backend.
 * Changes are saved explicitly; only changed values are sent.
 */
import { useState } from "react";
import { BellRing, Mail } from "lucide-react";
import type { NotificationCategory, NotificationSetting, Role } from "@/lib/api/types";
import {
  useNotificationPreferences,
  useNotificationSettingActions,
  useNotificationSettings,
  useUpdateNotificationPreferences,
} from "@/lib/queries/community";
import { errorMessage } from "@/lib/api/errors";
import { Alert, ErrorState, Spinner } from "@/app/components/ui/feedback";
import { Button } from "@/app/components/ui/form";
import { CATEGORY_META } from "@/app/components/notifications/notificationUi";
import { Section } from "./Section";

const CATEGORY_HINT: Record<NotificationCategory, string> = {
  ASSIGNMENTS: "New, published or returned assignments",
  SUBMISSIONS: "Your submissions and resubmission requests",
  REVIEWS: "Reviews assigned, returned or awaiting approval",
  RESULTS: "Published results",
  RESOURCES: "New course materials",
  ACCOUNT: "Activation, password and account security",
  DISCUSSIONS: "Moderation of your posts",
};

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${checked ? "bg-indigo-600" : "bg-gray-300"}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

export default function NotificationPreferences({ role }: { role: Role }) {
  return (
    <>
      <EmailPreferences />
      {role !== "STUDENT" && <TypeSettings />}
    </>
  );
}

// ─── E-mail per category ────────────────────────────────────────────────────

function EmailPreferences() {
  const prefs = useNotificationPreferences();
  const save = useUpdateNotificationPreferences();
  const [draft, setDraft] = useState<Partial<Record<NotificationCategory, boolean>>>({});
  const [saved, setSaved] = useState(false);

  const rows = prefs.data ?? [];
  const value = (c: NotificationCategory, server: boolean) => draft[c] ?? server;
  const changes = rows.filter((p) => !p.locked && draft[p.category] !== undefined && draft[p.category] !== p.emailEnabled);

  function onSave() {
    setSaved(false);
    if (changes.length === 0) return;
    save.mutate(
      changes.map((p) => ({ category: p.category, emailEnabled: draft[p.category]! })),
      {
        onSuccess: () => {
          setDraft({});
          setSaved(true);
        },
      },
    );
  }

  return (
    <Section title="E-mail notifications" icon={<Mail className="w-5 h-5" />} description="Choose which kinds of updates are also sent to your e-mail. In-app notifications are not affected.">
      {prefs.isPending ? (
        <Spinner />
      ) : prefs.isError ? (
        <ErrorState error={prefs.error} title="Couldn't load your e-mail preferences" onRetry={() => prefs.refetch()} />
      ) : (
        <div className="space-y-4">
          {saved && <Alert tone="success">E-mail preferences saved.</Alert>}
          {save.isError && <Alert tone="error">{errorMessage(save.error)}</Alert>}
          <ul className="divide-y divide-gray-100" data-testid="email-preferences">
            {rows.map((p) => (
              <li key={p.category} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{CATEGORY_META[p.category]?.label ?? p.category}</p>
                  <p className="text-xs text-gray-500">
                    {CATEGORY_HINT[p.category]}
                    {p.locked && " · always sent"}
                  </p>
                </div>
                <Switch
                  checked={value(p.category, p.emailEnabled)}
                  onChange={(v) => {
                    setSaved(false);
                    setDraft((d) => ({ ...d, [p.category]: v }));
                  }}
                  disabled={p.locked || save.isPending}
                  label={`E-mail for ${CATEGORY_META[p.category]?.label ?? p.category}`}
                />
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-3">
            {changes.length > 0 && (
              <Button type="button" variant="secondary" onClick={() => setDraft({})} disabled={save.isPending}>
                Discard
              </Button>
            )}
            <Button type="button" onClick={onSave} loading={save.isPending} disabled={changes.length === 0}>
              Save e-mail preferences
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}

// ─── Per type (mentors, admins) ─────────────────────────────────────────────

type Draft = Record<string, { inAppEnabled?: boolean; emailEnabled?: boolean }>;

function TypeSettings() {
  const settings = useNotificationSettings(true);
  const { update, reset } = useNotificationSettingActions();
  const [draft, setDraft] = useState<Draft>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const rows = settings.data ?? [];
  const cur = (s: NotificationSetting) => ({
    inAppEnabled: draft[s.type]?.inAppEnabled ?? s.inAppEnabled,
    emailEnabled: draft[s.type]?.emailEnabled ?? s.emailEnabled,
  });
  const changes = rows
    .map((s) => {
      const c: { type: string; inAppEnabled?: boolean; emailEnabled?: boolean } = { type: s.type };
      const d = draft[s.type];
      if (d?.inAppEnabled !== undefined && d.inAppEnabled !== s.inAppEnabled) c.inAppEnabled = d.inAppEnabled;
      if (s.emailAvailable && d?.emailEnabled !== undefined && d.emailEnabled !== s.emailEnabled) c.emailEnabled = d.emailEnabled;
      return c;
    })
    .filter((c) => c.inAppEnabled !== undefined || c.emailEnabled !== undefined);
  const allDefault = rows.every((s) => s.inAppEnabled && (!s.emailAvailable || s.emailEnabled));
  const busy = update.isPending || reset.isPending;

  const set = (type: string, key: "inAppEnabled" | "emailEnabled", v: boolean) => {
    setNotice(null);
    setDraft((d) => ({ ...d, [type]: { ...d[type], [key]: v } }));
  };

  return (
    <Section
      title="Notifications I receive"
      icon={<BellRing className="w-5 h-5" />}
      description="Turn individual notifications on or off, in the app and by e-mail. Everything is on by default."
    >
      {settings.isPending ? (
        <Spinner />
      ) : settings.isError ? (
        <ErrorState error={settings.error} title="Couldn't load your notification settings" onRetry={() => settings.refetch()} />
      ) : (
        <div className="space-y-4">
          {notice && <Alert tone="success">{notice}</Alert>}
          {(update.isError || reset.isError) && <Alert tone="error">{errorMessage(update.error ?? reset.error)}</Alert>}
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm" data-testid="notification-settings">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  <th className="px-1 pb-2">Notification</th>
                  <th className="px-2 pb-2 text-center w-16">In app</th>
                  <th className="px-2 pb-2 text-center w-16">E-mail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((s) => {
                  const c = cur(s);
                  return (
                    <tr key={s.type} data-type={s.type}>
                      <td className="px-1 py-3 pr-3">
                        <p className="font-semibold text-gray-800">{s.label}</p>
                        <p className="text-xs text-gray-500">{s.description}</p>
                        {s.emailAvailable && !s.categoryEmailEnabled && (
                          <p className="text-xs text-amber-700 mt-0.5">E-mail for {CATEGORY_META[s.category]?.label.toLowerCase() ?? s.category} is off in your e-mail notifications above.</p>
                        )}
                      </td>
                      <td className="px-2 py-3 text-center">
                        <Switch checked={c.inAppEnabled} onChange={(v) => set(s.type, "inAppEnabled", v)} disabled={busy} label={`In-app: ${s.label}`} />
                      </td>
                      <td className="px-2 py-3 text-center">
                        {s.emailAvailable ? (
                          <Switch checked={c.emailEnabled} onChange={(v) => set(s.type, "emailEnabled", v)} disabled={busy} label={`E-mail: ${s.label}`} />
                        ) : (
                          <span className="text-xs text-gray-400" title="This notification is only shown in the app.">
                            App only
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            {confirmReset ? (
              <>
                <span className="text-sm text-gray-600 mr-auto self-center">Turn every notification back on?</span>
                <Button type="button" variant="secondary" onClick={() => setConfirmReset(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  loading={reset.isPending}
                  onClick={() =>
                    reset.mutate(undefined, {
                      onSuccess: () => {
                        setDraft({});
                        setConfirmReset(false);
                        setNotice("All notifications are back on.");
                      },
                    })
                  }
                >
                  Reset to defaults
                </Button>
              </>
            ) : (
              <>
                {!allDefault && (
                  <Button type="button" variant="secondary" onClick={() => setConfirmReset(true)} disabled={busy} className="mr-auto">
                    Reset to defaults
                  </Button>
                )}
                {changes.length > 0 && (
                  <Button type="button" variant="secondary" onClick={() => setDraft({})} disabled={busy}>
                    Discard
                  </Button>
                )}
                <Button
                  type="button"
                  loading={update.isPending}
                  disabled={changes.length === 0}
                  onClick={() =>
                    update.mutate(changes, {
                      onSuccess: () => {
                        setDraft({});
                        setNotice("Notification settings saved.");
                      },
                    })
                  }
                >
                  Save notification settings
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}
