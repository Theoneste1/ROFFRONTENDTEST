"use client";

/**
 * Small square icon buttons (owner 2026-11-25): a coloured square with a white icon, for row and card actions — the
 * same look everywhere. Every one has a label (read by screen readers and shown as a tooltip).
 *
 *   <IconAction tone="primary" icon={Pencil} label="Edit" onClick={…} />
 *   <IconAction tone="danger" icon={Trash2} label="Delete" href="…" />   (a link)
 */
import Link from "next/link";
import type { ComponentType, MouseEventHandler } from "react";

const TONES = {
  primary: "bg-[#00428C] hover:bg-[#003574]",   // the logo blue: main actions (edit, apply)
  teal: "bg-[#0F6A8B] hover:bg-[#0C5872]",      // secondary actions (organise, assign)
  slate: "bg-slate-600 hover:bg-slate-700",     // neutral actions (label, view)
  danger: "bg-red-700 hover:bg-red-800",        // deleting or removing
} as const;
export type IconTone = keyof typeof TONES;

type IconType = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;

export function IconAction({
  icon: Icon, label, tone = "primary", onClick, href, disabled, testId,
}: { icon: IconType; label: string; tone?: IconTone; onClick?: MouseEventHandler; href?: string; disabled?: boolean; testId?: string }) {
  const cls = `inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white shadow-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#00428C] disabled:cursor-not-allowed disabled:opacity-50 ${TONES[tone]}`;
  const inner = <Icon className="h-4 w-4" aria-hidden="true" />;
  if (href) return <Link href={href} className={cls} aria-label={label} title={label} data-testid={testId}>{inner}</Link>;
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled} aria-label={label} title={label} data-testid={testId}>
      {inner}
    </button>
  );
}

/** A small group of icon tabs (the active one a filled blue square), e.g. switching a view. */
export function IconTabs<T extends string>({
  items, value, onChange, label,
}: { items: { value: T; icon: IconType; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
      {items.map(({ value: v, icon: Icon, label: l }) => {
        const on = v === value;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={l}
            title={l}
            onClick={() => onChange(v)}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${on ? "bg-[#00428C] text-white" : "text-slate-700 hover:bg-white"}`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
