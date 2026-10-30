import { useState } from 'react';
import { Ruler } from 'lucide-react';
import { Input, Select } from './ui';
import { areaOf, LENGTH_UNITS, unitLabel, type LengthUnit } from '../lib/units';

const LENGTH_KEY = 'inwoice_size_unit';
const lastLengthUnit = (): LengthUnit => {
  try {
    const v = localStorage.getItem(LENGTH_KEY);
    return v && v in LENGTH_UNITS ? (v as LengthUnit) : 'in';
  } catch {
    return 'in';
  }
};

/**
 * Width × height × copies → square feet (or square metres) for jobs priced by area, e.g.
 * 24 × 36 in × 2 = 12.00 sq ft at ₹80/sq ft. Calls `onArea` on every change.
 */
export function SizeCalculator({
  target,
  onArea,
  compact,
  roundUpTo = 0,
}: {
  target: 'sqft' | 'sqm';
  /** Round each job's area up to this step (Settings › Invoicing), e.g. 0.25 sq ft. */
  roundUpTo?: number;
  onArea: (r: { quantity: number; details: string } | null) => void;
  compact?: boolean;
}) {
  const [size, setSize] = useState({ width: '', height: '', lengthUnit: lastLengthUnit(), copies: '1' });

  const update = (patch: Partial<typeof size>) => {
    const next = { ...size, ...patch };
    setSize(next);
    if (patch.lengthUnit) {
      try {
        localStorage.setItem(LENGTH_KEY, patch.lengthUnit);
      } catch {
        /* not remembered */
      }
    }
    const w = Number(next.width);
    const h = Number(next.height);
    const c = Math.max(1, Math.floor(Number(next.copies) || 1));
    onArea(w > 0 && h > 0 ? areaOf({ width: w, height: h, lengthUnit: next.lengthUnit, copies: c }, target, roundUpTo) : null);
  };

  const w = Number(size.width);
  const h = Number(size.height);
  const sizeNow = { width: w, height: h, lengthUnit: size.lengthUnit, copies: Math.max(1, Math.floor(Number(size.copies) || 1)) };
  const preview = w > 0 && h > 0 ? areaOf(sizeNow, target, roundUpTo) : null;
  const exact = w > 0 && h > 0 ? areaOf(sizeNow, target) : null;

  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-2 py-2 text-sm ${compact ? '' : 'mt-2'}`}>
      <Ruler size={14} className="text-slate-400" />
      <span className="text-xs text-slate-500">Size</span>
      <Input aria-label="Width" type="number" min={0} step="any" inputMode="decimal" value={size.width} onChange={(e) => update({ width: e.target.value })} placeholder="W" className="w-20" />
      <span className="text-slate-400">×</span>
      <Input aria-label="Height" type="number" min={0} step="any" inputMode="decimal" value={size.height} onChange={(e) => update({ height: e.target.value })} placeholder="H" className="w-20" />
      <Select aria-label="Size unit" value={size.lengthUnit} onChange={(e) => update({ lengthUnit: e.target.value as LengthUnit })} className="w-20">
        {Object.keys(LENGTH_UNITS).map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </Select>
      <span className="text-slate-400">×</span>
      <Input aria-label="Copies" type="number" min={1} step={1} inputMode="numeric" value={size.copies} onChange={(e) => update({ copies: e.target.value })} className="w-16" title="Copies" />
      <span className="text-xs text-slate-500">copies</span>
      {preview && (
        <span className="ml-auto font-medium tabular-nums text-slate-700" data-testid="size-result">
          = {preview.quantity.toFixed(2)} {unitLabel(target)}
          {exact && exact.quantity !== preview.quantity && <span className="ml-1 text-xs font-normal text-slate-500">(rounded up from {exact.quantity.toFixed(2)})</span>}
        </span>
      )}
    </div>
  );
}
