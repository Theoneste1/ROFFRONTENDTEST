import type { ReportReason, ReportStatus } from "@/lib/api/types";

export const REASON_LABEL: Record<ReportReason, string> = {
  SPAM: "Spam",
  ABUSE: "Abuse",
  INAPPROPRIATE: "Inappropriate",
  OFF_TOPIC: "Off topic",
  ACADEMIC_DISHONESTY: "Academic dishonesty",
  OTHER: "Other",
};

export const REPORT_STATUS: Record<ReportStatus, { label: string; badge: string }> = {
  OPEN: { label: "Open", badge: "bg-amber-50 text-amber-700" },
  RESOLVED: { label: "Resolved", badge: "bg-emerald-50 text-emerald-700" },
  DISMISSED: { label: "Dismissed", badge: "bg-gray-100 text-gray-500" },
};

export const excerpt = (s: string | null | undefined, n = 120) => (!s ? "—" : s.length > n ? `${s.slice(0, n)}…` : s);
