import {
  ANALYSIS_STRATEGIES,
  type AnalysisRequest,
  type AnalysisResult,
  type AnalysisStrategyId,
  type AnalysisStrategySummary,
  type LineupResult,
  type Player,
  type Position,
} from '../types.js';
import { DEFAULT_INNER_SIMS, DEFAULT_OUTER_SIMS, DEFAULT_TEMPERATURE } from '../defaults.js';
import { consensusStats } from './consensus.js';
import { optimalLineup } from './lineup.js';
import { positionProjectionBounds, withSampledProjections } from './projections.js';
import { createRng } from './rng.js';
import { pickOrder, slotForPick } from './snake.js';
import {
  BRANCH_POS,
  REC_PICKS,
  bestAtPos,
  closestToTarget,
  cloneRosters,
  drawCpuBoard,
  evaluatePositionBranches,
  isGridPos,
  medianValue,
  pickCpu,
  positionsFromBag,
  rankIndexOf,
  skillPickCount,
  slotBags,
  userPick,
} from './simulate.js';

export interface StrategyPick {
  pickNo: number;
  position: Position;
}

export function classifyStrategies(
  picks: readonly StrategyPick[],
  teams: number,
): AnalysisStrategyId[] {
  const ids: AnalysisStrategyId[] = [];
  const early: Position[] = [];
  let round1: Position | undefined;
  let round2: Position | undefined;
  for (const pick of picks) {
    const round = slotForPick(pick.pickNo, teams, 'linear').round;
    if (round === 1) round1 = pick.position;
    else if (round === 2) round2 = pick.position;
    if (round >= 1 && round <= 4) early.push(pick.position);
  }
  if (round1 && round2) {
    if (round1 === 'RB' && round2 === 'RB') ids.push('doubleRb');
    const pair = new Set([round1, round2]);
    if (pair.size === 2 && pair.has('RB') && pair.has('WR')) ids.push('balanced');
  }
  if (early.includes('TE')) ids.push('earlyTe');
  if (early.includes('QB')) ids.push('earlyQb');
  return ids;
}

type AnalysisOutcome = {
  ppg: number;
  playerIds: string[];
  positions: Position[];
  slotsFilled: LineupResult['slotsFilled'];
  benchIds: string[];
  strategies: AnalysisStrategyId[];
};

function argmaxPosition(
  evals: Map<Position, { expectedPpg: number; pickPlayerId: string | null }>,
): Position | undefined {
  let best: Position | undefined;
  let bestPpg = -Infinity;
  for (const position of BRANCH_POS) {
    const row = evals.get(position);
    if (!row) continue;
    if (row.expectedPpg > bestPpg) {
      bestPpg = row.expectedPpg;
      best = position;
    }
  }
  return best;
}

function summarizeStrategy(
  id: AnalysisStrategyId,
  matched: AnalysisOutcome[],
): AnalysisStrategySummary {
  if (matched.length === 0) {
    return { id, count: 0, medianPpg: 0, medianRoster: null, ppgSamples: [] };
  }
  const ppgSamples = matched.map((o) => o.ppg);
  const medianPpg = medianValue(ppgSamples);
  const representative = closestToTarget(matched, medianPpg)!;
  return {
    id,
    count: matched.length,
    medianPpg,
    medianRoster: {
      slotsFilled: representative.slotsFilled,
      benchIds: representative.benchIds,
      playerIds: representative.playerIds,
    },
    ppgSamples,
  };
}

function usesNestedPick(roster: Player[], slots: AnalysisRequest['settings']['slots']): boolean {
  if (skillPickCount(roster) >= REC_PICKS) return false;
  const bags = slotBags(roster, slots);
  const first = bags[0];
  if (!first) return false;
  return first.some((kind) => kind !== 'DST' && kind !== 'K' && kind !== 'BENCH');
}

export function runAnalysis(
  req: AnalysisRequest,
  onProgress?: (done: number, total: number) => void,
): AnalysisResult {
  const outerSims = req.outerSims > 0 ? req.outerSims : DEFAULT_OUTER_SIMS;
  const innerSims = req.innerSims > 0 ? req.innerSims : DEFAULT_INNER_SIMS;
  const temperature =
    req.temperature && req.temperature > 0 ? req.temperature : DEFAULT_TEMPERATURE;
  const { settings, mySlot } = req;
  const rankIndex = rankIndexOf(req.rankingPlayerIds);
  const stats = new Map<string, { mean: number; stdev: number }>();
  for (const p of req.players) {
    stats.set(p.id, consensusStats(p, rankIndex.get(p.id)));
  }

  const totalPicks = settings.teams * settings.rounds;
  const order = pickOrder(settings.teams, settings.rounds, settings.draftType);
  const rng = createRng(req.seed);
  const projectionBounds = req.stochasticProjections ? positionProjectionBounds(req.players) : null;

  const emptyRosters = (): Map<number, Player[]> => {
    const rosters = new Map<number, Player[]>();
    for (let slot = 1; slot <= settings.teams; slot++) rosters.set(slot, []);
    return rosters;
  };

  const outcomes: AnalysisOutcome[] = [];

  for (let s = 0; s < outerSims; s++) {
    const players = projectionBounds
      ? withSampledProjections(req.players, projectionBounds, rng)
      : req.players;
    const remaining = new Map(players.map((p) => [p.id, p]));
    const teamRosters = emptyRosters();
    const board = drawCpuBoard([...remaining.values()], stats, rng);
    const myPicks: StrategyPick[] = [];
    const mySkillIds: string[] = [];
    const mySkillPos: Position[] = [];

    for (let pickNo = 1; pickNo <= totalPicks; pickNo++) {
      if (remaining.size === 0) break;
      const slot = order[pickNo - 1] ?? 1;
      const roster = teamRosters.get(slot) ?? [];
      let chosen: Player | undefined;
      if (slot === mySlot) {
        if (usesNestedPick(roster, settings.slots)) {
          const bags = slotBags(roster, settings.slots);
          const open = positionsFromBag(bags[0] ?? [], roster, settings.slots).filter((position) =>
            BRANCH_POS.includes(position),
          );
          if (open.length > 1) {
            const evals = evaluatePositionBranches({
              positions: open,
              innerSims,
              alreadyMine: roster,
              pool: [...remaining.values()],
              initialRosters: cloneRosters(teamRosters),
              order,
              currentPickNo: pickNo,
              totalPicks,
              mySlot,
              slots: settings.slots,
              rankIndex,
              stats,
              rng,
              temperature,
            });
            const pos = argmaxPosition(evals);
            if (pos) chosen = bestAtPos(remaining, roster, rankIndex, settings.slots, pos);
          }
        }
        if (!chosen) {
          chosen = userPick(
            remaining,
            roster,
            rankIndex,
            settings.slots,
            rng,
            board,
            pickNo,
            mySlot,
            order,
            temperature,
          );
        }
        if (chosen) {
          myPicks.push({ pickNo, position: chosen.position });
          if (isGridPos(chosen.position)) {
            mySkillIds.push(chosen.id);
            mySkillPos.push(chosen.position);
          }
        }
      } else {
        chosen = pickCpu(board, remaining, roster, settings.slots);
      }
      if (!chosen) break;
      roster.push(chosen);
      teamRosters.set(slot, roster);
      remaining.delete(chosen.id);
    }

    const mine = teamRosters.get(mySlot) ?? [];
    const lineup = optimalLineup(mine, settings.slots);
    outcomes.push({
      ppg: lineup.starterPoints,
      playerIds: mySkillIds,
      positions: mySkillPos,
      slotsFilled: lineup.slotsFilled,
      benchIds: lineup.bench.map((p) => p.id),
      strategies: classifyStrategies(myPicks, settings.teams),
    });
    onProgress?.(s + 1, outerSims);
  }

  const ppgSamples = outcomes.map((o) => o.ppg);
  return {
    ppgSamples,
    medianPpg: medianValue(ppgSamples),
    strategies: ANALYSIS_STRATEGIES.map((id) =>
      summarizeStrategy(
        id,
        outcomes.filter((o) => o.strategies.includes(id)),
      ),
    ),
  };
}
