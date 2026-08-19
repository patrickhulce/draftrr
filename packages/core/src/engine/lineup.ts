import { PROJECTION_GAMES } from '../defaults.js';
import type { LineupResult, Player, Position, RosterSlotKind, RosterSlots } from '../types.js';

export function ppg(player: Player): number {
  return player.projectedPoints / PROJECTION_GAMES;
}

const FLEX_POS = new Set<Position>(['RB', 'WR', 'TE']);

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > arr.length) return [];
  const out: T[][] = [];
  const rec = (start: number, chosen: T[]) => {
    if (chosen.length === k) {
      out.push([...chosen]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      chosen.push(arr[i] as T);
      rec(i + 1, chosen);
      chosen.pop();
    }
  };
  rec(0, []);
  return out;
}

export function optimalLineup(players: Player[], slots: RosterSlots): LineupResult {
  const byPos: Record<Position, Player[]> = {
    QB: [],
    RB: [],
    WR: [],
    TE: [],
    DST: [],
    K: [],
  };
  for (const p of players) byPos[p.position].push(p);
  for (const pos of Object.keys(byPos) as Position[]) {
    byPos[pos].sort((a, b) => b.projectedPoints - a.projectedPoints);
  }

  const locked: Player[] = [];
  const lockedIds = new Set<string>();
  const slotsFilled: LineupResult['slotsFilled'] = {};

  const lockPos = (pos: Position, n: number) => {
    const chosen = byPos[pos].slice(0, n);
    slotsFilled[pos] = chosen.map((p) => p.id);
    for (const p of chosen) {
      locked.push(p);
      lockedIds.add(p.id);
    }
  };

  lockPos('QB', slots.QB);
  lockPos('DST', slots.DST);
  lockPos('K', slots.K);

  const rbPool = byPos.RB;
  const wrPool = byPos.WR;
  const tePool = byPos.TE;

  let bestFlex: Player[] = [];
  let bestCore: Player[] = [];
  let bestPts = -Infinity;

  const rbCombos = combinations(rbPool, Math.min(slots.RB, rbPool.length));
  if (rbCombos.length === 0 && slots.RB === 0) rbCombos.push([]);
  const wrCombos = combinations(wrPool, Math.min(slots.WR, wrPool.length));
  if (wrCombos.length === 0 && slots.WR === 0) wrCombos.push([]);
  const teCombos = combinations(tePool, Math.min(slots.TE, tePool.length));
  if (teCombos.length === 0 && slots.TE === 0) teCombos.push([]);

  const rbOptions = rbCombos.length ? rbCombos : [[]];
  const wrOptions = wrCombos.length ? wrCombos : [[]];
  const teOptions = teCombos.length ? teCombos : [[]];

  for (const rbs of rbOptions) {
    const rbIds = new Set(rbs.map((p) => p.id));
    for (const wrs of wrOptions) {
      const wrIds = new Set(wrs.map((p) => p.id));
      for (const tes of teOptions) {
        const teIds = new Set(tes.map((p) => p.id));
        const used = new Set([...rbIds, ...wrIds, ...teIds]);
        const flexPool = [...rbPool, ...wrPool, ...tePool]
          .filter((p) => FLEX_POS.has(p.position) && !used.has(p.id))
          .sort((a, b) => b.projectedPoints - a.projectedPoints);
        const flex = flexPool.slice(0, slots.FLEX);
        const pts =
          rbs.reduce((s, p) => s + ppg(p), 0) +
          wrs.reduce((s, p) => s + ppg(p), 0) +
          tes.reduce((s, p) => s + ppg(p), 0) +
          flex.reduce((s, p) => s + ppg(p), 0);
        if (pts > bestPts) {
          bestPts = pts;
          bestCore = [...rbs, ...wrs, ...tes];
          bestFlex = flex;
        }
      }
    }
  }

  slotsFilled.RB = bestCore.filter((p) => p.position === 'RB').map((p) => p.id);
  slotsFilled.WR = bestCore.filter((p) => p.position === 'WR').map((p) => p.id);
  slotsFilled.TE = bestCore.filter((p) => p.position === 'TE').map((p) => p.id);
  slotsFilled.FLEX = bestFlex.map((p) => p.id);

  const starters = [...locked, ...bestCore, ...bestFlex];
  const starterIds = new Set(starters.map((p) => p.id));
  const bench = players
    .filter((p) => !starterIds.has(p.id))
    .sort((a, b) => b.projectedPoints - a.projectedPoints);
  const starterPoints = starters
    .filter((p) => p.position !== 'DST' && p.position !== 'K')
    .reduce((s, p) => s + ppg(p), 0);
  const benchPoints = bench.reduce((s, p) => s + ppg(p), 0);

  return { starters, bench, starterPoints, benchPoints, slotsFilled };
}

export function rosterSize(slots: RosterSlots): number {
  return slots.QB + slots.RB + slots.WR + slots.TE + slots.FLEX + slots.DST + slots.K + slots.BENCH;
}

export function canDraft(roster: Player[], slots: RosterSlots, candidate: Player): boolean {
  if (roster.length >= rosterSize(slots)) return false;
  const counts: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, DST: 0, K: 0 };
  for (const p of roster) counts[p.position] += 1;
  if (candidate.position === 'QB') return counts.QB < slots.QB;
  if (candidate.position === 'TE') return counts.TE < slots.TE;
  if (candidate.position === 'DST') return counts.DST < slots.DST;
  if (candidate.position === 'K') return counts.K < slots.K;
  return true;
}

const DEDICATED: Position[] = ['QB', 'RB', 'WR', 'TE', 'DST', 'K'];

export function unfilledSlots(roster: Player[], slots: RosterSlots): RosterSlotKind[] {
  const counts: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, DST: 0, K: 0 };
  for (const p of roster) counts[p.position] += 1;

  let dedicatedUsed = 0;
  const remaining: RosterSlotKind[] = [];
  for (const pos of DEDICATED) {
    const used = Math.min(counts[pos], slots[pos]);
    dedicatedUsed += used;
    for (let i = used; i < slots[pos]; i++) remaining.push(pos);
  }

  let leftover = Math.max(0, roster.length - dedicatedUsed);
  const flexUsed = Math.min(slots.FLEX, leftover);
  leftover -= flexUsed;
  for (let i = flexUsed; i < slots.FLEX; i++) remaining.push('FLEX');
  const benchUsed = Math.min(slots.BENCH, leftover);
  for (let i = benchUsed; i < slots.BENCH; i++) remaining.push('BENCH');
  return remaining;
}

export function starterNeedScore(roster: Player[], slots: RosterSlots, candidate: Player): number {
  const counts: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, DST: 0, K: 0 };
  for (const p of roster) counts[p.position] += 1;
  const dedicated = slots[candidate.position] ?? 0;
  if (counts[candidate.position] < dedicated) return 3;
  if (
    (candidate.position === 'RB' || candidate.position === 'WR' || candidate.position === 'TE') &&
    counts.RB + counts.WR + counts.TE < slots.RB + slots.WR + slots.TE + slots.FLEX
  ) {
    return 1.5;
  }
  return 0.4;
}
