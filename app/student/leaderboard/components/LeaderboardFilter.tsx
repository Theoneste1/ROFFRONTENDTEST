'use client';

import React from 'react';

export type LeaderboardView = 'students' | 'schools';

/** Students / Schools toggle (division leaderboards; study groups are switched off in the backend). */
export default function LeaderboardFilter({ value, onChange }: { value: LeaderboardView; onChange: (v: LeaderboardView) => void }) {
  const btn = (v: LeaderboardView, label: string) => (
    <button
      type="button"
      onClick={() => onChange(v)}
      aria-pressed={value === v}
      className={`px-5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
        value === v ? 'bg-[#0f172a] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="bg-slate-100 p-1 rounded-full flex items-center w-fit self-start sm:self-auto border border-slate-200">
      {btn('students', 'Students')}
      {btn('schools', 'Schools')}
    </div>
  );
}
