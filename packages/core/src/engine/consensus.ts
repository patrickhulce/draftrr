import type { Player } from '../types.js';

export function rankSources(player: Player, ourRank: number | undefined): number[] {
  const vals: number[] = [];
  if (ourRank != null) vals.push(ourRank);
  if (player.adp > 0) vals.push(player.adp);
  if (player.ballersRank != null) vals.push(player.ballersRank);
  return vals;
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((sum, x) => sum + x, 0) / xs.length;
}

/** Sample standard deviation; 0 when fewer than two values. */
export function sampleStdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((sum, x) => sum + (x - m) ** 2, 0) / (xs.length - 1));
}

export function consensusStats(
  player: Player,
  ourRank: number | undefined,
): { mean: number; stdev: number } {
  const xs = rankSources(player, ourRank);
  if (xs.length === 0) return { mean: 999, stdev: 0 };
  return { mean: mean(xs), stdev: sampleStdev(xs) };
}
