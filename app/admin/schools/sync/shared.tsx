import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 mb-4">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> {label}
    </Link>
  );
}

export const STATUS_BADGE: Record<string, string> = {
  PREVIEW: "bg-indigo-50 text-indigo-700",
  APPLIED: "bg-emerald-50 text-emerald-700",
  EXPIRED: "bg-gray-100 text-gray-600",
  SUPERSEDED: "bg-gray-100 text-gray-600",
};
