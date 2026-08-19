import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAGUE, PROJECTION_GAMES } from '../defaults.js';
import { withKeys } from '../players/ids.js';
import type { Player } from '../types.js';
import { consensusStats } from './consensus.js';
import { canDraft, optimalLineup, unfilledSlots } from './lineup.js';
import { createRng } from './rng.js';
import {
  nextPickForSlot,
  pickOrder,
  picksForSlot,
  slotForPick,
  worstCaseHighlighted,
  worstCaseReachable,
  worstCaseSkip,
} from './snake.js';
import {
  REC_PICKS,
  positionsFromBag,
  runDraft,
  runSimulation,
  worstCaseProjectedAtNext,
} from './simulate.js';

function mk(
  name: string,
  pos: Player['position'],
  pts: number,
  adp: number,
  extra: Partial<Player> = {},
): Player {
  return withKeys({
    name,
    position: pos,
    team: 'BUF',
    bye: 12,
    projectedPoints: pts,
    adp,
    ...extra,
  });
}

const players: Player[] = [
  mk('RB One', 'RB', 300, 1),
  mk('WR One', 'WR', 290, 2),
  mk('RB Two', 'RB', 270, 3),
  mk('WR Two', 'WR', 260, 4),
  mk('WR Three', 'WR', 240, 5),
  mk('TE One', 'TE', 200, 6),
  mk('RB Three', 'RB', 180, 7),
  mk('QB One', 'QB', 350, 8),
  mk('WR Four', 'WR', 160, 9),
  mk('TE Two', 'TE', 140, 10),
  mk('DST One', 'DST', 110, 11),
  mk('QB Two', 'QB', 300, 20),
];

describe('snake', () => {
  it('snakes even rounds', () => {
    expect(slotForPick(1, 12, 'snake')).toEqual({ round: 1, slot: 1 });
    expect(slotForPick(12, 12, 'snake')).toEqual({ round: 1, slot: 12 });
    expect(slotForPick(13, 12, 'snake')).toEqual({ round: 2, slot: 12 });
    expect(slotForPick(24, 12, 'snake')).toEqual({ round: 2, slot: 1 });
    expect(nextPickForSlot(1, 1, 12, 15, 'snake')).toBe(24);
    expect(nextPickForSlot(0, 9, 12, 15, 'snake')).toBe(9);
    expect(nextPickForSlot(9, 9, 12, 15, 'snake')).toBe(16);
    expect(nextPickForSlot(16, 9, 12, 15, 'snake')).toBe(33);
  });

  it('skips names that go before our next pick on a worst-case board', () => {
    const board = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    expect(worstCaseSkip(1, 9)).toBe(8);
    expect(worstCaseReachable(board, 1, 9)).toEqual(['i', 'j']);
    expect(worstCaseSkip(9, 9)).toBe(0);
    expect(worstCaseReachable(board, 9, 9)).toEqual(board);
    expect(worstCaseReachable(board, 1, null)).toEqual([]);
  });

  it('highlights every remaining pick slot on a worst-case board', () => {
    expect(picksForSlot(0, 9, 12, 4, 'snake')).toEqual([9, 16, 33, 40]);
    expect(picksForSlot(9, 9, 12, 4, 'snake')).toEqual([16, 33, 40]);
    const board = Array.from({ length: 40 }, (_, i) => i + 1);
    expect(worstCaseHighlighted(board, 1, [9, 16, 33, 40])).toEqual([9, 16, 33, 40]);
    expect(worstCaseHighlighted(board.slice(8), 9, [16, 33, 40])).toEqual([16, 33, 40]);
  });
});

describe('optimalLineup', () => {
  it('assigns FLEX to leftover skill players', () => {
    const roster = players
      .filter((p) => p.position !== 'QB')
      .concat(players.find((p) => p.name === 'QB One')!);
    const result = optimalLineup(roster, DEFAULT_LEAGUE.slots);
    expect(result.starters.some((p) => p.name === 'QB One')).toBe(true);
    expect(result.slotsFilled.FLEX?.length).toBe(2);
    expect(result.starterPoints).toBeGreaterThan(result.benchPoints);
  });

  it('reports starter points as per-game (season / 16)', () => {
    const roster = players
      .filter((p) => p.position !== 'QB')
      .concat(players.find((p) => p.name === 'QB One')!);
    const result = optimalLineup(roster, DEFAULT_LEAGUE.slots);
    const season = result.starters
      .filter((p) => p.position !== 'DST' && p.position !== 'K')
      .reduce((sum, p) => sum + p.projectedPoints, 0);
    expect(result.starterPoints).toBeCloseTo(season / PROJECTION_GAMES);
  });

  it('ignores D/ST points in starter PPG while still filling the slot', () => {
    const dst = players.find((p) => p.name === 'DST One')!;
    const roster = players.filter((p) => p.position !== 'QB' && p.position !== 'DST');
    roster.push(
      players.find((p) => p.name === 'QB One')!,
      dst,
    );
    const result = optimalLineup(roster, DEFAULT_LEAGUE.slots);
    expect(result.slotsFilled.DST).toEqual([dst.id]);
    const scored = result.starters.filter((p) => p.position !== 'DST' && p.position !== 'K');
    const season = scored.reduce((sum, p) => sum + p.projectedPoints, 0);
    expect(result.starterPoints).toBeCloseTo(season / PROJECTION_GAMES);
    expect(result.starterPoints).toBeLessThan((season + dst.projectedPoints) / PROJECTION_GAMES);
  });
});

describe('canDraft', () => {
  const slots = DEFAULT_LEAGUE.slots;

  it('caps QB and TE at their dedicated slots', () => {
    const qb = players.find((p) => p.position === 'QB')!;
    const te = players.find((p) => p.position === 'TE')!;
    const extraQb = mk('QB Extra', 'QB', 200, 30);
    const extraTe = mk('TE Extra', 'TE', 120, 31);
    expect(canDraft([], slots, qb)).toBe(true);
    expect(canDraft([qb], slots, extraQb)).toBe(false);
    expect(canDraft([], slots, te)).toBe(true);
    expect(canDraft([te], slots, extraTe)).toBe(false);
  });

  it('still allows extra RBs and WRs until the roster is full', () => {
    const rbs = [mk('RB A', 'RB', 200, 1), mk('RB B', 'RB', 190, 2), mk('RB C', 'RB', 180, 3)];
    expect(canDraft(rbs.slice(0, 2), slots, rbs[2]!)).toBe(true);
    const full = Array.from({ length: 15 }, (_, i) => mk(`RB ${i}`, 'RB', 100, i + 1));
    expect(canDraft(full, slots, mk('RB Extra', 'RB', 90, 40))).toBe(false);
  });

  it('lists leftover roster slots after assigning dedicated then flex then bench', () => {
    expect(unfilledSlots([], slots)).toEqual([
      'QB',
      'RB',
      'RB',
      'WR',
      'WR',
      'TE',
      'DST',
      'FLEX',
      'FLEX',
      'BENCH',
      'BENCH',
      'BENCH',
      'BENCH',
      'BENCH',
      'BENCH',
    ]);
    const qb = players.find((p) => p.position === 'QB')!;
    const rbs = [mk('RB A', 'RB', 200, 1), mk('RB B', 'RB', 190, 2)];
    expect(unfilledSlots([qb, ...rbs], slots).filter((s) => s === 'QB' || s === 'RB')).toEqual([]);
    expect(unfilledSlots([qb, ...rbs], slots).filter((s) => s === 'FLEX').length).toBe(2);
  });
});

describe('consensus rank', () => {
  it('averages our rank, ADP, and ballers rank', () => {
    const player = mk('Star', 'RB', 200, 3, { ballersRank: 5 });
    const stats = consensusStats(player, 1);
    expect(stats.mean).toBe(3);
    expect(stats.stdev).toBe(2);
  });

  it('uses σ = 0 when only one source exists', () => {
    const player = mk('Only Adp', 'WR', 100, 12);
    const stats = consensusStats(player, undefined);
    expect(stats.mean).toBe(12);
    expect(stats.stdev).toBe(0);
  });
});

describe('simulation', () => {
  const baseReq = {
    players,
    settings: { ...DEFAULT_LEAGUE, teams: 4, rounds: 6 },
    mySlot: 1,
    pickedPlayerIds: [] as string[],
    myPlayerIds: [] as string[],
    rankingPlayerIds: players.map((p) => p.id),
    sims: 40,
    seed: 42,
    temperature: 3,
  };

  it('is deterministic with a seed', () => {
    const a = runSimulation(baseReq);
    const b = runSimulation(baseReq);
    expect(a.availability).toEqual(b.availability);
    expect(a.projectedAtNext).toEqual(b.projectedAtNext);
    expect(a.positionBranches).toEqual(b.positionBranches);
    expect(createRng(1)()).toBe(createRng(1)());
  });

  it('drops already picked players from availability', () => {
    const result = runSimulation({
      ...baseReq,
      mySlot: 2,
      pickedPlayerIds: [players[0]!.id],
      sims: 20,
      seed: 7,
      temperature: 4,
    });
    expect(result.availability.every((a) => a.playerId !== players[0]!.id)).toBe(true);
    expect(result.nextPickNo).toBe(2);
  });

  it('has CPUs follow the zero-noise consensus board', () => {
    const result = runSimulation({
      ...baseReq,
      settings: { ...DEFAULT_LEAGUE, teams: 2, rounds: 4 },
      mySlot: 2,
      sims: 12,
      seed: 1,
    });
    const top = result.availability.find((a) => a.playerId === players[0]!.id);
    expect(top?.pAvailableAtNext).toBe(0);
  });

  it('projects worst-case remaining from the next pick onward, not the top of the board', () => {
    const extra = [
      mk('RB Four', 'RB', 120, 13),
      mk('RB Five', 'RB', 110, 14),
      mk('WR Five', 'WR', 100, 15),
    ];
    const pool = [...players, ...extra];
    const result = runSimulation({
      ...baseReq,
      players: pool,
      rankingPlayerIds: pool.map((p) => p.id),
      settings: { ...DEFAULT_LEAGUE, teams: 12, rounds: 4 },
      mySlot: 9,
      sims: 20,
      seed: 3,
    });
    const beforeCutoff = new Set(pool.slice(0, 8).map((p) => p.id));
    const rbs = result.projectedAtNext.find((c) => c.position === 'RB')?.playerIds ?? [];
    expect(rbs[0]).toBe(extra[0]!.id);
    expect(rbs).not.toContain(players[0]!.id);
    for (const col of result.projectedAtNext) {
      for (const id of col.playerIds) {
        expect(beforeCutoff.has(id)).toBe(false);
      }
    }
    expect(worstCaseProjectedAtNext(pool, 1, 9)).toEqual(result.projectedAtNext);
  });

  it('returns a median roster when a position remains', () => {
    const result = runSimulation(baseReq);
    const rb = result.positionBranches.find((b) => b.position === 'RB');
    expect(rb?.pickPlayerId).toBe(players[0]!.id);
    expect(rb?.expectedPpg).toBeGreaterThan(0);
    expect(rb?.slotsFilled.RB?.length).toBeGreaterThan(0);
  });

  it('puts the branch pick on the median roster', () => {
    const result = runSimulation(baseReq);
    for (const branch of result.positionBranches) {
      const onTeam = new Set([
        ...Object.values(branch.slotsFilled).flatMap((ids) => ids ?? []),
        ...branch.benchIds,
      ]);
      expect(branch.pickPlayerId).toBeTruthy();
      expect(onTeam.has(branch.pickPlayerId!)).toBe(true);
      const cell = result.positionGrid.find(
        (c) => c.pickIndex === 0 && c.position === branch.position,
      );
      expect(branch.ppgSamples).toHaveLength(cell?.count ?? 0);
      expect(branch.expectedPpg).toBe(cell?.expectedPpg);
    }
  });

  it('never drafts a second QB or TE for the user or CPU', () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) => mk(`QB ${i}`, 'QB', 400 - i, i + 1)),
      ...Array.from({ length: 8 }, (_, i) => mk(`TE ${i}`, 'TE', 200 - i, i + 11)),
      ...Array.from({ length: 30 }, (_, i) => mk(`RB ${i}`, 'RB', 180 - i, i + 20)),
      ...Array.from({ length: 30 }, (_, i) => mk(`WR ${i}`, 'WR', 170 - i, i + 50)),
    ];
    const slots = DEFAULT_LEAGUE.slots;
    const settings = { ...DEFAULT_LEAGUE, teams: 4, rounds: 8 };
    const result = runSimulation({
      ...baseReq,
      players: pool,
      rankingPlayerIds: pool.map((p) => p.id),
      settings,
      sims: 12,
      seed: 9,
    });
    for (const branch of result.positionBranches) {
      const ids = [
        ...Object.values(branch.slotsFilled).flatMap((list) => list ?? []),
        ...branch.benchIds,
      ];
      const roster = ids
        .map((id) => pool.find((p) => p.id === id))
        .filter((p): p is Player => Boolean(p));
      expect(roster.filter((p) => p.position === 'QB').length).toBeLessThanOrEqual(slots.QB);
      expect(roster.filter((p) => p.position === 'TE').length).toBeLessThanOrEqual(slots.TE);
    }

    const order = pickOrder(settings.teams, settings.rounds, settings.draftType);
    const rankIndex = new Map(pool.map((p, i) => [p.id, i + 1]));
    const initialRosters = new Map<number, Player[]>([
      [1, []],
      [2, []],
      [3, []],
      [4, []],
    ]);
    const draft = runDraft({
      pool,
      initialRosters,
      order,
      currentPickNo: 1,
      totalPicks: settings.teams * settings.rounds,
      mySlot: 1,
      slots,
      rankIndex,
      board: pool,
      rng: createRng(3),
    });
    for (const roster of draft.teamRosters.values()) {
      expect(roster.filter((p) => p.position === 'QB').length).toBeLessThanOrEqual(slots.QB);
      expect(roster.filter((p) => p.position === 'TE').length).toBeLessThanOrEqual(slots.TE);
    }
  });

  it('skips a position branch once that starter is already filled', () => {
    const qb = players.find((p) => p.name === 'QB One')!;
    const result = runSimulation({
      ...baseReq,
      pickedPlayerIds: [qb.id],
      myPlayerIds: [qb.id],
      teamPlayerIds: { 1: [qb.id] },
      sims: 8,
    });
    expect(result.positionBranches.some((b) => b.position === 'QB')).toBe(false);
    expect(result.lockedPickCount).toBe(1);
    const locked = result.positionGrid.find((c) => c.pickIndex === 0 && c.position === 'QB');
    expect(locked?.locked).toBe(true);
    expect(locked?.topPlayers.map((p) => p.playerId)).toEqual([qb.id]);
  });

  it('recommends a remaining pick order and reports flow counts', () => {
    const extra = Array.from({ length: 40 }, (_, i) =>
      mk(`Skill ${i}`, i % 2 === 0 ? 'RB' : 'WR', 150 - i, 20 + i),
    );
    const pool = [...players, ...extra];
    const settings = { ...DEFAULT_LEAGUE, teams: 4, rounds: 6 };
    const result = runSimulation({
      ...baseReq,
      players: pool,
      rankingPlayerIds: pool.map((p) => p.id),
      settings,
      sims: 16,
      seed: 5,
    });
    const remainingPicks = pickOrder(settings.teams, settings.rounds, settings.draftType).filter(
      (_, i) =>
        i + 1 >= result.nextPickNo &&
        pickOrder(settings.teams, settings.rounds, settings.draftType)[i] === 1,
    ).length;
    expect(result.recommendation.positions.length).toBe(Math.min(REC_PICKS, remainingPicks));
    expect(result.recommendation.positions.length).toBeLessThanOrEqual(REC_PICKS);
    expect(result.ppgSamples).toHaveLength(16);
    expect(result.flows.reduce((sum, flow) => sum + flow.count, 0)).toBe(16);
    for (const flow of result.flows) {
      expect(flow.positions.length).toBeLessThanOrEqual(REC_PICKS);
    }
    const min = Math.min(...result.ppgSamples);
    const max = Math.max(...result.ppgSamples);
    expect(result.recommendation.expectedPpg).toBeGreaterThanOrEqual(min);
    expect(result.recommendation.expectedPpg).toBeLessThanOrEqual(max);
  });

  it('scores position branches as the mean of their samples', () => {
    const result = runSimulation(baseReq);
    for (const branch of result.positionBranches) {
      const mean = branch.ppgSamples.reduce((sum, v) => sum + v, 0) / branch.ppgSamples.length;
      expect(branch.expectedPpg).toBeCloseTo(mean);
    }
  });

  it('branches user position order instead of always taking QB/TE in the same rounds', () => {
    const pool = [
      ...Array.from({ length: 40 }, (_, i) => mk(`RB ${i}`, 'RB', 300 - i, i + 1)),
      ...Array.from({ length: 40 }, (_, i) => mk(`WR ${i}`, 'WR', 280 - i, i + 40)),
      ...Array.from({ length: 8 }, (_, i) => mk(`QB ${i}`, 'QB', 320 - i, 25 + i)),
      ...Array.from({ length: 8 }, (_, i) => mk(`TE ${i}`, 'TE', 200 - i * 8, 22 + i * 4)),
    ];
    const settings = { ...DEFAULT_LEAGUE, teams: 4, rounds: 15 };
    const result = runSimulation({
      ...baseReq,
      players: pool,
      rankingPlayerIds: pool.map((p) => p.id),
      settings,
      sims: 40,
      seed: 11,
    });
    expect(result.recommendation.positions.length).toBe(REC_PICKS);
    expect(result.flows.length).toBeGreaterThan(1);

    const qbIndexes = new Set<number>();
    for (const flow of result.flows) {
      const qbAt = flow.positions.findIndex((pos) => pos === 'QB');
      if (qbAt >= 0) qbIndexes.add(qbAt);
    }
    expect(qbIndexes.size).toBeGreaterThan(1);

    const order = pickOrder(settings.teams, settings.rounds, settings.draftType);
    const rankIndex = new Map(pool.map((p, i) => [p.id, i + 1]));
    const initialRosters = new Map<number, Player[]>([
      [1, []],
      [2, []],
      [3, []],
      [4, []],
    ]);
    let benchRb = 0;
    let benchWr = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const draft = runDraft({
        pool,
        initialRosters,
        order,
        currentPickNo: 1,
        totalPicks: settings.teams * settings.rounds,
        mySlot: 1,
        slots: DEFAULT_LEAGUE.slots,
        rankIndex,
        board: pool,
        rng: createRng(seed),
        temperature: 3,
      });
      const skillRb = 2;
      const skillWr = 2;
      const rbs = draft.roster.filter((p) => p.position === 'RB').length;
      const wrs = draft.roster.filter((p) => p.position === 'WR').length;
      benchRb += Math.max(0, rbs - skillRb);
      benchWr += Math.max(0, wrs - skillWr);
    }
    expect(benchRb).toBeGreaterThan(0);
    expect(benchWr).toBeGreaterThan(0);

    const columns = Math.max(0, ...result.positionGrid.map((c) => c.pickIndex + 1));
    expect(columns).toBe(REC_PICKS);
    expect(result.positionGrid).toHaveLength(4 * REC_PICKS);
    expect(new Set(result.positionGrid.map((c) => c.position))).toEqual(
      new Set(['RB', 'WR', 'QB', 'TE']),
    );
    const byId = new Map(pool.map((p) => [p.id, p]));
    for (const cell of result.positionGrid) {
      expect(cell.topPlayers.length).toBeLessThanOrEqual(5);
      const counts = cell.topPlayers.map((p) => p.count);
      expect(counts).toEqual([...counts].sort((a, b) => b - a));
      for (const row of cell.topPlayers) {
        expect(byId.get(row.playerId)?.position).toBe(cell.position);
      }
      if (cell.count > 0 && !cell.locked && cell.pickIndex !== result.lockedPickCount) {
        const matching = result.flows.filter((f) => f.positions[cell.pickIndex] === cell.position);
        const weight = matching.reduce((sum, f) => sum + f.count, 0);
        const mean = matching.reduce((sum, f) => sum + f.expectedPpg * f.count, 0) / (weight || 1);
        expect(cell.expectedPpg).toBeCloseTo(mean);
        expect(cell.count).toBe(weight);
      }
    }
    expect(result.positionBranches.some((b) => b.benchIds.length > 0)).toBe(true);
  });

  it('uses the same expected PPG for pick-1 heatmap cells and branch cards', () => {
    const result = runSimulation(baseReq);
    expect(result.lockedPickCount).toBe(0);
    for (const branch of result.positionBranches) {
      const cell = result.positionGrid.find(
        (c) => c.pickIndex === result.lockedPickCount && c.position === branch.position,
      );
      expect(cell?.expectedPpg).toBe(branch.expectedPpg);
      expect(cell?.count).toBe(branch.ppgSamples.length);
    }
  });

  it('does not leave an ADP-2 player available at overall pick 9', () => {
    const star = mk('Star RB', 'RB', 340, 2, { ballersRank: 1 });
    const rest = [
      ...Array.from({ length: 4 }, (_, i) => mk(`QB ${i}`, 'QB', 300 - i, 20 + i)),
      ...Array.from({ length: 4 }, (_, i) => mk(`TE ${i}`, 'TE', 180 - i, 30 + i)),
      ...Array.from({ length: 40 }, (_, i) => mk(`RB ${i}`, 'RB', 200 - i, 4 + i)),
      ...Array.from({ length: 40 }, (_, i) => mk(`WR ${i}`, 'WR', 190 - i, 50 + i)),
    ];
    const pool = [star, ...rest];
    const result = runSimulation({
      ...baseReq,
      players: pool,
      rankingPlayerIds: pool.map((p) => p.id),
      settings: { ...DEFAULT_LEAGUE, teams: 12, rounds: 15 },
      mySlot: 9,
      sims: 40,
      seed: 2,
    });
    expect(result.availability.find((a) => a.playerId === star.id)?.pAvailableAtNext).toBe(0);
    for (const cell of result.positionGrid) {
      expect(cell.topPlayers.some((p) => p.playerId === star.id)).toBe(false);
    }
  });

  it('locks already-made skill picks in the heatmap and only simulates the rest', () => {
    const taken = mk('Taken RB', 'RB', 340, 1);
    const rest = [
      ...Array.from({ length: 8 }, (_, i) => mk(`QB ${i}`, 'QB', 300 - i, 20 + i)),
      ...Array.from({ length: 8 }, (_, i) => mk(`TE ${i}`, 'TE', 180 - i, 30 + i)),
      ...Array.from({ length: 40 }, (_, i) => mk(`RB ${i}`, 'RB', 200 - i, 4 + i)),
      ...Array.from({ length: 40 }, (_, i) => mk(`WR ${i}`, 'WR', 190 - i, 50 + i)),
    ];
    const pool = [taken, ...rest];
    const result = runSimulation({
      ...baseReq,
      players: pool,
      rankingPlayerIds: pool.map((p) => p.id),
      settings: { ...DEFAULT_LEAGUE, teams: 4, rounds: 15 },
      mySlot: 1,
      pickedPlayerIds: [taken.id],
      myPlayerIds: [taken.id],
      teamPlayerIds: { 1: [taken.id] },
      currentPickNo: 2,
      sims: 24,
      seed: 4,
    });
    expect(result.lockedPickCount).toBe(1);
    expect(result.nextPickNo).toBe(2);
    const columns = Math.max(0, ...result.positionGrid.map((c) => c.pickIndex + 1));
    expect(columns).toBe(REC_PICKS);

    const lockedRb = result.positionGrid.find((c) => c.pickIndex === 0 && c.position === 'RB');
    expect(lockedRb?.locked).toBe(true);
    expect(lockedRb?.count).toBe(24);
    expect(lockedRb?.topPlayers.map((p) => p.playerId)).toEqual([taken.id]);
    for (const position of ['WR', 'QB', 'TE'] as const) {
      const cell = result.positionGrid.find((c) => c.pickIndex === 0 && c.position === position);
      expect(cell?.locked).toBe(true);
      expect(cell?.count).toBe(0);
    }

    const lastCol = result.positionGrid.filter((c) => c.pickIndex === REC_PICKS - 1);
    expect(lastCol.every((c) => c.locked)).toBe(false);
    expect(lastCol.some((c) => c.count > 0)).toBe(true);

    for (const branch of result.positionBranches) {
      const cell = result.positionGrid.find(
        (c) => c.pickIndex === result.lockedPickCount && c.position === branch.position,
      );
      expect(cell?.locked).toBe(false);
      expect(cell?.expectedPpg).toBe(branch.expectedPpg);
      expect(cell?.count).toBe(branch.ppgSamples.length);
    }
  });

  it('lets FLEX/BENCH bags draft TE while the TE slot is empty', () => {
    const te = mk('Elite TE', 'TE', 210, 22);
    const rb = mk('Flex RB', 'RB', 180, 30);
    expect(positionsFromBag(['FLEX'], [], DEFAULT_LEAGUE.slots)).toEqual(
      expect.arrayContaining(['RB', 'WR', 'TE']),
    );
    expect(positionsFromBag(['BENCH'], [], DEFAULT_LEAGUE.slots)).toContain('TE');
    expect(positionsFromBag(['FLEX'], [te], DEFAULT_LEAGUE.slots)).not.toContain('TE');
    expect(positionsFromBag(['FLEX'], [rb], DEFAULT_LEAGUE.slots)).toContain('TE');
  });

  it('does not reach elite TE in R1 but takes the TE cliff in R2', () => {
    const tes = [
      mk('Bowers', 'TE', 210, 22, { ballersRank: 22 }),
      mk('McBride', 'TE', 205, 23, { ballersRank: 23 }),
      mk('Loveland', 'TE', 175, 44, { ballersRank: 44 }),
      ...Array.from({ length: 10 }, (_, i) =>
        mk(`TE ${i + 3}`, 'TE', 160 - i * 4, 50 + i, { ballersRank: 50 + i }),
      ),
    ];
    const rbs = Array.from({ length: 40 }, (_, i) => {
      const pts = i < 12 ? 340 - i * 8 : 200 - (i - 12) * 2;
      const adp = i + 1;
      return mk(`RB ${i}`, 'RB', pts, adp, { ballersRank: adp });
    });
    const wrs = Array.from({ length: 40 }, (_, i) => {
      const pts = i < 8 ? 300 - i * 12 : 210 - (i - 8) * 2;
      const adp = 80 + i;
      return mk(`WR ${i}`, 'WR', pts, adp, { ballersRank: 80 + i });
    });
    const qbs = Array.from({ length: 12 }, (_, i) =>
      mk(`QB ${i}`, 'QB', 320 - i * 8, 90 + i, { ballersRank: 90 + i }),
    );
    const pool = [...rbs, ...wrs, ...tes, ...qbs];
    const rankingPlayerIds = [...pool].sort((a, b) => a.adp - b.adp).map((p) => p.id);
    const settings = { ...DEFAULT_LEAGUE, teams: 12, rounds: 15 };

    const r1 = runSimulation({
      ...baseReq,
      players: pool,
      rankingPlayerIds,
      settings,
      mySlot: 8,
      sims: 36,
      seed: 6,
      temperature: 1,
    });
    const teR1 = r1.positionBranches.find((b) => b.position === 'TE');
    const rbR1 = r1.positionBranches.find((b) => b.position === 'RB');
    expect(teR1?.expectedPpg).toBeDefined();
    expect(rbR1?.expectedPpg).toBeDefined();
    expect(teR1!.expectedPpg).toBeLessThan(rbR1!.expectedPpg);

    const taken = rankingPlayerIds.map((id) => pool.find((p) => p.id === id)!).slice(0, 16);
    const mine = taken.find((p) => p.position === 'RB') ?? taken[7]!;
    const r2 = runSimulation({
      ...baseReq,
      players: pool,
      rankingPlayerIds,
      settings,
      mySlot: 8,
      pickedPlayerIds: taken.map((p) => p.id),
      myPlayerIds: [mine.id],
      teamPlayerIds: { 8: [mine.id] },
      currentPickNo: 17,
      sims: 36,
      seed: 6,
      temperature: 1,
    });
    const teR2 = r2.positionBranches.find((b) => b.position === 'TE');
    const bestR2 = Math.max(...r2.positionBranches.map((b) => b.expectedPpg));
    expect(teR2?.expectedPpg).toBeDefined();
    expect(teR2!.expectedPpg).toBeGreaterThan(bestR2 - 1.5);
    expect(teR2!.pickPlayerId).toBe(tes[0]!.id);
  });
});
