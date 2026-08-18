'use client';

import { roundsFromSlots, starterCount, type RosterSlots } from '@draftrr/core';
import { cn } from '@/lib/cn';

const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'DST', 'K', 'BENCH'] as const;

const SLOT_MAX: Record<(typeof SLOT_ORDER)[number], number> = {
  QB: 4,
  RB: 8,
  WR: 8,
  TE: 4,
  FLEX: 6,
  DST: 3,
  K: 3,
  BENCH: 12,
};

export function RosterSlotsField({
  slots,
  onChange,
}: {
  slots: RosterSlots;
  onChange: (next: RosterSlots) => void;
}) {
  const rounds = roundsFromSlots(slots);
  const starters = starterCount(slots);

  const setSlot = (key: (typeof SLOT_ORDER)[number], value: number) => {
    const max = SLOT_MAX[key];
    const next = Math.max(0, Math.min(max, Number.isFinite(value) ? Math.round(value) : 0));
    onChange({ ...slots, [key]: next });
  };

  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="text-sm">Roster construction</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SLOT_ORDER.map((key) => (
          <div key={key} className="space-y-1 text-xs text-white/60">
            <span className={cn(key !== 'FLEX' && key !== 'BENCH' && `pos-${key}`)}>{key}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="h-8 w-8 rounded-md border border-white/10 text-sm hover:bg-white/5"
                onClick={() => setSlot(key, slots[key] - 1)}
                aria-label={`Decrease ${key}`}
              >
                −
              </button>
              <input
                type="number"
                min={0}
                max={SLOT_MAX[key]}
                className="w-full rounded-md border border-white/10 bg-ink-800 px-2 py-1.5 text-center text-sm text-white"
                value={slots[key]}
                onChange={(e) => setSlot(key, Number(e.target.value))}
                aria-label={key}
              />
              <button
                type="button"
                className="h-8 w-8 rounded-md border border-white/10 text-sm hover:bg-white/5"
                onClick={() => setSlot(key, slots[key] + 1)}
                aria-label={`Increase ${key}`}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-white/50">
        {rounds} rounds · {starters} starters + {slots.BENCH} bench
      </p>
    </div>
  );
}
