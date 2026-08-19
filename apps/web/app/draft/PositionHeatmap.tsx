import type { Player, Position, PositionRoundCell } from '@draftrr/core';
import { cn } from '@/lib/cn';

const ROW_POS: Position[] = ['RB', 'WR', 'QB', 'TE'];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function heatBackground(value: number | null, min: number, max: number): string | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  if (max <= min) return 'rgba(94, 196, 138, 0.35)';
  const t = (value - min) / (max - min);
  const from = t < 0.5 ? [220, 70, 70] : [230, 200, 70];
  const to = t < 0.5 ? [230, 200, 70] : [94, 196, 138];
  const u = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  const r = Math.round(lerp(from[0]!, to[0]!, u));
  const g = Math.round(lerp(from[1]!, to[1]!, u));
  const b = Math.round(lerp(from[2]!, to[2]!, u));
  return `rgba(${r}, ${g}, ${b}, 0.42)`;
}

function columnRange(cells: PositionRoundCell[], pickIndex: number): { min: number; max: number } {
  const values = cells
    .filter((c) => c.pickIndex === pickIndex && !c.locked && c.expectedPpg != null)
    .map((c) => c.expectedPpg as number);
  if (values.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...values), max: Math.max(...values) };
}

export function PositionHeatmap({
  cells,
  byId,
}: {
  cells: PositionRoundCell[];
  byId: Map<string, Player>;
}) {
  const columns = Math.max(0, ...cells.map((c) => c.pickIndex + 1));
  if (columns === 0) return null;
  const lockedByCol = Array.from({ length: columns }, (_, i) =>
    cells.some((c) => c.pickIndex === i && c.locked),
  );

  return (
    <div
      className="grid min-w-[28rem] gap-1"
      style={{ gridTemplateColumns: `3.5rem repeat(${columns}, minmax(0, 1fr))` }}
    >
      <div />
      {Array.from({ length: columns }, (_, i) => (
        <div
          key={`h-${i}`}
          className={cn(
            'text-center text-[10px] uppercase tracking-wide',
            lockedByCol[i] ? 'text-white/25' : 'text-white/40',
          )}
        >
          Pick {i + 1}
        </div>
      ))}
      {ROW_POS.map((position) => (
        <Row
          key={position}
          position={position}
          columns={columns}
          cells={cells.filter((c) => c.position === position)}
          allCells={cells}
          byId={byId}
        />
      ))}
    </div>
  );
}

function Row({
  position,
  columns,
  cells,
  allCells,
  byId,
}: {
  position: Position;
  columns: number;
  cells: PositionRoundCell[];
  allCells: PositionRoundCell[];
  byId: Map<string, Player>;
}) {
  return (
    <>
      <div className={cn('self-center text-xs font-medium', `pos-${position}`)}>{position}</div>
      {Array.from({ length: columns }, (_, pickIndex) => {
        const cell = cells.find((c) => c.pickIndex === pickIndex);
        const { min, max } = columnRange(allCells, pickIndex);
        return (
          <HeatCell key={`${position}-${pickIndex}`} cell={cell} min={min} max={max} byId={byId} />
        );
      })}
    </>
  );
}

function HeatCell({
  cell,
  min,
  max,
  byId,
}: {
  cell: PositionRoundCell | undefined;
  min: number;
  max: number;
  byId: Map<string, Player>;
}) {
  const locked = Boolean(cell?.locked);
  const empty = !cell || cell.expectedPpg == null || cell.count === 0;
  const lockedPlayer = locked && !empty ? byId.get(cell.topPlayers[0]?.playerId ?? '') : undefined;
  const label = locked
    ? (lockedPlayer?.name ?? (empty ? '—' : cell.topPlayers[0]?.playerId))
    : empty
      ? '—'
      : cell.expectedPpg!.toFixed(1);

  return (
    <div className="group relative">
      <div
        className={cn(
          'rounded-md px-1 py-2 text-center text-[11px]',
          locked
            ? 'bg-white/10 text-white/45'
            : empty
              ? 'text-white/25'
              : 'font-mono text-white/90',
          locked && !empty && 'truncate',
        )}
        style={
          locked || empty ? undefined : { background: heatBackground(cell.expectedPpg, min, max) }
        }
        title={lockedPlayer?.name}
      >
        {label}
      </div>
      {!locked && !empty && cell.topPlayers.length > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-full z-20 hidden w-56 -translate-x-1/2 pt-1 group-hover:block">
          <div className="rounded-lg border border-white/15 bg-ink-900 p-2 shadow-lg">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-white/40">
              Players at this pick
            </div>
            <ul className="space-y-1">
              {cell.topPlayers.map((row) => (
                <li
                  key={row.playerId}
                  className="flex items-baseline justify-between gap-2 text-[11px]"
                >
                  <span className="truncate text-white/80">
                    {byId.get(row.playerId)?.name ?? row.playerId}
                    <span className="ml-1 text-white/35">{row.count}</span>
                  </span>
                  <span className="shrink-0 font-mono text-field-400">
                    {row.expectedPpg.toFixed(1)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
