"use client";

import Link from "next/link";
import { Bell, BookOpen, Calculator, CheckCircle2, ChevronRight, FileText, MessageSquare, Trophy } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { useCourses, useMyCourses } from "@/lib/queries/learning";
import { useMyAssignments } from "@/lib/queries/assessment";
import { useEntryAbove, useMyRank, useNotifications } from "@/lib/queries/community";
import { daysUntil, formatDate, formatNumber, formatRelative } from "@/lib/format";
import type { AppNotification, NotificationCategory, StudentAssignment } from "@/lib/api/types";
import { EmptyState, ErrorState, LoadingBlock, Spinner } from "@/app/components/ui/feedback";
import { StatusBadge, courseStyle } from "../components/studentUi";
import DeadlineCalendar from "./components/DeadlineCalendar";
import { NotificationLink } from "@/app/components/notifications/notificationUi";
import { useNow } from "@/lib/hooks/useNow";

export default function StudentDashboard() {
  const { user } = useSession();

  return (
    <div className="p-4 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* LEFT COLUMN */}
      <div className="lg:col-span-2 space-y-8 min-w-0">
        {/* Welcome Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-[#030959] p-8 text-white shadow-sm flex flex-col justify-between min-h-[220px]">
          <div className="absolute right-10 top-1/2 -translate-y-1/2 pointer-events-none opacity-20">
            <div className="w-48 h-48 border-2 border-white/40 rounded-3xl rotate-12 flex items-center justify-center bg-white/10 backdrop-blur-sm">
              <Calculator className="w-20 h-20 text-white" />
            </div>
          </div>

          <div className="relative z-10 max-w-md space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight">Welcome back, {user?.firstName}</h1>
            <p className="text-sm text-blue-100/80 leading-relaxed font-light">
              &quot;Mistakes are the steps of the ladder that lead to excellence. Keep climbing.&quot;
            </p>
          </div>

          <div className="relative z-10 mt-6 flex gap-10">
            <div>
              <p className="text-2xl font-black">{formatNumber(user?.problemsSolved)}</p>
              <p className="text-[10px] font-bold tracking-widest text-blue-200/70 uppercase">Problems Solved</p>
            </div>
            <div>
              <p className="text-2xl font-black">{formatNumber(user?.points)}</p>
              <p className="text-[10px] font-bold tracking-widest text-blue-200/70 uppercase">Points</p>
            </div>
          </div>
        </div>

        <ActiveCourses />
        <CurrentAssignments />
      </div>

      {/* RIGHT COLUMN */}
      <div className="space-y-8 min-w-0">
        <RankingCard divisionName={user?.division?.name} />
        <CalendarSection />
        <RecentAlerts />
      </div>
    </div>
  );
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-xl font-bold text-slate-800">{title}</h3>
      <Link
        href={href}
        className="text-xs font-semibold text-slate-600 bg-white/80 border border-slate-200 px-4 py-1.5 rounded-full flex items-center gap-1 hover:bg-white shadow-sm transition-colors"
      >
        View All <ChevronRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}

function ActiveCourses() {
  const courses = useCourses();
  const mine = useMyCourses();

  return (
    <div>
      <SectionHeader title="Active Courses" href="/student/courses" />
      {courses.isPending ? (
        <LoadingBlock label="Loading courses…" />
      ) : courses.isError ? (
        <ErrorState error={courses.error} title="Couldn't load your courses" onRetry={() => courses.refetch()} />
      ) : courses.data.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100">
          <EmptyState title="No courses available yet" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {courses.data.map((course) => {
            const style = courseStyle(course.code);
            const progress = mine.data?.find((m) => m.course.id === course.id);
            return (
              <Link
                key={course.id}
                href={`/student/courses/${course.id}`}
                className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between min-h-[170px] hover:shadow-lg transition-shadow"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className={`px-3.5 py-2 rounded-xl inline-block text-lg font-bold ${style.chip}`}>{style.symbol}</span>
                    {progress && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{progress.displayStatus}</span>
                    )}
                  </div>
                  <h4 className="font-bold text-slate-800 text-base">{course.title}</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">{course.description}</p>
                </div>
                <span className={`${style.button} text-white text-[11px] font-bold px-5 py-2 rounded-xl w-fit mt-4`}>
                  {progress?.status === "UNROLLED" ? "Start" : "Continue"}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function deadlineChip(a: StudentAssignment, now: number) {
  const days = daysUntil(a.deadline, now);
  if (a.status === "CLOSED" || days < 0) return { text: "Closed", tone: "bg-slate-100 text-slate-500" };
  if (!a.canSubmit) return null;
  if (days <= 3) return { text: days <= 0 ? "Due today" : `${days} day${days === 1 ? "" : "s"} left`, tone: "bg-red-50 text-red-600" };
  return { text: `${days} days left`, tone: "bg-indigo-50 text-indigo-600" };
}

function CurrentAssignments() {
  // Assignments still to act on: open and not yet reviewed, soonest deadline first.
  const query = useMyAssignments({ limit: 50 });
  const now = useNow();
  const current = (query.data?.data ?? [])
    .filter((a) => a.status === "PUBLISHED" && a.displayStatus !== "Reviewed")
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
    .slice(0, 5);

  return (
    <div>
      <SectionHeader title="Current Assignments" href="/student/assignments" />
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden p-2">
        {query.isPending ? (
          <LoadingBlock label="Loading assignments…" />
        ) : query.isError ? (
          <ErrorState error={query.error} title="Couldn't load assignments" onRetry={() => query.refetch()} />
        ) : current.length === 0 ? (
          <EmptyState title="You're all caught up" description="There are no open assignments right now." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  <th className="py-4 px-6">Assignment</th>
                  <th className="py-4 px-6">Deadline</th>
                  <th className="py-4 px-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 font-medium text-slate-700">
                {current.map((a) => {
                  const chip = deadlineChip(a, now);
                  return (
                    <tr key={a.id} className="hover:bg-slate-50/60">
                      <td className="py-4 px-6">
                        <Link href={`/student/assignments/${a.id}`} className="font-bold text-slate-800 hover:text-indigo-700">
                          {a.title}
                        </Link>
                        <div className="text-[11px] text-slate-400 mt-0.5">{a.course.title}</div>
                      </td>
                      <td className="py-4 px-6 text-slate-500 whitespace-nowrap">
                        {formatDate(a.deadline)}
                        {chip && (
                          <span className={`ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${chip.tone}`}>{chip.text}</span>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <StatusBadge status={a.displayStatus} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function RankingCard({ divisionName }: { divisionName?: string }) {
  const rank = useMyRank();
  const above = useEntryAbove(rank.data?.rank);

  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-100 flex flex-col justify-between min-h-[200px]">
      <div>
        <div className="flex items-start justify-between">
          <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            {divisionName ? `${divisionName} Division Ranking` : "Division Ranking"}
          </span>
          <Trophy className="w-10 h-10 text-purple-200 stroke-[1.2]" />
        </div>
        {rank.isPending ? (
          <div className="py-6">
            <Spinner />
          </div>
        ) : rank.isError ? (
          <p className="mt-4 text-xs text-red-600">Couldn&apos;t load your ranking.</p>
        ) : (
          <>
            <h2 className="text-5xl font-black text-[#03045e] mt-2">
              #{rank.data.rank}
              <span className="text-base font-bold text-slate-400 ml-2">of {formatNumber(rank.data.outOf)}</span>
            </h2>
            <p className="mt-4 text-xs font-medium text-slate-500">
              {rank.data.rank === 1 ? (
                <>You&apos;re at the top of your division. Keep it up!</>
              ) : above.data ? (
                <>
                  <span className="font-bold text-[#03045e]">{formatNumber(Math.max(above.data.points - rank.data.points, 0) + 1)} points</span>{" "}
                  to pass #{above.data.rank}.
                </>
              ) : (
                <>{formatNumber(rank.data.points)} points so far.</>
              )}
            </p>
          </>
        )}
      </div>
      <Link
        href="/student/leaderboard"
        className="w-full mt-6 rounded-2xl bg-[#03045e] py-3 text-xs font-semibold text-white transition-colors hover:bg-[#0b1784] text-center"
      >
        Full Leaderboard
      </Link>
    </div>
  );
}

function CalendarSection() {
  const query = useMyAssignments({ limit: 50 });
  return <DeadlineCalendar assignments={query.data?.data ?? []} />;
}

const ALERT_ICON: Record<NotificationCategory, { icon: typeof Bell; tone: string }> = {
  ASSIGNMENTS: { icon: FileText, tone: "bg-indigo-50 text-indigo-600" },
  SUBMISSIONS: { icon: CheckCircle2, tone: "bg-green-50 text-green-600" },
  REVIEWS: { icon: CheckCircle2, tone: "bg-orange-50 text-orange-600" },
  RESULTS: { icon: CheckCircle2, tone: "bg-blue-50 text-blue-600" },
  RESOURCES: { icon: BookOpen, tone: "bg-teal-50 text-teal-700" },
  DISCUSSIONS: { icon: MessageSquare, tone: "bg-purple-50 text-purple-600" },
  ACCOUNT: { icon: Bell, tone: "bg-slate-100 text-slate-600" },
};

function RecentAlerts() {
  const query = useNotifications({ limit: 5 });
  const now = useNow();

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-bold text-slate-800">Recent Alerts</h3>
        <Link href="/student/notifications" className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">
          View all
        </Link>
      </div>
      {query.isPending ? (
        <Spinner />
      ) : query.isError ? (
        <p className="text-xs text-red-600">Couldn&apos;t load your notifications.</p>
      ) : query.data.data.length === 0 ? (
        <p className="text-xs text-slate-500">No notifications yet. Updates about assignments, results and discussions will appear here.</p>
      ) : (
        <div className="space-y-4">
          {query.data.data.map((n: AppNotification) => {
            const { icon: Icon, tone } = ALERT_ICON[n.category] ?? ALERT_ICON.ACCOUNT;
            return (
              <NotificationLink key={n.id} notification={n} className="flex items-start gap-3 rounded-xl -m-1.5 p-1.5 hover:bg-slate-50 transition-colors">
                <div className={`p-2 rounded-xl shrink-0 ${tone}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h4 className={`text-xs ${n.isRead ? "font-semibold text-slate-600" : "font-bold text-slate-800"}`}>{n.title}</h4>
                  {n.body && <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>}
                  <p className="text-[10px] text-slate-400 mt-0.5">{formatRelative(n.createdAt, now)}</p>
                </div>
              </NotificationLink>
            );
          })}
        </div>
      )}
    </div>
  );
}
