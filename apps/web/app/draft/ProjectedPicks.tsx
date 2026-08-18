import { cn } from '@/lib/cn';
import type { Player, ProjectedAtNext } from '@draftrr/core';

export function ProjectedPicks({
  columns,
  byId,
}: {
  columns: ProjectedAtNext[];
  byId: Map<string, Player>;
}) {
  return (
    <section className="rounded-xl border border-white/10 p-3">
      <h2 className="mb-2 text-sm text-white/50">Projected remaining at next pick</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {columns.map((col) => (
          <div key={col.position}>
            <div className={cn('mb-1 text-xs font-medium', `pos-${col.position}`)}>
              {col.position}
            </div>
            <div className="space-y-0.5">
              {col.playerIds.length === 0 && <p className="text-[11px] text-white/30">—</p>}
              {col.playerIds.map((id) => {
                const player = byId.get(id);
                return (
                  <div key={id} className="truncate text-[11px] text-white/80">
                    {player?.name ?? id}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
