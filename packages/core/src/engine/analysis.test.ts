import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAGUE } from '../defaults.js';
import { withKeys } from '../players/ids.js';
import type { Player, Position } from '../types.js';
import { classifyStrategies, runAnalysis } from './analysis.js';
import { evaluatePositionBranches, rankIndexOf } from './simulate.js';
import { consensusStats } from './consensus.js';
import { createRng } from './rng.js';
import { pickOrder } from './snake.js';

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

function pick(pickNo: number, position: Position) {
  return { pickNo, position };
}

describe('classifyStrategies', () => {
  it('labels balanced as 1 RB and 1 WR in the first two rounds', () => {
    expect(classifyStrategies([pick(1, 'RB'), pick(24, 'WR')], 12)).toEqual(['balanced']);
    expect(classifyStrategies([pick(1, 'WR'), pick(24, 'RB')], 12)).toEqual(['balanced']);
  });

  it('labels double RB when both early picks are RB', () => {
    expect(classifyStrategies([pick(1, 'RB'), pick(24, 'RB')], 12)).toEqual(['doubleRb']);
  });

  it('labels early TE and QB independently of the first two rounds', () => {
    expect(classifyStrategies([pick(1, 'RB'), pick(24, 'WR'), pick(25, 'TE')], 12).sort()).toEqual(
      ['balanced', 'earlyTe'].sort(),
    );
    expect(classifyStrategies([pick(1, 'RB'), pick(24, 'RB'), pick(25, 'QB')], 12).sort()).toEqual(
      ['doubleRb', 'earlyQb'].sort(),
    );
  });

  it('does not label TE/QB taken in round 5+', () => {
    expect(classifyStrategies([pick(1, 'RB'), pick(24, 'WR'), pick(49, 'TE')], 12)).toEqual([
      'balanced',
    ]);
  });
});

describe('evaluatePositionBranches', () => {
  it('prefers the position whose forced path scores higher', () => {
    const wr = mk('Elite WR', 'WR', 400, 1);
    const rb = mk('Okay RB', 'RB', 120, 2);
    const filler = [
      mk('WR Two', 'WR', 80, 10),
      mk('RB Two', 'RB', 70, 11),
      mk('QB One', 'QB', 200, 12),
      mk('TE One', 'TE', 90, 13),
    ];
    const players = [wr, rb, ...filler];
    const rankIndex = rankIndexOf(players.map((p) => p.id));
    const stats = new Map(players.map((p) => [p.id, consensusStats(p, rankIndex.get(p.id))]));
    const settings = { ...DEFAULT_LEAGUE, teams: 2, rounds: 4 };
    const evals = evaluatePositionBranches({
      positions: ['RB', 'WR'],
      innerSims: 8,
      alreadyMine: [],
      pool: players,
      initialRosters: new Map([
        [1, []],
        [2, []],
      ]),
      order: pickOrder(settings.teams, settings.rounds, settings.draftType),
      currentPickNo: 1,
      totalPicks: settings.teams * settings.rounds,
      mySlot: 1,
      slots: settings.slots,
      rankIndex,
      stats,
      rng: createRng(1),
      temperature: 1,
    });
    expect(evals.get('WR')!.expectedPpg).toBeGreaterThan(evals.get('RB')!.expectedPpg);
  });
});

describe('runAnalysis', () => {
  it('returns one sample per outer world and four strategy cards', () => {
    const players = [
      mk('RB One', 'RB', 300, 1),
      mk('WR One', 'WR', 290, 2),
      mk('RB Two', 'RB', 270, 3),
      mk('WR Two', 'WR', 260, 4),
      mk('TE One', 'TE', 200, 6),
      mk('QB One', 'QB', 350, 8),
      mk('WR Three', 'WR', 160, 9),
      mk('RB Three', 'RB', 180, 7),
      mk('DST One', 'DST', 110, 11),
      mk('QB Two', 'QB', 300, 20),
      mk('TE Two', 'TE', 140, 10),
      mk('WR Four', 'WR', 150, 14),
    ];
    const result = runAnalysis({
      players,
      settings: { ...DEFAULT_LEAGUE, teams: 2, rounds: 6 },
      mySlot: 1,
      rankingPlayerIds: players.map((p) => p.id),
      outerSims: 4,
      innerSims: 2,
      seed: 3,
    });
    expect(result.ppgSamples).toHaveLength(4);
    expect(result.strategies.map((s) => s.id)).toEqual([
      'balanced',
      'doubleRb',
      'earlyTe',
      'earlyQb',
    ]);
    expect(result.strategies.reduce((n, s) => n + s.count, 0)).toBeGreaterThan(0);
    expect(result.medianPpg).toBeGreaterThan(0);
  });
});
