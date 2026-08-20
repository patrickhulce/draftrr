import { DEFAULT_SIMS, DEFAULT_TEMPERATURE } from '../defaults.js';
import type {
  AvailabilityRow,
  EngineRequest,
  Player,
  Position,
  PositionBranch,
  PositionRoundCell,
  RosterSlotKind,
  ProjectedAtNext,
  RosterSlots,
  SelectionFlow,
  SimRecommendation,
  SimulationResult,
} from '../types.js';
import { consensusStats } from './consensus.js';
import { canDraft, optimalLineup, ppg, unfilledSlots } from './lineup.js';
import { positionProjectionBounds, withSampledProjections } from './projections.js';
import { createRng, normalSample, weightedPick } from './rng.js';
import { nextPickForSlot, pickOrder, worstCaseReachable } from './snake.js';

const PROJECTED_POS: Position[] = ['RB', 'WR', 'TE', 'QB'];
const BRANCH_POS: Position[] = ['RB', 'WR', 'QB', 'TE'];
const GRID_POS: Position[] = ['RB', 'WR', 'QB', 'TE'];
const GRID_POS_SET = new Set<Position>(GRID_POS);
const TOP_AT_NEXT = 4;
export const REC_PICKS = 8;
const TOP_CELL_PLAYERS = 5;
const SKILL_SLOTS = new Set(['QB', 'RB', 'WR', 'TE', 'FLEX']);
const LATE_SLOTS = new Set(['DST', 'K']);
const FLEX_BAG_POS: Position[] = ['RB', 'WR', 'TE'];
const FORCED_BRANCH_SIMS = 150;
const NOW_PPG_TIEBREAK = 0.05;

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

const EARLY_RANK = 18;
const FALL_SCALE = 0.25;

export function sampleCpuRank(mean: number, stdev: number, rng: () => number): number {
  const effectiveStdev = stdev * Math.min(1, mean / EARLY_RANK);
  if (effectiveStdev <= 0) return mean;
  const sampled = normalSample(mean, effectiveStdev, rng);
  const delta = sampled - mean;
  return delta > 0 ? mean + delta * FALL_SCALE : sampled;
}

export function drawCpuBoard(
  players: Player[],
  stats: Map<string, { mean: number; stdev: number }>,
  rng: () => number,
): Player[] {
  const scored = players.map((p) => {
    const s = stats.get(p.id) ?? { mean: 999, stdev: 0 };
    return { p, rank: sampleCpuRank(s.mean, s.stdev, rng) };
  });
  scored.sort((a, b) => a.rank - b.rank);
  return scored.map((x) => x.p);
}

function rankIndexOf(rankingPlayerIds: string[]): Map<string, number> {
  const index = new Map<string, number>();
  rankingPlayerIds.forEach((id, i) => index.set(id, i + 1));
  return index;
}

function slotBags(roster: Player[], slots: RosterSlots): ReturnType<typeof unfilledSlots>[] {
  const unfilled = unfilledSlots(roster, slots);
  return [
    unfilled.filter((s) => SKILL_SLOTS.has(s)),
    unfilled.filter((s) => LATE_SLOTS.has(s)),
    unfilled.filter((s) => s === 'BENCH'),
  ].filter((bag) => bag.length > 0);
}

/** Positions a roster-slot bag may draft, including TE from FLEX/BENCH when under the cap. */
export function positionsFromBag(
  bag: readonly RosterSlotKind[],
  roster: Player[],
  slots: RosterSlots,
): Position[] {
  const out: Position[] = [];
  const seen = new Set<Position>();
  const add = (position: Position) => {
    if (seen.has(position)) return;
    if (!canDraft(roster, slots, { position } as Player)) return;
    seen.add(position);
    out.push(position);
  };
  for (const slot of bag) {
    if (slot === 'FLEX' || slot === 'BENCH') {
      for (const pos of FLEX_BAG_POS) add(pos);
    } else {
      add(slot);
    }
  }
  return out;
}

function nextPickInOrder(order: number[], afterPickNo: number, mySlot: number): number | null {
  for (let n = afterPickNo + 1; n <= order.length; n++) {
    if (order[n - 1] === mySlot) return n;
  }
  return null;
}

function cpuSkipCount(order: number[], pickNo: number, mySlot: number): number {
  const next = nextPickInOrder(order, pickNo, mySlot);
  if (next == null) return Number.POSITIVE_INFINITY;
  return Math.max(0, next - pickNo - 1);
}

function bestAtPosAfterSkip(
  remaining: Map<string, Player>,
  roster: Player[],
  rankIndex: Map<string, number>,
  slots: RosterSlots,
  position: Position,
  board: Player[],
  skip: number,
): Player | undefined {
  const gone = new Set<string>();
  if (Number.isFinite(skip) && skip > 0) {
    let n = 0;
    for (const p of board) {
      if (n >= skip) break;
      if (!remaining.has(p.id)) continue;
      gone.add(p.id);
      n++;
    }
  } else if (!Number.isFinite(skip)) {
    return undefined;
  }
  let best: Player | undefined;
  let bestRank = Infinity;
  for (const p of remaining.values()) {
    if (gone.has(p.id)) continue;
    if (p.position !== position) continue;
    if (!canDraft(roster, slots, p)) continue;
    const rank = rankIndex.get(p.id) ?? 9999;
    if (rank < bestRank) {
      best = p;
      bestRank = rank;
    }
  }
  return best;
}

function dropOffValue(now: Player | undefined, wait: Player | undefined): number {
  if (!now) return -Infinity;
  const later = wait ? ppg(wait) : 0;
  return ppg(now) - later + NOW_PPG_TIEBREAK * ppg(now);
}

function softmaxIndex(values: number[], temperature: number, rng: () => number): number {
  const tau = Math.max(temperature, 1e-6);
  const max = Math.max(...values);
  const weights = values.map((v) => Math.exp((v - max) / tau));
  return weightedPick(weights, rng);
}

function userPick(
  remaining: Map<string, Player>,
  roster: Player[],
  rankIndex: Map<string, number>,
  slots: RosterSlots,
  rng: () => number,
  board: Player[],
  pickNo: number,
  mySlot: number,
  order: number[],
  temperature: number,
): Player | undefined {
  const bags = slotBags(roster, slots);
  const skip = cpuSkipCount(order, pickNo, mySlot);
  for (const bag of bags) {
    const positions = positionsFromBag(bag, roster, slots);
    const candidates: { player: Player; value: number }[] = [];
    for (const position of positions) {
      const now = bestAtPos(remaining, roster, rankIndex, slots, position);
      if (!now) continue;
      const wait = bestAtPosAfterSkip(remaining, roster, rankIndex, slots, position, board, skip);
      candidates.push({ player: now, value: dropOffValue(now, wait) });
    }
    if (candidates.length === 0) continue;
    const idx = softmaxIndex(
      candidates.map((c) => c.value),
      temperature,
      rng,
    );
    return candidates[idx]?.player ?? candidates[0]!.player;
  }
  return undefined;
}

function bestAtPos(
  remaining: Map<string, Player>,
  roster: Player[],
  rankIndex: Map<string, number>,
  slots: RosterSlots,
  position: Position,
): Player | undefined {
  let best: Player | undefined;
  let bestRank = Infinity;
  for (const p of remaining.values()) {
    if (p.position !== position) continue;
    if (!canDraft(roster, slots, p)) continue;
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
  roster: Player[],
  slots: RosterSlots,
): Player | undefined {
  for (const p of board) {
    if (!remaining.has(p.id)) continue;
    if (!canDraft(roster, slots, p)) continue;
    return p;
  }
  return undefined;
}

function cloneRosters(source: Map<number, Player[]>): Map<number, Player[]> {
  const next = new Map<number, Player[]>();
  for (const [slot, roster] of source) next.set(slot, [...roster]);
  return next;
}

export interface DraftPickEvent {
  pickNo: number;
  player: Player;
}

export interface DraftRun {
  roster: Player[];
  myPicks: DraftPickEvent[];
  teamRosters: Map<number, Player[]>;
}

export function runDraft(opts: {
  pool: Player[];
  initialRosters: Map<number, Player[]>;
  order: number[];
  currentPickNo: number;
  totalPicks: number;
  mySlot: number;
  slots: RosterSlots;
  rankIndex: Map<string, number>;
  board: Player[];
  rng: () => number;
  temperature?: number;
  forcedPos?: Position;
  forcedPickNo?: number | null;
  onRemaining?: (pickNo: number, remaining: Map<string, Player>) => void;
}): DraftRun {
  const remaining = new Map(opts.pool.map((p) => [p.id, p]));
  const teamRosters = cloneRosters(opts.initialRosters);
  const myPicks: DraftPickEvent[] = [];
  const temperature =
    opts.temperature && opts.temperature > 0 ? opts.temperature : DEFAULT_TEMPERATURE;

  for (let pickNo = opts.currentPickNo; pickNo <= opts.totalPicks; pickNo++) {
    if (remaining.size === 0) break;
    opts.onRemaining?.(pickNo, remaining);

    const slot = opts.order[pickNo - 1] ?? 1;
    const roster = teamRosters.get(slot) ?? [];
    let chosen: Player | undefined;
    if (slot === opts.mySlot) {
      if (opts.forcedPos && pickNo === opts.forcedPickNo) {
        chosen = bestAtPos(remaining, roster, opts.rankIndex, opts.slots, opts.forcedPos);
      }
      if (!chosen) {
        chosen = userPick(
          remaining,
          roster,
          opts.rankIndex,
          opts.slots,
          opts.rng,
          opts.board,
          pickNo,
          opts.mySlot,
          opts.order,
          temperature,
        );
      }
      if (chosen) myPicks.push({ pickNo, player: chosen });
    } else {
      chosen = pickCpu(opts.board, remaining, roster, opts.slots);
    }
    if (!chosen) break;
    roster.push(chosen);
    teamRosters.set(slot, roster);
    remaining.delete(chosen.id);
  }

  return {
    roster: teamRosters.get(opts.mySlot) ?? [],
    myPicks,
    teamRosters,
  };
}

function initialTeamRosters(req: EngineRequest, byId: Map<string, Player>): Map<number, Player[]> {
  const rosters = new Map<number, Player[]>();
  for (let slot = 1; slot <= req.settings.teams; slot++) rosters.set(slot, []);
  if (req.teamPlayerIds) {
    for (const [slotKey, ids] of Object.entries(req.teamPlayerIds)) {
      const slot = Number(slotKey);
      rosters.set(
        slot,
        ids.map((id) => byId.get(id)).filter((p): p is Player => Boolean(p)),
      );
    }
    return rosters;
  }
  const mine = (req.myPlayerIds ?? [])
    .map((id) => byId.get(id))
    .filter((p): p is Player => Boolean(p));
  rosters.set(req.mySlot, mine);
  return rosters;
}

function medianValue(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function meanValue(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function positionOpen(roster: Player[], slots: RosterSlots, position: Position): boolean {
  return canDraft(roster, slots, { position } as Player);
}

function isGridPos(position: Position): boolean {
  return GRID_POS_SET.has(position);
}

function lockedSkillPlayers(alreadyMine: Player[]): Player[] {
  return alreadyMine.filter((p) => isGridPos(p.position));
}

function outcomePicks(
  alreadyMine: Player[],
  myPicks: DraftPickEvent[],
): { positions: Position[]; playerIds: string[] } {
  const locked = lockedSkillPlayers(alreadyMine);
  const rest = myPicks.filter((pick) => isGridPos(pick.player.position));
  const combined = [
    ...locked.map((player) => ({ position: player.position, id: player.id })),
    ...rest.map((pick) => ({ position: pick.player.position, id: pick.player.id })),
  ].slice(0, REC_PICKS);
  return {
    positions: combined.map((row) => row.position),
    playerIds: combined.map((row) => row.id),
  };
}

function buildFlows(outcomes: { positions: Position[]; ppg: number }[]): SelectionFlow[] {
  const groups = new Map<string, { positions: Position[]; ppgs: number[] }>();
  for (const outcome of outcomes) {
    const key = outcome.positions.join('-');
    const group = groups.get(key);
    if (group) {
      group.ppgs.push(outcome.ppg);
    } else {
      groups.set(key, { positions: outcome.positions, ppgs: [outcome.ppg] });
    }
  }
  return [...groups.values()]
    .map((group) => ({
      positions: group.positions,
      count: group.ppgs.length,
      expectedPpg: meanValue(group.ppgs),
    }))
    .sort((a, b) => b.count - a.count || b.expectedPpg - a.expectedPpg);
}

function greedyRecommendation(
  outcomes: { positions: Position[]; ppg: number }[],
): SimRecommendation {
  let pool = outcomes;
  const sequence: Position[] = [];
  const limit = Math.min(REC_PICKS, Math.max(0, ...outcomes.map((o) => o.positions.length)));
  for (let i = 0; i < limit; i++) {
    const byPos = new Map<Position, { items: typeof pool; ppgs: number[] }>();
    for (const outcome of pool) {
      const pos = outcome.positions[i];
      if (!pos) continue;
      const group = byPos.get(pos);
      if (group) {
        group.items.push(outcome);
        group.ppgs.push(outcome.ppg);
      } else {
        byPos.set(pos, { items: [outcome], ppgs: [outcome.ppg] });
      }
    }
    if (byPos.size === 0) break;
    let bestPos: Position | undefined;
    let bestMean = -Infinity;
    for (const [pos, group] of byPos) {
      const mean = meanValue(group.ppgs);
      if (mean > bestMean) {
        bestMean = mean;
        bestPos = pos;
      }
    }
    if (!bestPos) break;
    sequence.push(bestPos);
    pool = byPos.get(bestPos)!.items;
  }
  return { positions: sequence, expectedPpg: meanValue(pool.map((o) => o.ppg)) };
}

function buildTopPlayers(
  matched: { playerIds: string[]; ppg: number }[],
  pickIndex: number,
): PositionRoundCell['topPlayers'] {
  const groups = new Map<string, number[]>();
  for (const outcome of matched) {
    const playerId = outcome.playerIds[pickIndex];
    if (!playerId) continue;
    const ppgs = groups.get(playerId);
    if (ppgs) ppgs.push(outcome.ppg);
    else groups.set(playerId, [outcome.ppg]);
  }
  return [...groups.entries()]
    .map(([playerId, ppgs]) => ({
      playerId,
      expectedPpg: meanValue(ppgs),
      count: ppgs.length,
    }))
    .sort((a, b) => b.count - a.count || b.expectedPpg - a.expectedPpg)
    .slice(0, TOP_CELL_PLAYERS);
}

function buildPositionGrid(
  outcomes: { positions: Position[]; playerIds: string[]; ppg: number }[],
  lockedPickCount: number,
  forcedColumn?: Map<Position, { playerIds: string[]; ppg: number }[]>,
): PositionRoundCell[] {
  const columns = Math.min(REC_PICKS, Math.max(0, ...outcomes.map((o) => o.positions.length)));
  const cells: PositionRoundCell[] = [];
  for (let pickIndex = 0; pickIndex < columns; pickIndex++) {
    const locked = pickIndex < lockedPickCount;
    const useForced = !locked && pickIndex === lockedPickCount && forcedColumn;
    for (const position of GRID_POS) {
      const matched = useForced
        ? (forcedColumn.get(position) ?? [])
        : outcomes.filter((o) => o.positions[pickIndex] === position);
      cells.push({
        position,
        pickIndex,
        expectedPpg: matched.length ? meanValue(matched.map((o) => o.ppg)) : null,
        count: matched.length,
        topPlayers: buildTopPlayers(matched, pickIndex),
        locked,
      });
    }
  }
  return cells;
}

function closestToMean<T extends { ppg: number }>(outcomes: T[]): T | undefined {
  if (outcomes.length === 0) return undefined;
  const mean = meanValue(outcomes.map((o) => o.ppg));
  let best = outcomes[0]!;
  let bestDist = Math.abs(best.ppg - mean);
  for (const outcome of outcomes) {
    const dist = Math.abs(outcome.ppg - mean);
    if (dist < bestDist) {
      best = outcome;
      bestDist = dist;
    }
  }
  return best;
}

function simPlayers(
  req: EngineRequest,
  picked: Set<string>,
  bounds: ReturnType<typeof positionProjectionBounds>,
  rng: () => number,
): { pool: Player[]; initialRosters: Map<number, Player[]> } {
  const players = req.stochasticProjections
    ? withSampledProjections(req.players, bounds, rng)
    : req.players;
  const byId = new Map(players.map((p) => [p.id, p]));
  return {
    pool: players.filter((p) => !picked.has(p.id)),
    initialRosters: initialTeamRosters(req, byId),
  };
}

export function runSimulation(req: EngineRequest): SimulationResult {
  const sims = req.sims > 0 ? req.sims : DEFAULT_SIMS;
  const { settings, mySlot } = req;
  const picked = new Set(req.pickedPlayerIds);
  const pool = req.players.filter((p) => !picked.has(p.id));
  const byId = new Map(req.players.map((p) => [p.id, p]));
  const rankIndex = rankIndexOf(req.rankingPlayerIds);
  const initialRosters = initialTeamRosters(req, byId);
  const alreadyMine = initialRosters.get(mySlot) ?? [];

  const stats = new Map<string, { mean: number; stdev: number }>();
  for (const p of pool) {
    stats.set(p.id, consensusStats(p, rankIndex.get(p.id)));
  }

  const currentPickNo = req.currentPickNo ?? req.pickedPlayerIds.length + 1;
  const lockedPickCount = Math.min(REC_PICKS, lockedSkillPlayers(alreadyMine).length);
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

  const temperature =
    req.temperature && req.temperature > 0 ? req.temperature : DEFAULT_TEMPERATURE;
  const rng = createRng(req.seed);
  const projectionBounds = req.stochasticProjections ? positionProjectionBounds(req.players) : null;
  const shared = {
    order,
    currentPickNo,
    totalPicks,
    mySlot,
    slots: settings.slots,
    rankIndex,
    rng,
    temperature,
  };

  const unconstrained: {
    positions: Position[];
    playerIds: string[];
    ppg: number;
    lineup: ReturnType<typeof optimalLineup>;
  }[] = [];

  for (let s = 0; s < sims; s++) {
    const world = projectionBounds
      ? simPlayers(req, picked, projectionBounds, rng)
      : { pool, initialRosters };
    const board = drawCpuBoard(world.pool, stats, rng);
    const countedRound = new Set<number>();
    const draft = runDraft({
      ...shared,
      pool: world.pool,
      initialRosters: world.initialRosters,
      board,
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
    const lineup = optimalLineup(draft.roster, settings.slots);
    unconstrained.push({
      ...outcomePicks(alreadyMine, draft.myPicks),
      ppg: lineup.starterPoints,
      lineup,
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

  const ppgSamples = unconstrained.map((o) => o.ppg);
  const flows = buildFlows(unconstrained);
  const recommendation = greedyRecommendation(unconstrained);

  type ForcedOutcome = (typeof unconstrained)[number];
  const forcedByPos = new Map<Position, ForcedOutcome[]>();
  const forcedSims = Math.min(sims, FORCED_BRANCH_SIMS);
  if (myNext != null && forcedSims > 0) {
    for (const position of BRANCH_POS) {
      if (!positionOpen(alreadyMine, settings.slots, position)) continue;
      if (!pool.some((p) => p.position === position)) continue;
      const outcomes: ForcedOutcome[] = [];
      for (let s = 0; s < forcedSims; s++) {
        const world = projectionBounds
          ? simPlayers(req, picked, projectionBounds, rng)
          : { pool, initialRosters };
        const board = drawCpuBoard(world.pool, stats, rng);
        const draft = runDraft({
          ...shared,
          pool: world.pool,
          initialRosters: world.initialRosters,
          board,
          forcedPos: position,
          forcedPickNo: myNext,
        });
        const lineup = optimalLineup(draft.roster, settings.slots);
        outcomes.push({
          ...outcomePicks(alreadyMine, draft.myPicks),
          ppg: lineup.starterPoints,
          lineup,
        });
      }
      forcedByPos.set(position, outcomes);
    }
  }

  const forcedColumn = new Map<Position, { playerIds: string[]; ppg: number }[]>();
  for (const [position, outcomes] of forcedByPos) {
    forcedColumn.set(
      position,
      outcomes.map((o) => ({ playerIds: o.playerIds, ppg: o.ppg })),
    );
  }
  const positionGrid = buildPositionGrid(
    unconstrained,
    lockedPickCount,
    forcedByPos.size > 0 ? forcedColumn : undefined,
  );

  const positionBranches: PositionBranch[] = [];
  if (myNext != null) {
    for (const position of BRANCH_POS) {
      const matched = forcedByPos.get(position);
      if (!matched?.length) continue;
      const samples = matched.map((o) => o.ppg);
      const representative = closestToMean(matched)!;
      positionBranches.push({
        position,
        pickPlayerId: representative.playerIds[lockedPickCount] ?? null,
        expectedPpg: meanValue(samples),
        medianStarterPpg: medianValue(samples),
        slotsFilled: representative.lineup.slotsFilled,
        benchIds: representative.lineup.bench.map((p) => p.id),
        ppgSamples: samples,
      });
    }
  }

  return {
    availability,
    projectedAtNext,
    positionBranches,
    nextPickNo: currentPickNo,
    nextMyPickNo: myNext,
    lockedPickCount,
    recommendation,
    ppgSamples,
    flows,
    positionGrid,
  };
}
