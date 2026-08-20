import { describe, expect, it } from 'vitest';
import type { DraftedPlayer } from '@draftrr/wire';
import { withKeys } from '../players/ids.js';
import { buildMatchIndex } from '../players/match.js';
import { reconcileDrafted } from './reconcile.js';

const chase = withKeys({
  name: "Ja'Marr Chase",
  team: 'CIN',
  position: 'WR',
  bye: 12,
  projectedPoints: 340,
  adp: 1.4,
  externalId: '7564',
});

const drafted: DraftedPlayer[] = [
  {
    name: 'Ja Marr Chase',
    externalId: '7564',
    position: 'WR',
    team: 'CIN',
    pickNo: 1,
    round: 1,
    slot: 1,
  },
  {
    name: 'Unknown Player',
    externalId: '999',
    position: 'RB',
    team: 'FA',
    pickNo: 2,
    round: 1,
    slot: 2,
  },
];

describe('reconcileDrafted', () => {
  it('matches known external ids and reports unmatched', () => {
    const result = reconcileDrafted(drafted, buildMatchIndex([chase]));
    expect(result[0]?.match.kind).toBe('externalId');
    expect(result[0]?.pick.playerId).toBe(chase.id);
    expect(result[1]?.match.kind).toBe('unmatched');
    expect(result[1]?.pick.playerId).toBeNull();
  });
});
