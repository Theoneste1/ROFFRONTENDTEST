import { FIELD_LABELS, STATUS_LABEL, type BankingRowStatus } from "@/lib/accounts/banking";

const TONE: Record<string, string> = {
  COMPLETE: "bg-emerald-100 text-emerald-900",
  PARTIAL: "bg-amber-100 text-amber-900",
  NOT_STARTED: "bg-red-100 text-red-900",
  NEEDS_CORRECTION: "bg-red-100 text-red-900",
};

/** A Teacher's, Coach's or Head Coach's banking status in a list; the missing fields in its tooltip. "—" for other roles. */
export default function BankingStatusBadge({ banking }: { banking?: BankingRowStatus }) {
  if (!banking) return <span className="text-gray-500">—</span>;
  const missing = [...banking.missing, ...banking.invalid].map((f) => FIELD_LABELS[f]);
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${TONE[banking.status] ?? "bg-slate-100 text-slate-700"}`}
      title={missing.length ? `Missing or to correct: ${missing.join(", ")}` : "All six details given"}
      data-testid="banking-status"
      data-status={banking.status}
    >
      {STATUS_LABEL[banking.status] ?? banking.status}
    </span>
  );
}
