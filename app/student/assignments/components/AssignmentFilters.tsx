'use client';

import React, { useState, useRef, useEffect, type ReactNode } from 'react';
import { Check } from 'lucide-react';

/** Dropdown button used for "Filters" and "Sort By" (original filter dropdown design). */
export default function AssignmentFilters<T extends string>({
  label,
  icon,
  options,
  value,
  onChange,
}: {
  label: string;
  icon: ReactNode;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const current = options.find((o) => o.value === value);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 shadow-sm transition"
      >
        {icon}
        {label}
        {current && options[0]?.value !== value && <span className="text-indigo-600">· {current.label}</span>}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1.5 overflow-hidden" role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={value === option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-bold transition-colors ${
                value === option.value ? 'text-gray-900 bg-gray-100' : 'text-gray-800 hover:bg-gray-50'
              }`}
            >
              {option.label}
              {value === option.value && <Check className="w-3.5 h-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
