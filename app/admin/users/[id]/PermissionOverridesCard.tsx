"use client";

/**
 * A user's permissions (Super Administrators). Effective permissions
 * (`GET /admin/users/:id/permissions`) need permissions.view; listing, adding
 * and revoking individual overrides (`/admin/users/:id/permission-overrides`)
 * need permissions.manageOverrides, which only a Super Administrator holds.
 * The form offers only what the catalogue's override policy allows for the
 * user's role; the backend still checks every request (and refuses overrides
 * on your own account and on Super Administrators).
 */
import { useState, type FormEvent } from "react";
import {
  OVERRIDE_RULES,
  buildOverridePayload,
  grantNeedsCourseDivision,
  overrideErrorMessage,
  overrideOptions,
  overrideState,
  overrideTargetRefusal,
  type OverrideEffect,
  type OverrideForm,
  type OverrideState,
} from "@/lib/admin-ops/overrides";
import { errorMessage } from "@/lib/api/errors";
import type { Role } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { useEffectivePermissions, useOverrideMutations, useOverrides, usePermissionCatalogue } from "@/lib/queries/admin-ops";
import { useAdminDivisions } from "@/lib/queries/admin";
import { useCourses } from "@/lib/queries/learning";
import { formatDate, formatDateTime } from "@/lib/format";
import { Alert, LoadingBlock } from "@/app/components/ui/feedback";
import { Badge, Card, ConfirmDialog, btnPrimary, linkBtn } from "../../components/adminUi";
import { SelectInput, TextInput } from "../components/userUi";

const STATE_BADGE: Record<OverrideState, { label: string; badge: string }> = {
  ACTIVE: { label: "Active", badge: "bg-emerald-50 text-emerald-700" },
  EXPIRED: { label: "Expired", badge: "bg-gray-100 text-gray-600" },
  REVOKED: { label: "Revoked", badge: "bg-slate-100 text-slate-600" },
};

const EMPTY: OverrideForm = { effect: "DENY", permission: "", reason: "", expiresOn: "", courseId: "", divisionId: "" };

const message = (e: unknown) => overrideErrorMessage(e) ?? errorMessage(e);

export default function PermissionOverridesCard({ user }: { user: { id: string; role: Role; firstName: string; lastName: string } }) {
  const { user: me, can } = useSession();
  const canView = can("permissions.view");
  const canManage = can("permissions.manageOverrides");
  const effective = useEffectivePermissions(user.id, canView);
  const overrides = useOverrides(user.id, canManage);
  const catalogue = usePermissionCatalogue(canView && canManage);
  const { create, revoke } = useOverrideMutations(user.id);
  const courses = useCourses();
  const divisions = useAdminDivisions();
  const [form, setForm] = useState<OverrideForm>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [revoking, setRevoking] = useState<{ id: string; permission: string } | null>(null);

  const refusal = overrideTargetRefusal(user, me?.id);
  const options = catalogue.data ? overrideOptions(catalogue.data, user.role, form.effect) : [];
  const needsScope = grantNeedsCourseDivision(form.effect, form.permission);
  const courseName = new Map((courses.data ?? []).map((c) => [c.id, c.title]));
  const divisionName = new Map((divisions.data ?? []).map((d) => [d.id, d.name]));
  const scopeText = (courseId: string | null, divisionId: string | null) =>
    courseId ? `${courseName.get(courseId) ?? courseId.slice(0, 8)} × ${divisionId ? (divisionName.get(divisionId) ?? divisionId.slice(0, 8)) : "?"}` : null;

  function onCreate(e: FormEvent) {
    e.preventDefault();
    setNotice(null);
    const built = buildOverridePayload(form);
    if (!built.ok) return setFormError(built.error);
    setFormError(null);
    create.mutate(built.payload, {
      onSuccess: (o) => {
        setForm(EMPTY);
        setNotice({ tone: "success", text: `${o.effect === "DENY" ? "Denied" : "Granted"} ${o.permission}. It applies on the user's next request.` });
      },
      onError: (err) => setFormError(message(err)),
    });
  }

  return (
    <Card className="p-6 lg:col-span-3">
      <div data-testid="permission-overrides">
        <h2 className="text-base font-bold text-gray-900 mb-1">Permissions</h2>
        <p className="text-xs text-gray-600 mb-4">
          What this account can do: the defaults of its role, changed by individual overrides. {canManage ? "Overrides apply on the user's next request and are kept in the audit log." : "Only a Super Administrator can change overrides."}
        </p>
        {notice && (
          <div className="mb-3">
            <Alert tone={notice.tone}>{notice.text}</Alert>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {canView && (
            <section aria-labelledby="p-effective">
              <h3 id="p-effective" className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">
                Effective permissions
              </h3>
              {effective.isPending ? (
                <LoadingBlock />
              ) : effective.isError ? (
                <Alert tone="error">{errorMessage(effective.error)}</Alert>
              ) : effective.data.permissions.length === 0 ? (
                <p className="text-xs text-gray-500">None.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5" data-testid="effective-permissions">
                  {effective.data.permissions.map((p) => (
                    <li key={p.permission} data-permission={p.permission} className="inline-flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-full px-2.5 py-0.5 text-[11px] text-gray-700">
                      {p.permission}
                      {p.scope !== "global" && <span className="text-gray-500">· {p.scope}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {canManage && (
            <section aria-labelledby="p-overrides">
              <h3 id="p-overrides" className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">
                Overrides
              </h3>
              {overrides.isPending ? (
                <LoadingBlock />
              ) : overrides.isError ? (
                <Alert tone="error">{message(overrides.error)}</Alert>
              ) : (
                <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg mb-4" data-testid="override-list">
                  {overrides.data.length === 0 ? (
                    <li className="px-3 py-2 text-xs text-gray-500">No overrides: the role&apos;s defaults apply.</li>
                  ) : (
                    overrides.data.map((o) => {
                      const state = overrideState(o);
                      const scope = scopeText(o.courseId, o.divisionId);
                      return (
                        <li key={o.id} className="px-3 py-2 flex items-start justify-between gap-2 text-sm" data-testid="override-row" data-state={state} data-permission={o.permission} data-effect={o.effect}>
                          <span className="min-w-0">
                            <span className="inline-flex flex-wrap items-center gap-1.5">
                              <Badge className={o.effect === "DENY" ? "bg-red-50 text-red-600" : "bg-indigo-50 text-indigo-700"}>{o.effect}</Badge>
                              <span className="font-medium">{o.permission}</span>
                              <Badge className={STATE_BADGE[state].badge}>{STATE_BADGE[state].label}</Badge>
                            </span>
                            <span className="block text-xs text-gray-600 mt-0.5 break-words">{o.reason}</span>
                            <span className="block text-[11px] text-gray-500">
                              {scope ? `${scope} · ` : ""}
                              {o.expiresAt ? `${state === "EXPIRED" ? "expired" : "until"} ${formatDate(o.expiresAt)}` : "no end date"} · added {formatDateTime(o.createdAt)}
                              {o.createdBy ? ` by @${o.createdBy.username}` : ""}
                              {o.revokedAt ? ` · revoked ${formatDateTime(o.revokedAt)}${o.revokedBy ? ` by @${o.revokedBy.username}` : ""}` : ""}
                            </span>
                          </span>
                          {state === "ACTIVE" && (
                            <button type="button" className={linkBtn} onClick={() => setRevoking({ id: o.id, permission: o.permission })}>
                              Revoke
                            </button>
                          )}
                        </li>
                      );
                    })
                  )}
                </ul>
              )}

              {refusal ? (
                <p className="text-xs text-gray-600" data-testid="override-refusal">
                  {refusal}
                </p>
              ) : catalogue.isError ? (
                <Alert tone="error">{errorMessage(catalogue.error, "Couldn't load the permission catalogue.")}</Alert>
              ) : (
                <form onSubmit={onCreate} noValidate className="space-y-3" data-testid="create-override">
                  <SelectInput
                    label="Effect"
                    value={form.effect}
                    onChange={(v) => setForm((f) => ({ ...f, effect: v as OverrideEffect, permission: "", courseId: "", divisionId: "" }))}
                    options={[
                      { label: "Deny — remove a default permission", value: "DENY" },
                      { label: "Grant — add an approved permission", value: "GRANT" },
                    ]}
                  />
                  {catalogue.isPending ? (
                    <LoadingBlock />
                  ) : options.length === 0 ? (
                    <p className="text-xs text-gray-600">No permission can be {form.effect === "DENY" ? "denied to" : "granted to"} this role by an override.</p>
                  ) : (
                    <SelectInput
                      label="Permission"
                      required
                      value={form.permission}
                      onChange={(v) => setForm((f) => ({ ...f, permission: v }))}
                      options={[{ label: "Choose a permission", value: "" }, ...options.map((p) => ({ label: p, value: p }))]}
                    />
                  )}
                  {needsScope && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <SelectInput
                        label="Course"
                        required
                        value={form.courseId}
                        onChange={(v) => setForm((f) => ({ ...f, courseId: v }))}
                        options={[{ label: "Choose a course", value: "" }, ...(courses.data ?? []).map((c) => ({ label: c.title, value: c.id }))]}
                      />
                      <SelectInput
                        label="Division"
                        required
                        value={form.divisionId}
                        onChange={(v) => setForm((f) => ({ ...f, divisionId: v }))}
                        options={[{ label: "Choose a division", value: "" }, ...(divisions.data ?? []).map((d) => ({ label: d.name, value: d.id }))]}
                      />
                    </div>
                  )}
                  <TextInput label="Reason" required value={form.reason} onChange={(v) => setForm((f) => ({ ...f, reason: v }))} maxLength={OVERRIDE_RULES.reason.max} hint="Recorded in the audit log." />
                  <TextInput label="End date (optional)" type="date" value={form.expiresOn} onChange={(v) => setForm((f) => ({ ...f, expiresOn: v }))} />
                  {formError && (
                    <div data-testid="override-error">
                      <Alert tone="error">{formError}</Alert>
                    </div>
                  )}
                  <button type="submit" className={btnPrimary} disabled={create.isPending || options.length === 0}>
                    Add override
                  </button>
                </form>
              )}
            </section>
          )}
        </div>
      </div>

      {revoking && (
        <ConfirmDialog
          title="Revoke this override?"
          tone="danger"
          confirmLabel="Revoke"
          body={
            <>
              <span className="font-semibold">{revoking.permission}</span> returns to the role&apos;s default for {user.firstName} {user.lastName} on their next request.
            </>
          }
          onConfirm={async () => {
            try {
              await revoke.mutateAsync(revoking.id);
              setNotice({ tone: "success", text: `Revoked the override on ${revoking.permission}.` });
            } catch (err) {
              setNotice({ tone: "error", text: message(err) });
            }
          }}
          onClose={() => setRevoking(null)}
        />
      )}
    </Card>
  );
}
