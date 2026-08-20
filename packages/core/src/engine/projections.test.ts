import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAGUE } from '../defaults.js';
import { withKeys } from '../players/ids.js';
import type { Player } from '../types.js';
import { createRng } from './rng.js';
import {
  UPSIDE_CEILING,
  positionProjectionBounds,
  projectionRange,
  sampleProjectedPoints,
} from './projections.js';
import { runSimulation } from './simulate.js';

function mk(
  name: string,
  pos: Player['position'],
  pts: number,
  extra: Partial<Player> = {},
): Player {
  return withKeys({
    name,
    position: pos,
    team: 'BUF',
    bye: 12,
    projectedPoints: pts,
    adp: 1,
    ...extra,
  });
}

describe('projection bounds', () => {
  it('sets upside of 10 to 1.1× position max', () => {
    const pool = [
      mk('WR Ace', 'WR', 280, { upside: 10, risk: 1 }),
      mk('WR Two', 'WR', 200, { upside: 5, risk: 2 }),
      mk('WR Three', 'WR', 120, { upside: 3, risk: 4 }),
      mk('WR Four', 'WR', 80, { upside: 2, risk: 5 }),
    ];
    const bounds = positionProjectionBounds(pool);
    const range = projectionRange(pool[0]!, bounds);
    expect(range.max).toBeCloseTo(UPSIDE_CEILING * 280);
    expect(range.mean).toBe(280);
  });

  it('sets risk of 10 to the 75th-percentile player at the position', () => {
    const pool = [
      mk('QB 1', 'QB', 400, { risk: 10, upside: 2 }),
      mk('QB 2', 'QB', 380, { risk: 10, upside: 2 }),
      mk('QB 3', 'QB', 350, { risk: 10, upside: 2 }),
      mk('QB 4', 'QB', 300, { risk: 10, upside: 2 }),
    ];
    // n=4, round(0.75*4)=3 → 3rd-best = 350
    const bounds = positionProjectionBounds(pool);
    expect(bounds.get('QB')?.floor).toBe(350);
    const range = projectionRange(pool[0]!, bounds);
    expect(range.min).toBe(350);
  });

  it('keeps missing risk/upside degenerate at the mean', () => {
    const pool = [mk('DST', 'DST', 110), mk('DST 2', 'DST', 90)];
    const bounds = positionProjectionBounds(pool);
    const range = projectionRange(pool[0]!, bounds);
    expect(range).toEqual({ mean: 110, min: 110, max: 110 });
  });

  it('does not pull a below-floor player up when risk is high', () => {
    const pool = [
      mk('WR Ace', 'WR', 280, { risk: 10, upside: 1 }),
      mk('WR Two', 'WR', 200, { risk: 10, upside: 1 }),
      mk('WR Three', 'WR', 120, { risk: 10, upside: 1 }),
      mk('WR Four', 'WR', 80, { risk: 10, upside: 1 }),
    ];
    const bounds = positionProjectionBounds(pool);
    const last = projectionRange(pool[3]!, bounds);
    expect(last.min).toBe(80);
    expect(last.max).toBeGreaterThanOrEqual(80);
  });
});

describe('sampleProjectedPoints', () => {
  it('stays inside [min, max]', () => {
    const pool = [
      mk('RB Ace', 'RB', 330, { risk: 8, upside: 10 }),
      mk('RB Two', 'RB', 250, { risk: 5, upside: 6 }),
      mk('RB Three', 'RB', 180, { risk: 4, upside: 4 }),
      mk('RB Four', 'RB', 90, { risk: 3, upside: 2 }),
    ];
    const bounds = positionProjectionBounds(pool);
    const rng = createRng(99);
    for (const player of pool) {
      const range = projectionRange(player, bounds);
      for (let i = 0; i < 200; i++) {
        const drawn = sampleProjectedPoints(player, bounds, rng);
        expect(drawn).toBeGreaterThanOrEqual(range.min);
        expect(drawn).toBeLessThanOrEqual(range.max);
      }
    }
  });

  it('returns the mean when risk and upside are zero', () => {
    const player = mk('Safe', 'TE', 210, { risk: 0, upside: 0 });
    const bounds = positionProjectionBounds([player, mk('TE 2', 'TE', 150)]);
    expect(sampleProjectedPoints(player, bounds, createRng(1))).toBe(210);
  });
});

describe('stochastic simulation', () => {
  function skillPool(): Player[] {
    return [
      ...Array.from({ length: 12 }, (_, i) =>
        mk(`RB ${i}`, 'RB', 300 - i * 8, { risk: 2 + (i % 5), upside: 9 - (i % 4), adp: i + 1 }),
      ),
      ...Array.from({ length: 12 }, (_, i) =>
        mk(`WR ${i}`, 'WR', 280 - i * 8, {
          risk: 3 + (i % 4),
          upside: 8 - (i % 5),
          adp: 20 + i,
        }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        mk(`QB ${i}`, 'QB', 380 - i * 10, { risk: 2, upside: 8, adp: 40 + i }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        mk(`TE ${i}`, 'TE', 200 - i * 8, { risk: 3, upside: 7, adp: 50 + i }),
      ),
    ];
  }

  const baseReq = {
    settings: { ...DEFAULT_LEAGUE, teams: 4, rounds: 6 },
    mySlot: 1,
    pickedPlayerIds: [] as string[],
    myPlayerIds: [] as string[],
    sims: 24,
    seed: 42,
    temperature: 3,
  };

  it('matches fixed projections when stochasticProjections is omitted or false', () => {
    const players = skillPool().map((p) => ({ ...p, risk: undefined, upside: undefined }));
    const rankingPlayerIds = players.map((p) => p.id);
    const omitted = runSimulation({ ...baseReq, players, rankingPlayerIds });
    const off = runSimulation({
      ...baseReq,
      players,
      rankingPlayerIds,
      stochasticProjections: false,
    });
    expect(off.ppgSamples).toEqual(omitted.ppgSamples);
    expect(off.availability).toEqual(omitted.availability);
  });

  it('is deterministic with a seed when stochastic projections are on', () => {
    const players = skillPool();
    const rankingPlayerIds = players.map((p) => p.id);
    const req = { ...baseReq, players, rankingPlayerIds, stochasticProjections: true as const };
    expect(runSimulation(req).ppgSamples).toEqual(runSimulation(req).ppgSamples);
  });

  it('increases PPG sample spread versus fixed projections', () => {
    const players = skillPool();
    const rankingPlayerIds = players.map((p) => p.id);
    const shared = { ...baseReq, players, rankingPlayerIds, sims: 40, seed: 7 };
    const fixed = runSimulation({ ...shared, stochasticProjections: false });
    const stochastic = runSimulation({ ...shared, stochasticProjections: true });
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    expect(spread(stochastic.ppgSamples)).toBeGreaterThan(spread(fixed.ppgSamples));
  });
});
