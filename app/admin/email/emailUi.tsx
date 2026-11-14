"use client";

import type { EmailDeliveryStatus, EmailJobStatus } from "@/lib/admin-ops/email";
import { Badge } from "../components/adminUi";

export const JOB_STATUS: Record<EmailJobStatus, { label: string; badge: string }> = {
  PENDING: { label: "Queued", badge: "bg-slate-100 text-slate-600" },
  IN_PROGRESS: { label: "Sending", badge: "bg-blue-50 text-blue-700" },
  COMPLETED: { label: "Sent", badge: "bg-emerald-50 text-emerald-700" },
  PARTIAL_FAILURE: { label: "Partly failed", badge: "bg-amber-50 text-amber-700" },
  FAILED: { label: "Failed", badge: "bg-red-50 text-red-600" },
};

export const DELIVERY_STATUS: Record<EmailDeliveryStatus, { label: string; badge: string }> = {
  PENDING: { label: "Pending", badge: "bg-slate-100 text-slate-600" },
  SENT: { label: "Sent", badge: "bg-emerald-50 text-emerald-700" },
  FAILED: { label: "Failed", badge: "bg-red-50 text-red-600" },
};

export function JobStatusBadge({ status }: { status: EmailJobStatus }) {
  const s = JOB_STATUS[status] ?? { label: status, badge: "bg-gray-100 text-gray-600" };
  return <Badge className={s.badge}>{s.label}</Badge>;
}

export function DeliveryStatusBadge({ status }: { status: EmailDeliveryStatus }) {
  const s = DELIVERY_STATUS[status] ?? { label: status, badge: "bg-gray-100 text-gray-600" };
  return <Badge className={s.badge}>{s.label}</Badge>;
}
