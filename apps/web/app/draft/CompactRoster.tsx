import { cn } from '@/lib/cn';
import type { LineupResult, Player, RosterSlots } from '@draftrr/core';

function padIds(ids: string[] | undefined, count: number): (string | null)[] {
  const list = ids ?? [];
  return Array.from({ length: Math.max(count, 0) }, (_, i) => list[i] ?? null);
}

function SlotCell({ player }: { player: Player | undefined }) {
  if (!player) {
    return <div className="truncate text-[11px] leading-4 text-white/20">—</div>;
  }
  return (
    <div className="truncate text-[11px] leading-4" title={player.name}>
      <span className={cn('mr-1', `pos-${player.position}`)}>{player.position}</span>
      {player.name}
    </div>
  );
}

function Column({
  label,
  ids,
  byId,
}: {
  label: string;
  ids: (string | null)[];
  byId: Map<string, Player>;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-white/40">{label}</div>
      <div className="space-y-0.5">
        {ids.map((id, i) => (
          <SlotCell key={`${label}-${i}`} player={id ? byId.get(id) : undefined} />
        ))}
      </div>
    </div>
  );
}

export function CompactRoster({
  slots,
  slotsFilled,
  benchIds,
  byId,
  testId,
}: {
  slots: RosterSlots;
  slotsFilled: LineupResult['slotsFilled'];
  benchIds: string[];
  byId: Map<string, Player>;
  testId?: string;
}) {
  const dstK = [...(slotsFilled.DST ?? []), ...(slotsFilled.K ?? [])];
  const dstKSet = new Set(dstK);
  const benchCol = [...dstK, ...benchIds.filter((id) => !dstKSet.has(id))];

  return (
    <div data-testid={testId} className="grid grid-cols-5 gap-2">
      <Column label="RB" ids={padIds(slotsFilled.RB, slots.RB)} byId={byId} />
      <Column label="WR" ids={padIds(slotsFilled.WR, slots.WR)} byId={byId} />
      <Column label="FLEX" ids={padIds(slotsFilled.FLEX, slots.FLEX)} byId={byId} />
      <Column
        label="QB/TE"
        ids={[...padIds(slotsFilled.QB, slots.QB), ...padIds(slotsFilled.TE, slots.TE)]}
        byId={byId}
      />
      <Column
        label="BENCH"
        ids={padIds(benchCol, Math.max(slots.BENCH, benchCol.length))}
        byId={byId}
      />
    </div>
  );
}
