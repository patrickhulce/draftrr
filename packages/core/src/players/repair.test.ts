import { describe, expect, it } from 'vitest';
import { withKeys } from './ids.js';
import { parsePlayerId, repairRankingItems } from './repair.js';
import type { Player, RankingItem } from '../types.js';

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

const catalog = [
  p('A.J. Brown', 'WR', 'NE', { adp: 21 }),
  p("Ja'Marr Chase", 'WR', 'CIN', { adp: 1 }),
  p('San Francisco', 'DST', 'SF'),
];

describe('parsePlayerId', () => {
  it('splits team and position from the right', () => {
    expect(parsePlayerId('ajbrown-wr-phl')).toEqual({
      looseKey: 'ajbrown',
      position: 'WR',
      team: 'phl',
    });
    expect(parsePlayerId('sanfrancisco-dst-sf')).toEqual({
      looseKey: 'sanfrancisco',
      position: 'DST',
      team: 'sf',
    });
  });

  it('rejects malformed ids', () => {
    expect(parsePlayerId('ajbrown')).toBeNull();
    expect(parsePlayerId('ajbrown-xx-ne')).toBeNull();
  });
});

describe('repairRankingItems', () => {
  it('remaps a stale team suffix by loose key and position', () => {
    const { items, repaired, unresolved } = repairRankingItems(
      [
        { kind: 'tier', id: 't1', label: 'Tier 1' },
        { kind: 'player', playerId: 'ajbrown-wr-phl' },
      ],
      catalog,
    );
    expect(repaired).toBe(1);
    expect(unresolved).toEqual([]);
    expect(items).toEqual([
      { kind: 'tier', id: 't1', label: 'Tier 1' },
      { kind: 'player', playerId: 'ajbrown-wr-ne' },
    ]);
  });

  it('drops a remapped id that is already on the board', () => {
    const { items, repaired, unresolved } = repairRankingItems(
      [
        { kind: 'player', playerId: 'ajbrown-wr-ne' },
        { kind: 'player', playerId: 'ajbrown-wr-phi' },
      ],
      catalog,
    );
    expect(repaired).toBe(1);
    expect(unresolved).toEqual([]);
    expect(items).toEqual([{ kind: 'player', playerId: 'ajbrown-wr-ne' }]);
  });

  it('leaves unresolvable ids in place', () => {
    const { items, repaired, unresolved } = repairRankingItems(
      [{ kind: 'player', playerId: 'ghost-wr-xyz' }],
      catalog,
    );
    expect(repaired).toBe(0);
    expect(unresolved).toEqual(['ghost-wr-xyz']);
    expect(items).toEqual([{ kind: 'player', playerId: 'ghost-wr-xyz' }]);
  });

  it('keeps known ids unchanged', () => {
    const source: RankingItem[] = [
      { kind: 'player', playerId: 'jamarrchase-wr-cin' },
      { kind: 'player', playerId: 'ajbrown-wr-ne' },
    ];
    const { items, repaired, unresolved } = repairRankingItems(source, catalog);
    expect(repaired).toBe(0);
    expect(unresolved).toEqual([]);
    expect(items).toEqual(source);
  });
});
