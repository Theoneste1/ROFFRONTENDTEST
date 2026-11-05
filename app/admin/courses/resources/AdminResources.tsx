"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { scopeKey } from "@/lib/queries/mentor";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { ScopeSelect } from "@/app/mentor/components/mentorUi";
import ResourcesTab, { KIND, type ResourceKind } from "@/app/mentor/courses/components/ResourcesTab";
import { useAdminScopes } from "./useAdminScopes";

const TABS: ResourceKind[] = ["books", "papers", "notes"];
const BASE = "/admin/courses/resources";

/**
 * Learning resources of any course × division, managed with the same
 * components as the mentor portal (upload, edit, publish, unpublish,
 * archive, restore, delete). `?scope=<courseId>[:<divisionId>]&tab=`.
 */
export default function AdminResources() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const scopes = useAdminScopes();
  const tabParam = params.get("tab") as ResourceKind | null;
  const tab: ResourceKind = tabParam && TABS.includes(tabParam) ? tabParam : "books";
  const scopeParam = params.get("scope") ?? "";

  const back = (
    <Link href="/admin/courses" className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 mb-4">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Courses
    </Link>
  );

  if (scopes.isPending) return <>{back}<LoadingBlock /></>;
  if (scopes.isError || !scopes.data) return <>{back}<ErrorState error={scopes.error} onRetry={scopes.refetch} /></>;

  const list = scopes.data;
  // A bare course id (link from the courses table) selects its first division.
  const scope = list.find((s) => scopeKey(s) === scopeParam) ?? list.find((s) => s.course.id === scopeParam) ?? list[0];
  const go = (next: { scope?: string; tab?: ResourceKind }) => {
    const sp = new URLSearchParams(params);
    if (next.scope) sp.set("scope", next.scope);
    if (next.tab) sp.set("tab", next.tab);
    router.replace(`${pathname}?${sp}`, { scroll: false });
  };

  return (
    <>
      {back}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Course resources</h1>
          <p className="text-sm text-gray-500 mt-1 font-medium">Books, past papers and materials. Students see a resource only after it is published.</p>
        </div>
        <ScopeSelect scopes={list} value={scopeKey(scope)} onChange={(v) => go({ scope: v })} label="Course and division" />
      </div>

      <div className="flex items-center gap-6 border-b border-slate-300/60 mb-6 text-sm font-medium overflow-x-auto" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => go({ tab: t })}
            className={`pb-3 whitespace-nowrap transition-colors ${tab === t ? "text-indigo-600 font-semibold border-b-2 border-indigo-600 -mb-[2px]" : "text-slate-500 hover:text-slate-800"}`}
          >
            {KIND[t].title}
          </button>
        ))}
      </div>

      <ResourcesTab key={`${scopeKey(scope)}:${tab}`} kind={tab} courseId={scope.course.id} divisionId={scope.division.id} scopeKeyValue={scopeKey(scope)} basePath={BASE} />
    </>
  );
}
