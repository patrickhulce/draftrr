import { describe, expect, it } from 'vitest';
import { withKeys } from './ids.js';
import { buildMatchIndex, findFuzzyCandidates, matchPlayer } from './match.js';
import type { Player } from '../types.js';

function p(
  name: string,
  position: Player['position'],
  team: string,
  extra: Partial<Player> = {},
): Player {
  return withKeys({
    name,
    position,
    team,
    bye: 10,
    projectedPoints: 100,
    adp: 50,
    ...extra,
  });
}

const players = [
  p("Ja'Marr Chase", 'WR', 'CIN', { externalId: '7564', adp: 1 }),
  p('A.J. Brown', 'WR', 'PHI', { adp: 12 }),
  p('Amon-Ra St. Brown', 'WR', 'DET', { adp: 7 }),
  p('Kenneth Walker III', 'RB', 'SEA', { adp: 40 }),
  p('Marquise Brown', 'WR', 'KC', { adp: 103 }),
  p('Gabriel Davis', 'WR', 'JAX', { adp: 120 }),
  p('Justin Jefferson', 'WR', 'MIN', { adp: 2 }),
  p('Josh Allen', 'QB', 'BUF', { adp: 14 }),
  p('San Francisco', 'DST', 'SF', { externalId: 'SF' }),
  p('D.J. Moore', 'WR', 'CHI', { adp: 55 }),
  p('Brandon Aubrey', 'K', 'DAL', { adp: 128 }),
];

describe('match cascade', () => {
  const index = buildMatchIndex(players, [
    { sourceKey: 'hollywoodbrown', playerId: players[4]!.id, origin: 'seed' },
  ]);

  it('matches external id first', () => {
    const r = matchPlayer({ externalId: '7564', name: 'Wrong Name', position: 'WR' }, index);
    expect(r.kind).toBe('externalId');
    expect(r.player?.name).toBe("Ja'Marr Chase");
  });

  it('matches apostrophe variants exactly', () => {
    const r = matchPlayer({ name: 'JaMarr Chase', position: 'WR' }, index);
    expect(r.kind === 'nameKey' || r.kind === 'looseKey').toBe(true);
    expect(r.player?.name).toBe("Ja'Marr Chase");
  });

  it('matches suffix variants exactly', () => {
    const r = matchPlayer({ name: 'Kenneth Walker', position: 'RB' }, index);
    expect(r.kind === 'nameKey' || r.kind === 'looseKey').toBe(true);
    expect(r.player?.name).toBe('Kenneth Walker III');
  });

  it('matches DST on team code', () => {
    const r = matchPlayer({ name: '49ers', position: 'DST', team: 'SF' }, index);
    expect(r.kind).toBe('nameKey');
    expect(r.player?.team).toBe('SF');
  });

  it('matches a kicker by name', () => {
    const r = matchPlayer({ name: 'Brandon Aubrey', position: 'K' }, index);
    expect(r.kind === 'nameKey' || r.kind === 'looseKey').toBe(true);
    expect(r.player?.name).toBe('Brandon Aubrey');
  });

  it('matches a unique kicker on team code', () => {
    const r = matchPlayer({ name: 'Cowboys K', position: 'K', team: 'DAL' }, index);
    expect(r.kind).toBe('nameKey');
    expect(r.player?.name).toBe('Brandon Aubrey');
  });

  it('uses saved aliases', () => {
    const r = matchPlayer({ name: 'Hollywood Brown', position: 'WR' }, index);
    expect(r.kind).toBe('alias');
    expect(r.player?.name).toBe('Marquise Brown');
  });

  it('surfaces close typos as fuzzy, not exact', () => {
    const r = matchPlayer({ name: 'Gabreil Davis', position: 'WR' }, index);
    expect(r.kind).toBe('fuzzy');
    expect(r.candidates[0]?.candidate.name).toBe('Gabriel Davis');
  });

  it('does not fuzzy-match different players who share a prefix', () => {
    const cands = findFuzzyCandidates({ name: 'Justin Fields', position: 'WR' }, index);
    expect(cands.some((c) => c.candidate.name === 'Justin Jefferson')).toBe(false);
    const r = matchPlayer({ name: 'Amon Brown', position: 'WR' }, index);
    expect(r.player).toBeUndefined();
    if (r.kind === 'fuzzy') {
      expect(r.candidates.every((c) => c.candidate.name !== 'A.J. Brown')).toBe(true);
    }
  });

  it('requires same position and shared prefix', () => {
    const cands = findFuzzyCandidates({ name: 'Josh Allen', position: 'WR' }, index);
    expect(cands).toHaveLength(0);
    const short = findFuzzyCandidates({ name: 'Xy', position: 'WR' }, index);
    expect(short).toHaveLength(0);
  });
});
