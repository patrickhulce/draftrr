import { DEFAULT_SIMS } from '../defaults.js';
import type {
  AvailabilityRow,
  EngineRequest,
  Player,
  Position,
  PositionBranch,
  ProjectedAtNext,
  RosterSlots,
  SimulationResult,
} from '../types.js';
import { consensusStats } from './consensus.js';
import { optimalLineup, starterNeedScore } from './lineup.js';
import { createRng, normalSample } from './rng.js';
import { nextPickForSlot, pickOrder, worstCaseReachable } from './snake.js';

const PROJECTED_POS: Position[] = ['RB', 'WR', 'TE', 'QB'];
const BRANCH_POS: Position[] = ['RB', 'WR', 'QB', 'TE'];
const TOP_AT_NEXT = 4;

export function worstCaseProjectedAtNext(
  remaining: readonly Player[],
  currentPickNo: number,
  nextMyPickNo: number | null,
): ProjectedAtNext[] {
  const reachable = worstCaseReachable(remaining, currentPickNo, nextMyPickNo);
  return PROJECTED_POS.map((position) => ({
    position,
    playerIds: reachable
      .filter((p) => p.position === position)
      .slice(0, TOP_AT_NEXT)
      .map((p) => p.id),
  }));
}

export function drawCpuBoard(
  players: Player[],
  stats: Map<string, { mean: number; stdev: number }>,
  rng: () => number,
): Player[] {
  const scored = players.map((p) => {
    const s = stats.get(p.id) ?? { mean: 999, stdev: 0 };
    return { p, rank: normalSample(s.mean, s.stdev, rng) };
  });
  scored.sort((a, b) => a.rank - b.rank);
  return scored.map((x) => x.p);
}

function rankIndexOf(rankingPlayerIds: string[]): Map<string, number> {
  const index = new Map<string, number>();
  rankingPlayerIds.forEach((id, i) => index.set(id, i + 1));
  return index;
}

function userPick(
  remaining: Map<string, Player>,
  roster: Player[],
  rankIndex: Map<string, number>,
  slots: RosterSlots,
): Player | undefined {
  let best: Player | undefined;
  let bestNeed = -Infinity;
  let bestRank = Infinity;
  for (const p of remaining.values()) {
    const need = starterNeedScore(roster, slots, p);
    const rank = rankIndex.get(p.id) ?? 9999;
    if (need > bestNeed || (need === bestNeed && rank < bestRank)) {
      best = p;
      bestNeed = need;
      bestRank = rank;
    }
  }
  return best;
}

function bestAtPos(
  remaining: Map<string, Player>,
  rankIndex: Map<string, number>,
  position: Position,
): Player | undefined {
  let best: Player | undefined;
  let bestRank = Infinity;
  for (const p of remaining.values()) {
    if (p.position !== position) continue;
    const rank = rankIndex.get(p.id) ?? 9999;
    if (rank < bestRank) {
      best = p;
      bestRank = rank;
    }
  }
  return best;
}

function pickCpu(
  board: Player[],
  remaining: Map<string, Player>,
  cursor: { i: number },
): Player | undefined {
  for (; cursor.i < board.length; cursor.i++) {
    const p = board[cursor.i];
    if (p && remaining.has(p.id)) {
      cursor.i += 1;
      return p;
    }
  }
  return undefined;
}

function runDraft(opts: {
  pool: Player[];
  alreadyMine: Player[];
  order: number[];
  currentPickNo: number;
  totalPicks: number;
  mySlot: number;
  slots: RosterSlots;
  rankIndex: Map<string, number>;
  board: Player[];
  forcedPos?: Position;
  forcedPickNo?: number | null;
  onRemaining?: (pickNo: number, remaining: Map<string, Player>) => void;
  stopAt?: number | null;
}): Player[] {
  const remaining = new Map(opts.pool.map((p) => [p.id, p]));
  const mine = [...opts.alreadyMine];
  const cursor = { i: 0 };

  for (let pickNo = opts.currentPickNo; pickNo <= opts.totalPicks; pickNo++) {
    if (remaining.size === 0) break;
    opts.onRemaining?.(pickNo, remaining);
    if (opts.stopAt != null && pickNo === opts.stopAt) break;

    const slot = opts.order[pickNo - 1] ?? 1;
    let chosen: Player | undefined;
    if (slot === opts.mySlot) {
      if (opts.forcedPos && pickNo === opts.forcedPickNo) {
        chosen = bestAtPos(remaining, opts.rankIndex, opts.forcedPos);
      }
      if (!chosen) chosen = userPick(remaining, mine, opts.rankIndex, opts.slots);
      if (chosen) mine.push(chosen);
    } else {
      chosen = pickCpu(opts.board, remaining, cursor);
    }
    if (!chosen) break;
    remaining.delete(chosen.id);
  }
  return mine;
}

export function runSimulation(req: EngineRequest): SimulationResult {
  const sims = req.sims > 0 ? req.sims : DEFAULT_SIMS;
  const { settings, mySlot } = req;
  const picked = new Set(req.pickedPlayerIds);
  const pool = req.players.filter((p) => !picked.has(p.id));
  const byId = new Map(req.players.map((p) => [p.id, p]));
  const rankIndex = rankIndexOf(req.rankingPlayerIds);
  const alreadyMine = (req.myPlayerIds ?? [])
    .map((id) => byId.get(id))
    .filter((p): p is Player => Boolean(p));

  const stats = new Map<string, { mean: number; stdev: number }>();
  for (const p of pool) {
    stats.set(p.id, consensusStats(p, rankIndex.get(p.id)));
  }

  const currentPickNo = req.pickedPlayerIds.length + 1;
  const totalPicks = settings.teams * settings.rounds;
  const order = pickOrder(settings.teams, settings.rounds, settings.draftType);
  const myNext = nextPickForSlot(
    currentPickNo - 1,
    mySlot,
    settings.teams,
    settings.rounds,
    settings.draftType,
  );
  const survivePick =
    myNext != null && myNext === currentPickNo
      ? nextPickForSlot(myNext, mySlot, settings.teams, settings.rounds, settings.draftType)
      : myNext;

  const surviveNext = new Map<string, number>();
  const surviveByRound = new Map<string, number[]>();
  for (const p of pool) {
    surviveNext.set(p.id, 0);
    surviveByRound.set(
      p.id,
      Array.from({ length: settings.rounds }, () => 0),
    );
  }

  const rng = createRng(req.seed);
  const shared = {
    pool,
    alreadyMine,
    order,
    currentPickNo,
    totalPicks,
    mySlot,
    slots: settings.slots,
    rankIndex,
  };

  for (let s = 0; s < sims; s++) {
    const board = drawCpuBoard(pool, stats, rng);
    const countedRound = new Set<number>();
    runDraft({
      ...shared,
      board,
      stopAt: survivePick,
      onRemaining: (pickNo, remaining) => {
        const round = Math.floor((pickNo - 1) / settings.teams) + 1;
        if (!countedRound.has(round)) {
          countedRound.add(round);
          for (const p of remaining.values()) {
            const arr = surviveByRound.get(p.id);
            if (arr) arr[round - 1] = (arr[round - 1] ?? 0) + 1;
          }
        }
        if (pickNo === survivePick) {
          for (const p of remaining.values()) {
            surviveNext.set(p.id, (surviveNext.get(p.id) ?? 0) + 1);
          }
        }
      },
    });
  }

  const availability: AvailabilityRow[] = pool.map((p) => ({
    playerId: p.id,
    pAvailableAtNext: sims > 0 ? (surviveNext.get(p.id) ?? 0) / sims : 0,
    pAvailableByRound: (surviveByRound.get(p.id) ?? []).map((c) => (sims > 0 ? c / sims : 0)),
  }));

  const ranked = (
    req.rankingPlayerIds.length
      ? req.rankingPlayerIds.map((id) => byId.get(id)).filter((p): p is Player => Boolean(p))
      : [...req.players]
  ).filter((p) => !picked.has(p.id));

  const projectedAtNext = worstCaseProjectedAtNext(ranked, currentPickNo, myNext);

  const positionBranches: PositionBranch[] = [];
  if (myNext != null) {
    for (const position of BRANCH_POS) {
      const intended = ranked.find((p) => p.position === position);
      if (!intended) continue;
      const outcomes: { ppg: number; lineup: ReturnType<typeof optimalLineup> }[] = [];
      for (let s = 0; s < sims; s++) {
        const board = drawCpuBoard(pool, stats, rng);
        const roster = runDraft({
          ...shared,
          board,
          forcedPos: position,
          forcedPickNo: myNext,
        });
        const lineup = optimalLineup(roster, settings.slots);
        outcomes.push({ ppg: lineup.starterPoints, lineup });
      }
      if (outcomes.length === 0) continue;
      outcomes.sort((a, b) => a.ppg - b.ppg);
      const median = outcomes[Math.floor(outcomes.length / 2)]!;
      positionBranches.push({
        position,
        pickPlayerId: intended.id,
        medianStarterPpg: median.ppg,
        slotsFilled: median.lineup.slotsFilled,
        benchIds: median.lineup.bench.map((p) => p.id),
      });
    }
  }

  return {
    availability,
    projectedAtNext,
    positionBranches,
    nextPickNo: currentPickNo,
    nextMyPickNo: myNext,
  };
}
