"use client";

/**
 * Choose the columns of a user table: show or hide each one, move it up or down, then save it for yourself, return to
 * the organization's default, or (settings.manage) make it the organization's default for everyone.
 */
import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { errorMessage } from "@/lib/api/errors";
import { moveColumn, sameLayout, toggleColumn, type ColumnSetting, type TableLayout } from "@/lib/admin/table-layouts";
import { useChangeTableLayout } from "@/lib/queries/table-layouts";
import { Alert } from "@/app/components/ui/feedback";
import { Modal, btnPrimary, btnSecondary } from "../../components/adminUi";

const SOURCE_TEXT: Record<TableLayout["source"], string> = {
  USER: "You are using your own layout.",
  ORG: "You are using the organization's default layout.",
  DEFAULT: "You are using the built-in layout.",
};

export default function ColumnChooser({ layout, tableLabel, canSetDefault, onClose }: { layout: TableLayout; tableLabel: string; canSetDefault: boolean; onClose: () => void }) {
  const change = useChangeTableLayout(layout.table);
  const [columns, setColumns] = useState<ColumnSetting[]>(layout.columns);
  const [problem, setProblem] = useState<string | null>(null);
  const label = (key: string) => layout.available.find((a) => a.key === key)?.label ?? key;

  async function run(c: Parameters<typeof change.mutateAsync>[0]) {
    setProblem(null);
    try {
      await change.mutateAsync(c);
      onClose();
    } catch (err) {
      setProblem(errorMessage(err));
    }
  }

  return (
    <Modal title={`Columns — ${tableLabel}`} onClose={onClose}>
      <p className="mb-3 text-xs text-gray-600">{SOURCE_TEXT[layout.source]} Tick the columns to show and use the arrows to order them.</p>
      <ol className="mb-4 divide-y divide-gray-100 rounded-xl border border-gray-200" data-testid="column-chooser">
        {columns.map((c, i) => (
          <li key={c.key} className="flex items-center gap-3 px-3 py-2 text-sm">
            <label className="flex flex-1 cursor-pointer items-center gap-2">
              <input type="checkbox" checked={c.visible} onChange={() => setColumns((cur) => toggleColumn(cur, c.key))} data-testid={`column-${c.key}`} />
              <span className={c.visible ? "font-semibold text-gray-900" : "text-gray-500"}>{label(c.key)}</span>
            </label>
            <button type="button" className="rounded p-1 text-gray-600 hover:bg-gray-100 disabled:opacity-30" disabled={i === 0} onClick={() => setColumns((cur) => moveColumn(cur, c.key, -1))} aria-label={`Move ${label(c.key)} up`}>
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" className="rounded p-1 text-gray-600 hover:bg-gray-100 disabled:opacity-30" disabled={i === columns.length - 1} onClick={() => setColumns((cur) => moveColumn(cur, c.key, 1))} aria-label={`Move ${label(c.key)} down`}>
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
      {problem && <div className="mb-3"><Alert tone="error">{problem}</Alert></div>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} disabled={change.isPending} onClick={() => void run({ kind: "saveMine", columns })} data-testid="save-my-layout">
          Save for me
        </button>
        <button type="button" className={btnSecondary} disabled={change.isPending} onClick={() => setColumns(layout.orgDefault)}>
          Restore the default
        </button>
        {layout.source === "USER" && (
          <button type="button" className={btnSecondary} disabled={change.isPending} onClick={() => void run({ kind: "resetMine" })} data-testid="reset-my-layout">
            Stop using my layout
          </button>
        )}
        {canSetDefault && (
          <button type="button" className={btnSecondary} disabled={change.isPending || sameLayout(columns, layout.orgDefault)} onClick={() => void run({ kind: "saveOrg", columns })} data-testid="save-org-layout">
            Make this the organization default
          </button>
        )}
        {canSetDefault && (
          <button type="button" className={btnSecondary} disabled={change.isPending} onClick={() => void run({ kind: "resetOrg" })}>
            Reset the organization default
          </button>
        )}
      </div>
    </Modal>
  );
}
