'use client';

/** Whole-number score from 0 to the assignment's maximum marks. */
export default function ScoreInput({
  value,
  onChange,
  maxScore,
  disabled,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  maxScore: number;
  disabled: boolean;
  error?: string;
}) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100/50">
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Score</h2>
      <div className="inline-flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={maxScore}
          step={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`Score out of ${maxScore}`}
          className="w-20 text-center font-bold text-xl text-gray-900 bg-white border border-gray-200 rounded-md py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
        />
        <span className="text-xl font-semibold text-gray-400">/ {maxScore}</span>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
