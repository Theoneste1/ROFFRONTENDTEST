'use client';

import React, { useState } from 'react';
import { useSession } from '@/lib/auth/session';
import { useEntryAbove, useLeaderboard, useMyRank, useSchoolLeaderboard } from '@/lib/queries/community';
import { formatNumber } from '@/lib/format';
import type { LeaderboardEntry } from '@/lib/api/types';
import { EmptyState, ErrorState, LoadingBlock } from '@/app/components/ui/feedback';
import Pagination from '@/app/components/ui/Pagination';
import LeaderboardFilter, { type LeaderboardView } from './LeaderboardFilter';
import { divisionLabel } from '../../components/studentUi';

const PAGE_SIZE = 20;

const PODIUM = [
  { place: 0, label: '1st', accent: 'border-amber-400', order: 'order-1 md:order-2', height: '', isFirst: true },
  { place: 1, label: '2nd', accent: 'border-slate-300', order: 'order-2 md:order-1', height: 'md:pt-10', isFirst: false },
  { place: 2, label: '3rd', accent: 'border-orange-400', order: 'order-3 md:order-3', height: 'md:pt-12', isFirst: false },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function LeaderboardContent() {
  const { user } = useSession();
  const [view, setView] = useState<LeaderboardView>('students');

  return (
    <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 font-sans text-slate-800">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Leaderboard</h1>
          <p className="text-sm text-slate-500">
            See how you rank against your peers{user?.division ? ` · ${divisionLabel(user.division)}` : ''}
          </p>
        </div>
        <LeaderboardFilter value={view} onChange={setView} />
      </div>

      {view === 'students' ? <StudentsBoard /> : <SchoolsBoard />}
    </div>
  );
}

function StudentsBoard() {
  const [page, setPage] = useState(1);
  const board = useLeaderboard({ page, limit: PAGE_SIZE });
  const firstPage = useLeaderboard({ page: 1, limit: PAGE_SIZE });
  const me = useMyRank();
  const above = useEntryAbove(me.data?.rank);

  const top = (firstPage.data?.data ?? []).slice(0, 3);
  // Page 1 starts below the podium.
  const rows = page === 1 ? (board.data?.data ?? []).slice(top.length) : (board.data?.data ?? []);

  // Progress towards the student directly above (by points).
  let milestone: { text: string; pct: number } | null = null;
  if (me.data) {
    if (me.data.rank === 1) milestone = { text: 'Top of the division', pct: 100 };
    else if (above.data) {
      const gap = Math.max(above.data.points - me.data.points, 0) + 1;
      milestone = {
        text: `${formatNumber(gap)} to pass #${above.data.rank}`,
        pct: above.data.points > 0 ? Math.min(100, Math.round((me.data.points / above.data.points) * 100)) : 0,
      };
    }
  }

  if (board.isPending || firstPage.isPending) return <LoadingBlock label="Loading leaderboard…" />;
  if (board.isError) return <ErrorState error={board.error} title="Couldn't load the leaderboard" onRetry={() => board.refetch()} />;
  if (board.data.meta.total === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100">
        <EmptyState title="No rankings yet" description="Points are awarded when results are published." />
      </div>
    );
  }

  return (
    <>
      {/* Podium */}
      {top.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end pt-8 pb-4">
          {PODIUM.map((slot) => {
            const entry: LeaderboardEntry | undefined = top[slot.place];
            if (!entry) return <div key={slot.label} className={slot.order} />;
            return (
              <div key={entry.id} className={`flex flex-col items-center ${slot.order} ${slot.height}`}>
                <div className="relative mb-3">
                  <div
                    className={`w-20 h-20 md:w-24 md:h-24 rounded-full p-1 border-4 ${slot.accent} overflow-hidden shadow-md bg-gradient-to-tr from-pink-400 via-purple-400 to-indigo-400 flex items-center justify-center`}
                  >
                    <span className="text-2xl font-black text-white">{initials(entry.displayName)}</span>
                  </div>
                  {slot.isFirst && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-white p-1 rounded-full shadow-sm" aria-hidden="true">
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div
                  className={`w-full bg-slate-50/80 backdrop-blur border border-slate-100 rounded-2xl p-4 flex flex-col items-center shadow-sm text-center ${
                    slot.isFirst ? 'bg-amber-50/30 border-amber-200 ring-2 ring-amber-400/20 py-6' : ''
                  } ${entry.isMe ? 'ring-2 ring-indigo-400' : ''}`}
                >
                  <span className="text-[10px] tracking-wider uppercase font-extrabold text-amber-600 bg-amber-100/80 px-2.5 py-0.5 rounded-full mb-2">
                    #{entry.rank}
                  </span>
                  <h3 className="font-bold text-slate-800 text-base">
                    {entry.displayName}
                    {entry.isMe && ' (You)'}
                  </h3>
                  {entry.school && <p className="text-[11px] text-slate-400">{entry.school.name}</p>}
                  <div className="mt-1">
                    <span className="text-xl font-black text-indigo-600 block">{formatNumber(entry.points)}</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Points</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Your status */}
      <div className="bg-[#0b1329] text-white rounded-2xl p-4 md:px-8 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        {me.isError ? (
          <p className="text-sm text-slate-300">Couldn&apos;t load your rank.</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Current Rank</span>
              <span className="text-2xl font-extrabold text-white">{me.data ? `#${me.data.rank}` : '—'}</span>
              {me.data && <span className="text-xs text-slate-400">of {formatNumber(me.data.outOf)}</span>}
            </div>
            <div className="h-8 w-[1px] bg-slate-800 hidden md:block" />
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Points</span>
              <span className="text-2xl font-extrabold text-white">{formatNumber(me.data?.points)}</span>
            </div>
            <div className="h-8 w-[1px] bg-slate-800 hidden md:block" />
            <div className="flex items-center gap-4 w-full md:w-auto">
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Next Milestone</span>
                <span className="text-xs text-slate-300">{milestone?.text ?? '—'}</span>
              </div>
              <div className="w-24 bg-slate-800 h-2 rounded-full overflow-hidden">
                <div className="bg-indigo-500 h-full" style={{ width: `${milestone?.pct ?? 0}%` }} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Rankings */}
      <div className="bg-indigo-50/50 rounded-2xl p-2 sm:p-4 border border-indigo-100/50">
        <div className="grid grid-cols-12 px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">
          <div className="col-span-2">Rank</div>
          <div className="col-span-7 sm:col-span-8">Name</div>
          <div className="col-span-3 sm:col-span-2 text-right">Points</div>
        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">Everyone in your division is on the podium.</p>
        ) : (
          <div className={`space-y-1 ${board.isFetching ? 'opacity-70' : ''}`}>
            {rows.map((row) => (
              <div
                key={row.id}
                className={`grid grid-cols-12 items-center px-4 py-3 rounded-xl text-sm transition-colors ${
                  row.isMe ? 'bg-indigo-100/70 border border-indigo-200/80 font-bold text-indigo-950' : 'bg-white/60 hover:bg-white text-slate-700'
                }`}
              >
                <div className="col-span-2 font-bold text-slate-900">{String(row.rank).padStart(2, '0')}</div>
                <div className="col-span-7 sm:col-span-8 flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-400 via-purple-400 to-indigo-400 flex items-center justify-center text-white text-xs font-bold shadow-sm shrink-0">
                    {initials(row.displayName)}
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate">{row.displayName}</span>
                    {row.isMe && <span className="bg-indigo-900 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider">You</span>}
                    {row.school && <span className="hidden sm:inline text-[11px] font-normal text-slate-400 truncate">{row.school.name}</span>}
                  </div>
                </div>
                <div className="col-span-3 sm:col-span-2 text-right font-bold text-indigo-600">{formatNumber(row.points)}</div>
              </div>
            ))}
          </div>
        )}

        <Pagination page={page} totalPages={board.data.meta.totalPages} total={board.data.meta.total} onPage={setPage} disabled={board.isFetching} />
      </div>
    </>
  );
}

function SchoolsBoard() {
  const [page, setPage] = useState(1);
  const board = useSchoolLeaderboard({ page, limit: PAGE_SIZE });
  const { user } = useSession();

  if (board.isPending) return <LoadingBlock label="Loading school rankings…" />;
  if (board.isError) return <ErrorState error={board.error} title="Couldn't load school rankings" onRetry={() => board.refetch()} />;
  if (board.data.data.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100">
        <EmptyState title="No school rankings yet" />
      </div>
    );
  }

  return (
    <div className="bg-indigo-50/50 rounded-2xl p-2 sm:p-4 border border-indigo-100/50">
      <div className="grid grid-cols-12 px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">
        <div className="col-span-2">Rank</div>
        <div className="col-span-6">School</div>
        <div className="col-span-2 text-right hidden sm:block">Students</div>
        <div className="col-span-4 sm:col-span-2 text-right">Points</div>
      </div>
      <div className={`space-y-1 ${board.isFetching ? 'opacity-70' : ''}`}>
        {board.data.data.map((s) => {
          const mine = user?.school?.id === s.schoolId;
          return (
            <div
              key={s.schoolId}
              className={`grid grid-cols-12 items-center px-4 py-3 rounded-xl text-sm ${
                mine ? 'bg-indigo-100/70 border border-indigo-200/80 font-bold text-indigo-950' : 'bg-white/60 hover:bg-white text-slate-700'
              }`}
            >
              <div className="col-span-2 font-bold text-slate-900">{String(s.rank).padStart(2, '0')}</div>
              <div className="col-span-6 min-w-0">
                <span className="block truncate">
                  {s.schoolName}
                  {mine && <span className="ml-2 bg-indigo-900 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider">Yours</span>}
                </span>
                <span className="block text-[11px] font-normal text-slate-400 truncate">{s.schoolLocation}</span>
              </div>
              <div className="col-span-2 text-right hidden sm:block">{formatNumber(s.studentCount)}</div>
              <div className="col-span-4 sm:col-span-2 text-right font-bold text-indigo-600">
                {formatNumber(s.totalPoints)}
                <span className="block text-[10px] font-normal text-slate-400">avg {formatNumber(Math.round(s.averagePoints))}</span>
              </div>
            </div>
          );
        })}
      </div>
      <Pagination page={page} totalPages={board.data.meta.totalPages} total={board.data.meta.total} onPage={setPage} disabled={board.isFetching} />
    </div>
  );
}
