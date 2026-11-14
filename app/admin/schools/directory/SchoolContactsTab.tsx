"use client";

/**
 * The school's contacts (`/admin/schools/:id/contacts`, schools.manage). Full values appear only
 * here. Editing sends the complete list (PUT): a removed contact is kept as removed, a changed
 * type or value replaces the contact (unverified, administrators only). Verifying a contact can
 * also authorise it for the school's representatives.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { adminSchoolsApi, type SchoolContact, type SchoolContactType, type SchoolContactVisibility } from "@/lib/api/school-directory";
import {
  CONTACT_TYPE_LABEL,
  MAX_CONTACTS,
  REASON,
  VISIBILITY_LABEL,
  contactChanges,
  contactsErrorMessage,
  contactsPayload,
  draftsFromContacts,
  emptyDraft,
  reasonProblem,
  validateContactDrafts,
  verifyPayload,
  type ContactDraft,
} from "@/lib/admin/school-contacts";
import { useSchoolContacts } from "@/lib/queries/school-directory";
import { queryKeys } from "@/lib/query/keys";
import { formatDateTime } from "@/lib/format";
import { Alert, ErrorState, LoadingBlock, Spinner } from "@/app/components/ui/feedback";
import { Badge, Modal, Notice, TableCard, TableMessage, btnPrimary, btnSecondary, linkBtn, td, th } from "../../components/adminUi";

export default function SchoolContactsTab({ schoolId }: { schoolId: string }) {
  const [showRemoved, setShowRemoved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [verifying, setVerifying] = useState<SchoolContact | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const contacts = useSchoolContacts(schoolId, showRemoved);
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: [...queryKeys.schoolDirectory.all, "contacts", schoolId] });

  if (contacts.isPending) return <LoadingBlock />;
  if (contacts.isError) return <ErrorState error={contacts.error} title="Couldn't load the contacts" onRetry={() => contacts.refetch()} />;
  const list = contacts.data.contacts;

  return (
    <div className="space-y-3" data-testid="school-contacts">
      {notice && <Notice onClose={() => setNotice(null)}>{notice}</Notice>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500">Contacts are visible to administrators only, unless verified and authorised for the school&apos;s representatives.</p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} /> Show removed
          </label>
          <button type="button" className={btnSecondary} onClick={() => setEditing(true)} data-testid="contacts-edit">
            Edit contacts
          </button>
        </div>
      </div>
      <TableCard>
        <thead>
          <tr className="border-b border-gray-100">
            <th className={th}>Type</th>
            <th className={th}>Contact</th>
            <th className={th}>Verified</th>
            <th className={th}>Visible to</th>
            <th className={th}>
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100/80">
          {list.length === 0 ? (
            <TableMessage colSpan={5}>No contacts recorded.</TableMessage>
          ) : (
            list.map((c) => (
              <tr key={c.id} className={`text-xs ${c.removedAt ? "opacity-60" : ""}`} data-contact={c.value}>
                <td className={td}>
                  {CONTACT_TYPE_LABEL[c.type]}
                  {c.isPrimary && <Badge className="ml-1 bg-indigo-50 text-indigo-700">Primary</Badge>}
                </td>
                <td className={`${td} font-semibold text-gray-800`}>
                  {c.value}
                  {c.label && <span className="block font-normal text-gray-500">{c.label}</span>}
                  {c.dataSource && <span className="block font-normal text-gray-400">from {c.dataSource.key}</span>}
                  {c.removedAt && <span className="block font-normal text-gray-500">Removed {formatDateTime(c.removedAt)}{c.removedBy ? ` by @${c.removedBy.username}` : ""}</span>}
                </td>
                <td className={td}>
                  {c.verifiedAt ? (
                    <Badge className="bg-emerald-50 text-emerald-700">
                      Verified {formatDateTime(c.verifiedAt)}
                      {c.verifiedBy ? ` · @${c.verifiedBy.username}` : ""}
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-50 text-amber-700">Not verified</Badge>
                  )}
                </td>
                <td className={`${td} text-gray-600`}>{VISIBILITY_LABEL[c.visibility]}</td>
                <td className={td}>
                  {!c.removedAt && (
                    <button type="button" className={linkBtn} onClick={() => setVerifying(c)}>
                      {c.verifiedAt ? "Re-verify" : "Verify"}
                    </button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableCard>
      {editing && (
        <ContactsDialog
          schoolId={schoolId}
          contacts={list.filter((c) => !c.removedAt)}
          onClose={() => setEditing(false)}
          onSaved={(changed) => {
            setEditing(false);
            setNotice(changed ? "The contacts were saved." : "Nothing changed.");
            void refresh();
          }}
        />
      )}
      {verifying && (
        <VerifyDialog
          schoolId={schoolId}
          contact={verifying}
          onClose={() => setVerifying(null)}
          onDone={() => {
            setVerifying(null);
            setNotice("The contact was verified.");
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function ContactsDialog({ schoolId, contacts, onClose, onSaved }: { schoolId: string; contacts: SchoolContact[]; onClose: () => void; onSaved: (changed: boolean) => void }) {
  const [drafts, setDrafts] = useState<ContactDraft[]>(() => draftsFromContacts(contacts));
  const [reason, setReason] = useState("");
  const [checked, setChecked] = useState(false);
  const save = useMutation({
    mutationFn: () => adminSchoolsApi.putContacts(schoolId, contactsPayload(drafts, reason)),
    onSuccess: (r) => onSaved(r.changed),
  });
  const problems = validateContactDrafts(drafts);
  const rp = reasonProblem(reason);
  const summary = contactChanges(contacts, drafts);
  const set = (key: string, patch: Partial<ContactDraft>) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  function submit() {
    setChecked(true);
    if (Object.keys(problems.rows).length || problems.list || rp || save.isPending) return;
    save.mutate();
  }

  return (
    <Modal wide title="Edit contacts" onClose={() => !save.isPending && onClose()}>
      <div className="space-y-3 text-xs" data-testid="contacts-form">
        {drafts.length === 0 && <p className="text-gray-500">No contacts. Add one below.</p>}
        {drafts.map((d, i) => (
          <div key={d.key} className="rounded-xl border border-gray-100 p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label={`Contact ${i + 1} type`} value={d.type} onChange={(e) => set(d.key, { type: e.target.value as SchoolContactType })} className="border border-gray-200 rounded-lg px-2 py-1.5">
                {(Object.keys(CONTACT_TYPE_LABEL) as SchoolContactType[]).map((t) => (
                  <option key={t} value={t}>
                    {CONTACT_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              <input aria-label={`Contact ${i + 1} value`} value={d.value} onChange={(e) => set(d.key, { value: e.target.value })} maxLength={200} className="flex-1 min-w-[12rem] border border-gray-200 rounded-lg px-2 py-1.5" />
              <input aria-label={`Contact ${i + 1} label`} value={d.label} onChange={(e) => set(d.key, { label: e.target.value })} maxLength={100} placeholder="Label (e.g. Head teacher)" className="w-44 border border-gray-200 rounded-lg px-2 py-1.5" />
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={d.isPrimary} onChange={(e) => set(d.key, { isPrimary: e.target.checked })} /> Primary
              </label>
              <button type="button" aria-label={`Remove contact ${i + 1}`} className="text-gray-400 hover:text-red-600" onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {checked && problems.rows[d.key] && <p className="text-red-600">{problems.rows[d.key]}</p>}
          </div>
        ))}
        <button type="button" className={btnSecondary} disabled={drafts.length >= MAX_CONTACTS} onClick={() => setDrafts((ds) => [...ds, emptyDraft()])} data-testid="contacts-add">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add contact
        </button>
        {checked && problems.list && <p className="text-red-600">{problems.list}</p>}
        <label className="block">
          <span className="block font-semibold text-gray-600 mb-1">Reason (optional)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={REASON.max} className="w-full border border-gray-200 rounded-lg px-2 py-1.5" />
          {rp && <span className="text-red-600">{rp}</span>}
        </label>
        {summary.changed && (
          <p className="text-gray-600">
            {[summary.added && `${summary.added} added`, summary.edited && `${summary.edited} edited`, summary.replaced && `${summary.replaced} replaced`, summary.removed && `${summary.removed} removed`]
              .filter(Boolean)
              .join(", ")}
            .{summary.verificationLost ? ` ${summary.verificationLost} verified contact(s) lose their verification (a new value must be verified again).` : ""}
          </p>
        )}
        {save.isError && <Alert tone="error">{contactsErrorMessage(save.error)}</Alert>}
        <div className="flex justify-end gap-3">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          <button type="button" className={btnPrimary} onClick={submit} disabled={save.isPending} data-testid="contacts-save">
            {save.isPending && <Spinner className="h-3.5 w-3.5 !text-white" />} Save contacts
          </button>
        </div>
      </div>
    </Modal>
  );
}

function VerifyDialog({ schoolId, contact, onClose, onDone }: { schoolId: string; contact: SchoolContact; onClose: () => void; onDone: () => void }) {
  const [visibility, setVisibility] = useState<SchoolContactVisibility>(contact.visibility);
  const [reason, setReason] = useState("");
  const verify = useMutation({ mutationFn: () => adminSchoolsApi.verifyContact(schoolId, contact.id, verifyPayload(visibility, reason)), onSuccess: onDone });
  const rp = reasonProblem(reason);
  return (
    <Modal title={`Verify ${contact.value}`} onClose={() => !verify.isPending && onClose()}>
      <div className="space-y-3 text-xs" data-testid="contact-verify">
        <p className="text-gray-600">Confirm that you checked this contact with the school. The verification is recorded in the audit log.</p>
        {(Object.keys(VISIBILITY_LABEL) as SchoolContactVisibility[]).map((v) => (
          <label key={v} className="flex items-center gap-2">
            <input type="radio" name="visibility" checked={visibility === v} onChange={() => setVisibility(v)} /> {VISIBILITY_LABEL[v]}
          </label>
        ))}
        <label className="block">
          <span className="block font-semibold text-gray-600 mb-1">Reason (optional)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={REASON.max} className="w-full border border-gray-200 rounded-lg px-2 py-1.5" />
          {rp && <span className="text-red-600">{rp}</span>}
        </label>
        {verify.isError && <Alert tone="error">{contactsErrorMessage(verify.error)}</Alert>}
        <div className="flex justify-end gap-3">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={verify.isPending}>
            Cancel
          </button>
          <button type="button" className={btnPrimary} onClick={() => !rp && verify.mutate()} disabled={verify.isPending || !!rp} data-testid="contact-verify-confirm">
            {verify.isPending && <Spinner className="h-3.5 w-3.5 !text-white" />} Verify
          </button>
        </div>
      </div>
    </Modal>
  );
}

