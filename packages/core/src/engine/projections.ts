import type { Player, Position } from '../types.js';
import { normalSample } from './rng.js';

export const UPSIDE_CEILING = 1.1;
export const RISK_FLOOR_PERCENTILE = 0.75;
export const RISK_UPSIDE_SCALE = 10;
const SIGMA_DIVISOR = 2;

export interface PositionProjectionBounds {
  max: number;
  floor: number;
}

export interface ProjectionRange {
  mean: number;
  min: number;
  max: number;
}

export function positionProjectionBounds(
  players: readonly Player[],
): Map<Position, PositionProjectionBounds> {
  const byPos = new Map<Position, Player[]>();
  for (const p of players) {
    const list = byPos.get(p.position);
    if (list) list.push(p);
    else byPos.set(p.position, [p]);
  }
  const out = new Map<Position, PositionProjectionBounds>();
  for (const [position, list] of byPos) {
    list.sort((a, b) => b.projectedPoints - a.projectedPoints);
    const max = list[0]!.projectedPoints;
    const rank = Math.round(RISK_FLOOR_PERCENTILE * list.length);
    const index = Math.min(list.length - 1, Math.max(0, rank - 1));
    out.set(position, { max, floor: list[index]!.projectedPoints });
  }
  return out;
}

export function projectionRange(
  player: Player,
  bounds: Map<Position, PositionProjectionBounds>,
): ProjectionRange {
  const mean = player.projectedPoints;
  const pos = bounds.get(player.position);
  if (!pos) return { mean, min: mean, max: mean };
  const risk = player.risk ?? 0;
  const upside = player.upside ?? 0;
  const hi = mean + (upside / RISK_UPSIDE_SCALE) * (UPSIDE_CEILING * pos.max - mean);
  const lo = mean + (risk / RISK_UPSIDE_SCALE) * (pos.floor - mean);
  return {
    mean,
    min: Math.min(mean, lo),
    max: Math.max(mean, hi),
  };
}

export function sampleProjectedPoints(
  player: Player,
  bounds: Map<Position, PositionProjectionBounds>,
  rng: () => number,
): number {
  const range = projectionRange(player, bounds);
  const down = range.mean - range.min;
  const up = range.max - range.mean;
  if (down <= 0 && up <= 0) return range.mean;
  const z = normalSample(0, 1, rng);
  const sigma = z >= 0 ? up / SIGMA_DIVISOR : down / SIGMA_DIVISOR;
  const drawn = range.mean + z * sigma;
  return Math.min(range.max, Math.max(range.min, drawn));
}

export function withSampledProjections(
  players: readonly Player[],
  bounds: Map<Position, PositionProjectionBounds>,
  rng: () => number,
): Player[] {
  return players.map((p) => ({
    ...p,
    projectedPoints: sampleProjectedPoints(p, bounds, rng),
  }));
}
