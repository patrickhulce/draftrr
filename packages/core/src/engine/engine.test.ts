import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAGUE, PROJECTION_GAMES } from '../defaults.js';
import { withKeys } from '../players/ids.js';
import type { Player } from '../types.js';
import { consensusStats } from './consensus.js';
import { optimalLineup } from './lineup.js';
import { createRng } from './rng.js';
import {
  nextPickForSlot,
  picksForSlot,
  slotForPick,
  worstCaseHighlighted,
  worstCaseReachable,
  worstCaseSkip,
} from './snake.js';
import { runSimulation, worstCaseProjectedAtNext } from './simulate.js';

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
    const season = result.starters.reduce((sum, p) => sum + p.projectedPoints, 0);
    expect(result.starterPoints).toBeCloseTo(season / PROJECTION_GAMES);
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
    expect(rb?.medianStarterPpg).toBeGreaterThan(0);
    expect(rb?.slotsFilled.RB?.length).toBeGreaterThan(0);
  });
});
