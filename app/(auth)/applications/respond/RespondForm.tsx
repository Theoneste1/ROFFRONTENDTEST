"use client";

/**
 * An applicant answers an administrator's question about their Teacher or Coach application (one-time link, no
 * account yet). Shows the question; the answer is required; the details the backend lets this kind of application
 * correct are pre-filled and optional. Rules: lib/accounts/application-details.ts.
 */
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { answerBody, answerProblems, applicationInfoApi, fieldLabel, isLongField, linkInvalid, LIMITS } from "@/lib/accounts/application-details";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { Alert, LoadingBlock } from "@/app/components/ui/feedback";
import { Button, TextField } from "@/app/components/ui/form";
import { AreaField } from "@/app/components/applications/ExtraFields";
import { formatDateTime } from "@/lib/format";

const GONE = "This link is no longer valid: it was already used, it expired, or your application has already been decided. If you still need to send information, reply to the e-mail you received.";

export default function RespondForm() {
  const token = useSearchParams().get("token") ?? "";
  const view = useQuery({ queryKey: ["application-info-request", token], queryFn: () => applicationInfoApi.view(token), enabled: token.length > 0, retry: false });
  const [answer, setAnswer] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [problems, setProblems] = useState<string[]>([]);
  const send = useMutation({ mutationFn: (body: Record<string, string | number>) => applicationInfoApi.answer(token, body) });

  if (!token) return <Alert tone="error">This page needs the link from your e-mail.</Alert>;
  if (view.isPending) return <LoadingBlock />;
  if (view.isError) return <Alert tone="error">{isApiError(view.error) && linkInvalid(view.error) ? GONE : errorMessage(view.error)}</Alert>;

  const v = view.data;
  const role = v.kind === "TEACHER" ? "teacher" : "coach";
  if (send.isSuccess) {
    return (
      <div className="space-y-4" data-testid="answer-sent">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Thank you, {v.firstName}</h1>
        <p className="text-sm text-slate-600">Your answer was sent. An administrator will continue reviewing your {role} application and will e-mail you the decision.</p>
        <Link href="/" className="text-sm font-semibold text-brand hover:underline">Back to the home page</Link>
      </div>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = answerProblems(answer, edits);
    setProblems(p);
    if (p.length) return;
    send.mutate(answerBody(answer, edits, v.details, v.correctable));
  };
  const setEdit = (k: string, val: string) => setEdits((s) => ({ ...s, [k]: val }));
  const valueOf = (k: string) => edits[k] ?? (v.details[k] == null ? "" : String(v.details[k]));

  return (
    <form onSubmit={submit} className="space-y-5" noValidate data-testid="answer-form">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">More information about your {role} application</h1>
        <p className="mt-2 text-sm text-slate-600">
          Dear {v.firstName}, an administrator asked (on {formatDateTime(v.requestedAt)}; answer by {formatDateTime(v.expiresAt)}):
        </p>
        <blockquote className="mt-3 rounded-lg border-l-4 border-indigo-400 bg-indigo-50/50 p-3 text-sm text-slate-800 whitespace-pre-line">{v.question}</blockquote>
      </div>
      <AreaField label="Your answer" name="answer" required max={LIMITS.answer[1]} value={answer} onChange={setAnswer} />
      {v.correctable.length > 0 && (
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-slate-700">Correct your details (optional)</legend>
          {v.correctable.map((k) =>
            isLongField(k) ? (
              <AreaField key={k} label={fieldLabel(k)} name={k} max={k === "expertise" ? LIMITS.expertise[1] : LIMITS.relevantExperience[1]} value={valueOf(k)} onChange={(val) => setEdit(k, val)} />
            ) : (
              <TextField key={k} label={fieldLabel(k)} name={k} value={valueOf(k)} onChange={(e) => setEdit(k, e.target.value)} inputMode={k === "yearsOfExperience" ? "numeric" : undefined} />
            ),
          )}
        </fieldset>
      )}
      {problems.length > 0 && (
        <Alert tone="error">
          {problems.map((p) => (
            <span key={p} className="block">{p}</span>
          ))}
        </Alert>
      )}
      {send.isError && <Alert tone="error">{isApiError(send.error) && linkInvalid(send.error) ? GONE : errorMessage(send.error)}</Alert>}
      <Button type="submit" variant="brand" loading={send.isPending} className="w-full">Send my answer</Button>
    </form>
  );
}
