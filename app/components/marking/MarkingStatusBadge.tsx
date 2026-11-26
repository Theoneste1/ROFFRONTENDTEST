/**
 * A marking status: label + icon + colour (never colour alone), with a plain-words tooltip. One component for every
 * marking screen (lib/test-management/marking-status.ts holds the tones and words).
 */
import { CircleCheck, CircleDashed, Hourglass, Loader, Megaphone, Send, Undo2, Users } from "lucide-react";
import { TONE_CLASS, type MarkingIcon, type MarkingStatusView } from "@/lib/test-management/marking-status";

const ICONS: Record<MarkingIcon, typeof CircleCheck> = {
  notStarted: CircleDashed, inProgress: Loader, submitted: Send, review: Hourglass,
  approved: CircleCheck, returned: Undo2, second: Users, published: Megaphone,
};

export function MarkingStatusBadge({ status, testId }: { status: MarkingStatusView; testId?: string }) {
  const Icon = ICONS[status.icon];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONE_CLASS[status.tone]}`}
      title={status.hint}
      data-testid={testId}
      data-tone={status.tone}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {status.label}
    </span>
  );
}
