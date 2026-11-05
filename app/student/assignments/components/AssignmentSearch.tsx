'use client';

import React, { useEffect, useRef } from 'react';
import { Search } from 'lucide-react';

/** Search box; Ctrl/⌘ + K focuses it. */
export default function AssignmentSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="relative w-full sm:w-80">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={100}
        placeholder="Search assignments..."
        aria-label="Search assignments"
        className="w-full pl-9 pr-12 py-2 bg-gray-50 border border-gray-200 rounded-full text-xs outline-none focus:ring-2 focus:ring-blue-300 focus:bg-white transition-all"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 border border-gray-200 rounded px-1.5 py-0.5 text-[10px] text-gray-400 font-mono" aria-hidden="true">
        ⌘ K
      </span>
    </div>
  );
}
