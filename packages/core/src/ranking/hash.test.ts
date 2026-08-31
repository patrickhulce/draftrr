import { describe, expect, it } from 'vitest';
import { hashRanking, nextRankingVersion, rankingPlayerIds, rankingVersionLabel } from './hash.js';
import type { RankingItem } from '../types.js';

describe('rankingPlayerIds', () => {
  it('skips tier breaks', () => {
    const items: RankingItem[] = [
      { kind: 'tier', id: 't1', label: 'Tier 1' },
      { kind: 'player', playerId: 'a' },
      { kind: 'player', playerId: 'b' },
      { kind: 'tier', id: 't2', label: 'Tier 2' },
      { kind: 'player', playerId: 'c' },
    ];
    expect(rankingPlayerIds(items)).toEqual(['a', 'b', 'c']);
  });
});

describe('hashRanking', () => {
  it('is stable for the same order', () => {
    expect(hashRanking(['a', 'b', 'c'])).toBe(hashRanking(['a', 'b', 'c']));
  });

  it('changes when order changes', () => {
    expect(hashRanking(['a', 'b', 'c'])).not.toBe(hashRanking(['a', 'c', 'b']));
  });
});

describe('nextRankingVersion', () => {
  it('starts at v1 when nothing has been analyzed', () => {
    const { version, bumped } = nextRankingVersion(undefined, 'set', ['a', 'b'], 10);
    expect(bumped).toBe(true);
    expect(version.version).toBe(1);
    expect(version.hash).toBe(hashRanking(['a', 'b']));
    expect(version.playerIds).toEqual(['a', 'b']);
    expect(version.createdAt).toBe(10);
  });

  it('does not bump when the hash is unchanged', () => {
    const first = nextRankingVersion(undefined, 'set', ['a', 'b'], 10).version;
    const again = nextRankingVersion(first, 'set', ['a', 'b'], 20);
    expect(again.bumped).toBe(false);
    expect(again.version).toBe(first);
  });

  it('bumps when the ranking order changes', () => {
    const first = nextRankingVersion(undefined, 'set', ['a', 'b'], 10).version;
    const next = nextRankingVersion(first, 'set', ['b', 'a'], 20);
    expect(next.bumped).toBe(true);
    expect(next.version.version).toBe(2);
    expect(next.version.playerIds).toEqual(['b', 'a']);
  });
});

describe('rankingVersionLabel', () => {
  it('labels never-analyzed boards', () => {
    expect(rankingVersionLabel(undefined, 'abc')).toBe('never analyzed');
  });

  it('shows the version when the board matches', () => {
    const v = nextRankingVersion(undefined, 'set', ['a'], 1).version;
    expect(rankingVersionLabel(v, v.hash)).toBe('v1');
  });

  it('notes edits since the last analyzed version', () => {
    const v = nextRankingVersion(undefined, 'set', ['a'], 1).version;
    expect(rankingVersionLabel(v, hashRanking(['b']))).toBe('edited since v1');
  });
});
