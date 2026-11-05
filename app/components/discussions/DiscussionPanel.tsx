"use client";

/**
 * Discussion for a course (per division) or an assignment, in the style of the
 * original assignment "Discussion" tab: info banner, comment bar, comment cards
 * with reactions and replies.
 *
 * Backend model: a scope has threads (topics); a thread has comments with one
 * level of replies. Reactions toggle (LIKE, HELPFUL, CONFUSED). Authors edit or
 * delete their own comments; anyone can report a comment.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Flag, HelpCircle, Info, Lightbulb, Lock, MessageSquare, MoreVertical, Pencil, Plus, ThumbsUp, Trash2 } from "lucide-react";
import type { ThreadScope } from "@/lib/api/community";
import type { DiscussionComment, DiscussionThread, ReactionType, ReportReason } from "@/lib/api/types";
import { useCommentActions, useCreateThread, useReplies, useThreadComments, useThreads } from "@/lib/queries/community";
import { useSession } from "@/lib/auth/session";
import { errorMessage } from "@/lib/api/errors";
import { formatDateTime, formatRelative, personName } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { Alert, EmptyState, ErrorState, LoadingBlock, Spinner } from "@/app/components/ui/feedback";

const REACTIONS: { type: ReactionType; label: string; icon: typeof ThumbsUp; tone: string }[] = [
  { type: "LIKE", label: "Like", icon: ThumbsUp, tone: "bg-blue-500" },
  { type: "HELPFUL", label: "Helpful", icon: Lightbulb, tone: "bg-emerald-500" },
  { type: "CONFUSED", label: "Confused", icon: HelpCircle, tone: "bg-amber-400" },
];

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "SPAM", label: "Spam" },
  { value: "ABUSE", label: "Abuse or harassment" },
  { value: "INAPPROPRIATE", label: "Inappropriate content" },
  { value: "OFF_TOPIC", label: "Off topic" },
  { value: "ACADEMIC_DISHONESTY", label: "Sharing answers / academic dishonesty" },
  { value: "OTHER", label: "Other" },
];

export default function DiscussionPanel({
  scope,
  banner,
  disabledReason,
}: {
  scope: ThreadScope;
  banner: string;
  /** e.g. "Discussions are turned off for this course." */
  disabledReason?: string | null;
}) {
  const threads = useThreads(scope);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const list = threads.data?.data ?? [];
  const selected = list.find((t) => t.id === selectedId) ?? list[0] ?? null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 bg-[#EEF4FF] border border-[#D0E1FF] text-[#2563EB] px-4 py-3 rounded-xl text-sm font-medium shadow-sm">
        <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
          <Info className="w-3.5 h-3.5" />
        </div>
        <span>{banner}</span>
      </div>

      {disabledReason && <Alert tone="info">{disabledReason}</Alert>}

      {threads.isPending ? (
        <LoadingBlock label="Loading discussion…" />
      ) : threads.isError ? (
        <ErrorState error={threads.error} title="Couldn't load the discussion" onRetry={() => threads.refetch()} />
      ) : (
        <>
          {/* Topics */}
          <div className="flex flex-wrap items-center gap-2">
            {list.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setSelectedId(t.id);
                  setCreating(false);
                }}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  selected?.id === t.id && !creating
                    ? "bg-[#1E1B4B] text-white border-[#1E1B4B]"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {t.status === "LOCKED" && <Lock className="w-3 h-3" />}
                {t.title}
                <span className="opacity-60">{t._count.comments}</span>
              </button>
            ))}
            {!disabledReason && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border border-dashed transition-colors ${
                  creating ? "border-blue-600 text-blue-700 bg-blue-50" : "border-gray-300 text-gray-600 hover:bg-white"
                }`}
              >
                <Plus className="w-3.5 h-3.5" /> New topic
              </button>
            )}
          </div>

          {creating || (list.length === 0 && !disabledReason) ? (
            <NewThreadForm
              scope={scope}
              onCreated={(t) => {
                setSelectedId(t.id);
                setCreating(false);
              }}
              onCancel={list.length > 0 ? () => setCreating(false) : undefined}
            />
          ) : selected ? (
            <ThreadView key={selected.id} thread={selected} postingDisabled={!!disabledReason} />
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200/80">
              <EmptyState title="No discussion yet" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NewThreadForm({
  scope,
  onCreated,
  onCancel,
}: {
  scope: ThreadScope;
  onCreated: (t: DiscussionThread) => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const create = useCreateThread(scope);
  const valid = title.trim().length >= 3 && title.trim().length <= 200 && content.trim().length >= 1 && content.trim().length <= 5000;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid || create.isPending) return;
    create.mutate({ title, content }, { onSuccess: onCreated });
  }

  return (
    <form onSubmit={onSubmit} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200/80 space-y-4">
      <h3 className="font-bold text-gray-900">Start a new topic</h3>
      {create.isError && <Alert tone="error">{errorMessage(create.error)}</Alert>}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        placeholder="Topic title (at least 3 characters)"
        className="w-full bg-[#F8FAFC] border border-gray-200 rounded-xl py-2.5 px-4 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-600"
        aria-label="Topic title"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={5000}
        rows={4}
        placeholder="What would you like to ask or share?"
        className="w-full bg-[#F8FAFC] border border-gray-200 rounded-xl py-2.5 px-4 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-600 resize-y"
        aria-label="First message"
      />
      <div className="flex items-center justify-end gap-3">
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-5 py-2 text-xs font-medium text-gray-600 hover:text-gray-900">
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!valid || create.isPending}
          className="inline-flex items-center gap-2 bg-[#2B36C8] hover:bg-blue-800 text-white font-medium text-xs px-6 py-2.5 rounded-xl transition-colors disabled:opacity-50"
        >
          {create.isPending && <Spinner className="h-3.5 w-3.5 !text-white" />}
          Post topic
        </button>
      </div>
    </form>
  );
}

function ThreadView({ thread, postingDisabled }: { thread: DiscussionThread; postingDisabled: boolean }) {
  const { user } = useSession();
  const [limit, setLimit] = useState(20);
  const comments = useThreadComments(thread.id, limit);
  const actions = useCommentActions(thread.id);
  const [draft, setDraft] = useState("");
  const locked = thread.status !== "OPEN";
  const canPost = !locked && !postingDisabled;

  function onPost(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || actions.add.isPending) return;
    actions.add.mutate({ content }, { onSuccess: () => setDraft("") });
  }

  const meta = comments.data?.meta;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <h3 className="font-bold text-gray-900 truncate">{thread.title}</h3>
          <p className="text-xs text-gray-400">
            Started by {personName(thread.createdBy, "a former member")} · {formatRelative(thread.createdAt)}
          </p>
        </div>
        {locked && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
            <Lock className="w-3 h-3" /> Locked
          </span>
        )}
      </div>

      {/* Comment bar */}
      {canPost && (
        <form onSubmit={onPost} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200/80 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#1E1B4B] text-white flex items-center justify-center font-bold text-sm shrink-0" aria-hidden="true">
            {user?.firstName?.charAt(0).toUpperCase()}
          </div>
          <input
            type="text"
            placeholder="Write a comment..."
            value={draft}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            className="flex-1 min-w-0 bg-[#F8FAFC] border border-gray-200 rounded-full py-2.5 px-4 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-600"
            aria-label="Write a comment"
          />
          <button
            type="submit"
            disabled={!draft.trim() || actions.add.isPending}
            className="inline-flex items-center gap-2 bg-[#2B36C8] hover:bg-blue-800 text-white font-medium text-xs px-6 py-2.5 rounded-xl transition-colors disabled:opacity-50"
          >
            {actions.add.isPending && <Spinner className="h-3.5 w-3.5 !text-white" />}
            Post
          </button>
        </form>
      )}
      {actions.add.isError && <Alert tone="error">{errorMessage(actions.add.error)}</Alert>}

      {comments.isPending ? (
        <LoadingBlock label="Loading comments…" />
      ) : comments.isError ? (
        <ErrorState error={comments.error} title="Couldn't load comments" onRetry={() => comments.refetch()} />
      ) : comments.data.data.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200/80">
          <EmptyState title="No comments yet" description={canPost ? "Be the first to write something." : undefined} />
        </div>
      ) : (
        <div className="space-y-4">
          {comments.data.data.map((c) => (
            <CommentCard key={c.id} comment={c} threadId={thread.id} canPost={canPost} />
          ))}
          {meta && meta.total > comments.data.data.length && (
            <button
              type="button"
              onClick={() => setLimit((l) => Math.min(l + 20, 100))}
              disabled={comments.isFetching || limit >= 100}
              className="w-full py-2.5 text-xs font-semibold text-blue-700 hover:text-blue-900 disabled:opacity-50"
            >
              {comments.isFetching ? "Loading…" : `Show more comments (${meta.total - comments.data.data.length} more)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CommentCard({
  comment,
  threadId,
  canPost,
  isReply = false,
}: {
  comment: DiscussionComment;
  threadId: string;
  canPost: boolean;
  isReply?: boolean;
}) {
  const { user } = useSession();
  const actions = useCommentActions(threadId);
  const [showReplies, setShowReplies] = useState(false);
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const [reporting, setReporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const replies = useReplies(comment.id, showReplies && !isReply);

  const deleted = comment.status === "DELETED" || !comment.author;
  const mine = !!user && comment.author?.id === user.id;
  const parentId = comment.parentId;

  function onReply(e: FormEvent) {
    e.preventDefault();
    if (!reply.trim() || actions.add.isPending) return;
    actions.add.mutate(
      { content: reply, parentId: comment.id },
      {
        onSuccess: () => {
          setReply("");
          setReplying(false);
          setShowReplies(true);
        },
      },
    );
  }

  function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editText.trim() || actions.edit.isPending) return;
    actions.edit.mutate({ commentId: comment.id, content: editText, parentId }, { onSuccess: () => setEditing(false) });
  }

  const busyError = actions.react.error ?? actions.edit.error ?? actions.remove.error ?? actions.add.error;

  return (
    <div className={`${isReply ? "bg-[#F8FAFC] border-gray-200/60" : "bg-white shadow-sm border-gray-200/80"} rounded-2xl p-5 border relative`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-[#0F172A] text-white flex items-center justify-center font-bold text-sm shrink-0" aria-hidden="true">
            {deleted ? "?" : comment.author!.firstName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-gray-900 text-sm">{deleted ? "Deleted" : personName(comment.author)}</span>
              {!deleted && comment.author!.role !== "STUDENT" && (
                <span className="bg-[#EFF6FF] text-[#3B82F6] text-[11px] font-semibold px-2 py-0.5 rounded-md">{ROLE_LABEL[comment.author!.role]}</span>
              )}
              {mine && <span className="bg-indigo-900 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider">You</span>}
            </div>
            <p className="text-xs text-gray-400 font-medium mt-0.5" title={formatDateTime(comment.createdAt)}>
              {formatRelative(comment.createdAt)}
              {comment.editedAt && " · edited"}
            </p>
          </div>
        </div>

        {!deleted && (
          <CommentMenu
            mine={mine}
            onEdit={() => {
              setEditText(comment.content);
              setEditing(true);
            }}
            onDelete={() => {
              if (window.confirm("Delete this comment?")) actions.remove.mutate({ commentId: comment.id, parentId });
            }}
            onReport={() => setReporting(true)}
          />
        )}
      </div>

      {editing ? (
        <form onSubmit={onSaveEdit} className="mt-4 space-y-2">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            maxLength={2000}
            rows={3}
            className="w-full bg-[#F8FAFC] border border-gray-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-600"
            aria-label="Edit comment"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="px-4 py-1.5 text-xs text-gray-600">
              Cancel
            </button>
            <button type="submit" disabled={actions.edit.isPending || !editText.trim()} className="px-4 py-1.5 text-xs font-semibold text-white bg-[#2B36C8] rounded-lg disabled:opacity-50">
              Save
            </button>
          </div>
        </form>
      ) : (
        <p className={`text-sm mt-4 leading-relaxed whitespace-pre-line ${deleted ? "italic text-gray-400" : "text-gray-700"}`}>{comment.content}</p>
      )}

      {/* Reactions and reply */}
      {!deleted && (
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {REACTIONS.map(({ type, label, icon: Icon, tone }) => {
            const count = comment.reactions[type] ?? 0;
            const active = comment.myReactions.includes(type);
            return (
              <button
                key={type}
                type="button"
                title={label}
                aria-pressed={active}
                disabled={actions.react.isPending}
                onClick={() => actions.react.mutate({ commentId: comment.id, type, parentId })}
                className={`flex items-center gap-1.5 border rounded-full px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-60 ${
                  active ? "bg-blue-50 border-blue-300 text-blue-800" : "bg-[#F1F5F9] border-gray-200/60 text-gray-700 hover:bg-gray-200/60"
                }`}
              >
                <span className={`w-4 h-4 rounded-full ${tone} flex items-center justify-center text-white`}>
                  <Icon className="w-2.5 h-2.5" />
                </span>
                {count > 0 ? count : <span className="sr-only">{label}</span>}
              </button>
            );
          })}

          {!isReply && canPost && (
            <button
              type="button"
              onClick={() => setReplying((r) => !r)}
              className="text-xs font-semibold text-gray-500 hover:text-gray-800 ml-1 transition-colors"
            >
              Reply
            </button>
          )}
          {!isReply && comment.replyCount > 0 && (
            <button
              type="button"
              onClick={() => setShowReplies((s) => !s)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 ml-1"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {showReplies ? "Hide replies" : `${comment.replyCount} ${comment.replyCount === 1 ? "reply" : "replies"}`}
            </button>
          )}
        </div>
      )}

      {busyError && <p className="mt-2 text-xs text-red-600">{errorMessage(busyError)}</p>}
      {notice && <p className="mt-2 text-xs text-green-700">{notice}</p>}

      {reporting && (
        <ReportForm
          threadId={threadId}
          commentId={comment.id}
          onDone={(msg) => {
            setReporting(false);
            if (msg) setNotice(msg);
          }}
        />
      )}

      {replying && (
        <form onSubmit={onReply} className="mt-4 flex items-center gap-2">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            maxLength={2000}
            autoFocus
            placeholder="Write a reply..."
            className="flex-1 min-w-0 bg-[#F8FAFC] border border-gray-200 rounded-full py-2 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-blue-600"
            aria-label="Write a reply"
          />
          <button type="submit" disabled={!reply.trim() || actions.add.isPending} className="px-4 py-2 text-xs font-semibold text-white bg-[#2B36C8] rounded-xl disabled:opacity-50">
            Reply
          </button>
        </form>
      )}

      {showReplies && !isReply && (
        <div className="mt-4 space-y-3 pl-4 border-l-2 border-gray-100">
          {replies.isPending ? (
            <Spinner />
          ) : replies.isError ? (
            <p className="text-xs text-red-600">{errorMessage(replies.error)}</p>
          ) : (
            replies.data.data.map((r) => <CommentCard key={r.id} comment={r} threadId={threadId} canPost={canPost} isReply />)
          )}
        </div>
      )}
    </div>
  );
}

function CommentMenu({ mine, onEdit, onDelete, onReport }: { mine: boolean; onEdit: () => void; onDelete: () => void; onReport: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const item = "w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-left hover:bg-gray-50";
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-gray-400 hover:text-gray-600 p-1 rounded-lg transition-colors"
        aria-label="Comment options"
        aria-expanded={open}
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 overflow-hidden">
          {mine ? (
            <>
              <button type="button" className={`${item} text-gray-700`} onClick={() => { setOpen(false); onEdit(); }}>
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
              <button type="button" className={`${item} text-red-600`} onClick={() => { setOpen(false); onDelete(); }}>
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </>
          ) : (
            <button type="button" className={`${item} text-gray-700`} onClick={() => { setOpen(false); onReport(); }}>
              <Flag className="w-3.5 h-3.5" /> Report
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ReportForm({ threadId, commentId, onDone }: { threadId: string; commentId: string; onDone: (msg?: string) => void }) {
  const { report } = useCommentActions(threadId);
  const [reason, setReason] = useState<ReportReason>("INAPPROPRIATE");
  const [details, setDetails] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (report.isPending) return;
    report.mutate({ commentId, reason, details }, { onSuccess: () => onDone("Thanks — an administrator will review this comment.") });
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 bg-[#F8FAFC] border border-gray-200 rounded-xl p-3 space-y-2">
      <p className="text-xs font-semibold text-gray-800">Report this comment</p>
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value as ReportReason)}
        className="w-full bg-white border border-gray-200 rounded-lg py-2 px-3 text-xs"
        aria-label="Reason"
      >
        {REPORT_REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <input
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        maxLength={1000}
        placeholder="Details (optional)"
        className="w-full bg-white border border-gray-200 rounded-lg py-2 px-3 text-xs"
        aria-label="Details"
      />
      {report.isError && <p className="text-xs text-red-600">{errorMessage(report.error)}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => onDone()} className="px-3 py-1.5 text-xs text-gray-600">
          Cancel
        </button>
        <button type="submit" disabled={report.isPending} className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg disabled:opacity-50">
          Send report
        </button>
      </div>
    </form>
  );
}
