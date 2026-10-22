import { useState } from 'react';
import { Input } from './ui';

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Month or custom date-range picker for reports. Returns the API params
 * ({ month } or { from, to }), a stable query string for reloads, and the picker UI.
 */
export function usePeriod(rangeHint = 'Custom date range (e.g. a quarter)') {
  const [month, setMonth] = useState(thisMonth());
  const [range, setRange] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const params: Record<string, string> = range && from && to ? { from, to } : { month };
  const query = new URLSearchParams(params).toString();

  const picker = (
    <div className="flex flex-wrap items-end gap-3">
      {!range ? (
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Month</span>
          <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-44" aria-label="Month" />
        </label>
      ) : (
        <>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">From</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">To</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          </label>
        </>
      )}
      <button onClick={() => setRange(!range)} className="pb-2 text-sm font-medium text-brand-600 hover:underline">
        {range ? 'Pick a month instead' : rangeHint}
      </button>
    </div>
  );

  return { params, query, month, picker };
}
