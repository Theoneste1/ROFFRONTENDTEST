/** Student pages: an explained refusal (no division, not permitted) and the derived deadline badges. */
import { Lock } from "lucide-react";
import type { AssignmentTiming } from "@/lib/assessment/student-state";

export default function AccessDenied({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm py-14 px-6 flex flex-col items-center text-center gap-2" role="alert" data-testid="student-denied">
      <Lock className="h-9 w-9 text-slate-400" aria-hidden="true" />
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      <p className="text-sm text-slate-500 max-w-md">{body}</p>
    </div>
  );
}

/** "Overdue" (no submission, and the backend no longer accepts one) or "Late — still open". */
export function TimingBadge({ timing }: { timing: AssignmentTiming }) {
  if (timing === "overdue") {
    return (
      <span className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap bg-red-600 text-white" data-testid="badge-overdue">
        Overdue
      </span>
    );
  }
  if (timing === "lateAllowed") {
    return (
      <span className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap bg-amber-100 text-amber-700" data-testid="badge-late-allowed">
        Past deadline · late work accepted
      </span>
    );
  }
  return null;
}
