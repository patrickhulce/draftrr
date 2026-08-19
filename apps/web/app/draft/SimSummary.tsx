import type { Player, PositionRoundCell } from '@draftrr/core';
import { PositionHeatmap } from './PositionHeatmap';

export function SimSummary({
  positionGrid,
  byId,
}: {
  positionGrid: PositionRoundCell[];
  byId: Map<string, Player>;
}) {
  return (
    <section className="overflow-visible rounded-xl border border-white/10 p-3">
      <h2 className="mb-2 text-sm text-white/50">Expected PPG by pick</h2>
      <PositionHeatmap cells={positionGrid} byId={byId} />
    </section>
  );
}
