"use client";

/**
 * Upload or edit a resource (original "Books" upload page design).
 * Create: `POST /courses/:courseId/resources` (multipart, files) and
 * optionally publish. Edit: `PATCH` metadata, add/remove files.
 * Resources stay hidden from students until published.
 */
import React, { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth/session";
import { actionAllowed } from "@/lib/auth/navigation";
import { ArrowLeft, ChevronDown, Trash2 } from "lucide-react";
import type { CourseResource, ResourceType, TeachingScope } from "@/lib/api/types";
import { RESOURCE_RULES, RESOURCE_UPLOAD } from "@/lib/api/mentor";
import { scopeKey, scopeLabel, useMentorResource, useSaveResource, useTeachingScopes } from "@/lib/queries/mentor";
import { errorMessage, fieldErrors, isApiError } from "@/lib/api/errors";
import { formatFileSize } from "@/lib/format";
import { Alert, EmptyState, ErrorState, LoadingBlock, Spinner } from "@/app/components/ui/feedback";
import FilePicker from "@/app/components/ui/FilePicker";
import { parseScopeKey } from "../../components/mentorUi";
import { TYPE_LABEL } from "../components/ResourcesTab";

const TYPES: ResourceType[] = ["BOOK", "EBOOK", "PAST_PAPER", "NOTE", "ATTACHMENT"];
const inputCls =
  "w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm";

/**
 * Mentors pick from their own scopes (`/me/teaching`). Admins pass every
 * course × division as `scopeList` and their own `basePath`.
 */
export default function ResourceForm({ scopeList, basePath = "/mentor/courses" }: { scopeList?: TeachingScope[]; basePath?: string } = {}) {
  const params = useSearchParams();
  const { can, permissionsStatus } = useSession();
  const teaching = useTeachingScopes(!scopeList);
  const scopes = scopeList ? { data: scopeList, isPending: false, isError: false as const, error: null, refetch: () => undefined } : teaching;
  const resourceId = params.get("resourceId") ?? undefined;
  const list = scopes.data ?? [];
  const scope = list.find((s) => scopeKey(s) === params.get("scope")) ?? list[0];
  const existing = useMentorResource(resourceId ? scope?.course.id : undefined, resourceId);

  // Uploading and editing need resources.manage (a Head Coach views resources only).
  if (permissionsStatus === "loading") return <LoadingBlock />;
  if (!actionAllowed("resources.manage", permissionsStatus, can))
    return (
      <div className="p-8 bg-white rounded-2xl m-8">
        <EmptyState title="You can't add or edit resources" description="Your role can view this course's resources but not change them." />
      </div>
    );
  if (scopes.isPending || (resourceId && existing.isPending)) return <LoadingBlock />;
  if (scopes.isError) return <ErrorState error={scopes.error} onRetry={() => scopes.refetch()} />;
  if (!scope)
    return (
      <div className="p-8 bg-white rounded-2xl m-8">
        <EmptyState title="You are not assigned to a course yet" />
      </div>
    );
  if (resourceId && existing.isError) {
    const notFound = isApiError(existing.error) && [400, 403, 404].includes(existing.error.status);
    return (
      <div className="p-8">
        {notFound ? <EmptyState title="Resource not found" description="It doesn't exist or isn't in one of your courses." /> : <ErrorState error={existing.error} onRetry={() => existing.refetch()} />}
      </div>
    );
  }

  return <Form key={resourceId ?? "new"} basePath={basePath} scopes={list} initialScope={scope} existing={existing.data} defaultType={(params.get("type") as ResourceType) ?? "BOOK"} backTab={params.get("tab") ?? "books"} />;
}

function Form({
  basePath,
  scopes,
  initialScope,
  existing,
  defaultType,
  backTab,
}: {
  basePath: string;
  scopes: TeachingScope[];
  initialScope: TeachingScope;
  existing?: CourseResource;
  defaultType: ResourceType;
  backTab: string;
}) {
  const router = useRouter();
  const isEdit = !!existing;
  const [scopeValue, setScopeValue] = useState(isEdit ? `${existing!.courseId}:${existing!.divisionId}` : scopeKey(initialScope));
  const [form, setForm] = useState({
    title: existing?.title ?? "",
    type: existing?.type ?? (TYPES.includes(defaultType) ? defaultType : "BOOK"),
    description: existing?.description ?? "",
    author: existing?.author ?? "",
    source: existing?.source ?? "",
    year: existing?.year ? String(existing.year) : "",
    tags: existing?.tags.join(", ") ?? "",
    publish: false,
  });
  const [files, setFiles] = useState<File[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const sc = parseScopeKey(scopeValue)!;
  const save = useSaveResource(sc.courseId);
  const server = fieldErrors(save.error, ["title", "description", "author", "source", "year", "tags", "type"]);
  const kept = (existing?.attachments ?? []).filter((a) => !removed.includes(a.id));
  const back = () => router.push(`${basePath}?scope=${encodeURIComponent(scopeValue)}&tab=${backTab}`);
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  function validate() {
    const e: Record<string, string> = {};
    const t = form.title.trim().length;
    if (t < RESOURCE_RULES.title.min || t > RESOURCE_RULES.title.max) e.title = "Title must be 2–200 characters.";
    if (form.description.length > RESOURCE_RULES.description.max) e.description = "At most 2,000 characters.";
    if (form.year) {
      const y = Number(form.year);
      if (!Number.isInteger(y) || y < RESOURCE_RULES.year.min || y > RESOURCE_RULES.year.max) e.year = "Year from 1800 to 2200.";
    }
    const tags = form.tags.split(",").map((s) => s.trim()).filter(Boolean);
    if (tags.length > RESOURCE_RULES.tags.max) e.tags = "At most 20 tags.";
    else if (tags.some((t) => t.length > RESOURCE_RULES.tags.tagMax || !RESOURCE_RULES.tags.pattern.test(t))) e.tags = "Tags may contain letters, digits, spaces and _ . + - (up to 40 characters).";
    if (!isEdit && files.length === 0) e.files = "Upload at least one file.";
    if (isEdit && kept.length + files.length === 0) e.files = "Keep or upload at least one file.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (save.isPending || !validate()) return;
    const tags = form.tags.split(",").map((s) => s.trim()).filter(Boolean);
    save.mutate(
      {
        resourceId: existing?.id,
        input: {
          divisionId: sc.divisionId,
          type: form.type,
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          author: form.author.trim() || undefined,
          source: form.source.trim() || undefined,
          year: form.year ? Number(form.year) : undefined,
          tags: isEdit || tags.length ? tags : undefined,
        },
        addFiles: files,
        removeAttachmentIds: removed,
        publish: form.publish,
      },
      { onSuccess: back },
    );
  }

  const err = (k: string) => errors[k] ?? server[k];

  return (
    <div className="min-h-screen bg-[#E6EBF2] p-4 md:p-8 lg:p-12 text-[#2D3748]">
      <div className="max-w-6xl mx-auto">
        <button type="button" onClick={back} className="flex items-center text-xs font-semibold text-gray-600 hover:text-gray-900 mb-4 md:mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Go Back
        </button>

        <div className="border-b border-gray-300/80 pb-3 md:pb-4 mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-1">{isEdit ? "Edit resource" : "Upload a resource"}</h1>
          <p className="text-sm md:text-base text-gray-500 font-normal">
            {isEdit ? "Update the details or files." : "Add a learning resource for your students. It stays hidden until you publish it."}
          </p>
        </div>

        {save.isError && Object.keys(server).length === 0 && (
          <div className="mb-6">
            <Alert tone="error">{errorMessage(save.error)}</Alert>
          </div>
        )}

        <form onSubmit={onSubmit} noValidate>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 mb-8 md:mb-12">
            <div className="space-y-5">
              <Field label="Title" required error={err("title")} htmlFor="title">
                <input id="title" value={form.title} maxLength={200} onChange={(e) => set("title", e.target.value)} placeholder="Enter a title" className={inputCls} />
              </Field>

              <Field label="Course and division" required htmlFor="scope">
                {isEdit ? (
                  <p className="text-sm font-semibold text-slate-800">{scopeLabel(scopes.find((s) => scopeKey(s) === scopeValue) ?? initialScope)} (fixed)</p>
                ) : (
                  <div className="relative">
                    <select id="scope" value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} className={`${inputCls} appearance-none pr-10`}>
                      {scopes.map((s) => (
                        <option key={s.id} value={scopeKey(s)}>
                          {scopeLabel(s)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                )}
              </Field>

              <Field label="Description" error={err("description")} htmlFor="description">
                <div className="relative bg-white border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all">
                  <textarea
                    id="description"
                    rows={4}
                    maxLength={2000}
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="Provide a short description..."
                    className="w-full px-4 pt-3 pb-8 bg-transparent text-slate-800 focus:outline-none text-sm resize-none"
                  />
                  <span className="absolute bottom-2 right-3 text-[10px] text-slate-400 font-medium">{form.description.length}/2000</span>
                </div>
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Resource Type" required htmlFor="type">
                  <div className="relative">
                    <select id="type" value={form.type} onChange={(e) => set("type", e.target.value)} className={`${inputCls} appearance-none pr-10`}>
                      {TYPES.map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </Field>
                <Field label="Year" error={err("year")} htmlFor="year">
                  <input id="year" type="number" min={1800} max={2200} value={form.year} onChange={(e) => set("year", e.target.value)} placeholder="e.g. 2024" className={inputCls} />
                </Field>
                <Field label="Author" error={err("author")} htmlFor="author">
                  <input id="author" value={form.author} maxLength={200} onChange={(e) => set("author", e.target.value)} className={inputCls} />
                </Field>
                <Field label="Source" error={err("source")} htmlFor="source">
                  <input id="source" value={form.source} maxLength={200} onChange={(e) => set("source", e.target.value)} placeholder="e.g. National Olympiad, Round 2" className={inputCls} />
                </Field>
              </div>

              <Field label="Tags" error={err("tags")} htmlFor="tags" hint="Comma-separated, e.g. inequalities, olympiad">
                <input id="tags" value={form.tags} onChange={(e) => set("tags", e.target.value)} className={inputCls} />
              </Field>

              {!existing?.isPublished && (
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.publish} onChange={(e) => set("publish", e.target.checked)} className="w-4 h-4 mt-0.5 text-indigo-600 rounded border-slate-300" />
                  <span>
                    <span className="block text-sm font-medium text-slate-900">Publish now</span>
                    <span className="block text-xs text-slate-400">Students of the division see it and are notified.</span>
                  </span>
                </label>
              )}
            </div>

            <div className="space-y-4">
              <p className="block text-sm font-semibold text-slate-700">
                Files <span className="text-red-500">*</span>
              </p>
              {kept.length > 0 && (
                <ul className="space-y-2">
                  {kept.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <span className="text-xs font-medium text-slate-800 truncate flex-1">{a.file.originalName}</span>
                      <span className="text-[10px] text-slate-400">{formatFileSize(a.file.size)}</span>
                      <button type="button" onClick={() => setRemoved((r) => [...r, a.id])} className="p-1 text-slate-400 hover:text-red-600" aria-label={`Remove ${a.file.originalName}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <FilePicker files={files} onChange={setFiles} rules={RESOURCE_UPLOAD} existingCount={kept.length} title="Upload files (drag and drop or click)" />
              {err("files") && <p className="text-xs text-red-600">{err("files")}</p>}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4">
            <button type="button" onClick={back} className="px-6 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm">
              Cancel
            </button>
            <button
              type="submit"
              disabled={save.isPending}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#2B2E9D] hover:bg-[#232580] text-white text-sm font-medium rounded-lg shadow-md hover:shadow-lg transition-all disabled:opacity-60"
            >
              {save.isPending && <Spinner className="h-4 w-4 !text-white" />}
              {isEdit ? "Save changes" : "Upload"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, required, error, hint, htmlFor, children }: { label: string; required?: boolean; error?: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-slate-700 mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error ? <p className="mt-1.5 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1.5 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}
