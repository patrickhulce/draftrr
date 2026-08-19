import { describe, expect, it } from 'vitest';
import { withKeys } from '../players/ids.js';
import { buildMatchIndex } from '../players/match.js';
import { reconcilePicks } from './reconcile.js';
import type { SleeperPick } from './types.js';
import { parseDraftId, sleeperGet } from './client.js';

const chase = withKeys({
  name: "Ja'Marr Chase",
  team: 'CIN',
  position: 'WR',
  bye: 12,
  projectedPoints: 340,
  adp: 1.4,
  sleeperId: '7564',
});

const picks: SleeperPick[] = [
  {
    player_id: '7564',
    pick_no: 1,
    round: 1,
    draft_slot: 1,
    draft_id: '1',
    metadata: { first_name: 'Ja', last_name: 'Marr Chase', position: 'WR', team: 'CIN' },
  },
  {
    player_id: '999',
    pick_no: 2,
    round: 1,
    draft_slot: 2,
    draft_id: '1',
    metadata: { first_name: 'Unknown', last_name: 'Player', position: 'RB', team: 'FA' },
  },
];

describe('reconcilePicks', () => {
  it('matches known sleeper ids and reports unmatched', () => {
    const result = reconcilePicks(picks, buildMatchIndex([chase]));
    expect(result[0]?.match.kind).toBe('sleeperId');
    expect(result[0]?.pick.playerId).toBe(chase.id);
    expect(result[1]?.match.kind).toBe('unmatched');
    expect(result[1]?.pick.playerId).toBeNull();
  });
});

describe('parseDraftId', () => {
  it('extracts ids from urls and raw digits', () => {
    expect(parseDraftId('https://sleeper.com/draft/nfl/1249218413365043200?x=1')).toBe(
      '1249218413365043200',
    );
    expect(parseDraftId('https://sleeper.com/draft/1249218413365043200')).toBe(
      '1249218413365043200',
    );
    expect(parseDraftId('https://sleeper.com/beta/draft/nfl/1395533647028690944')).toBe(
      '1395533647028690944',
    );
    expect(parseDraftId('https://sleeper.com/beta/draft/nfl/1395306660167163904?x=1')).toBe(
      '1395306660167163904',
    );
    expect(parseDraftId('1249218413365043200')).toBe('1249218413365043200');
    expect(parseDraftId('not-a-draft')).toBeNull();
  });
});

describe('sleeperGet', () => {
  it('does not send If-None-Match (Sleeper CORS rejects it)', async () => {
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.has('If-None-Match')).toBe(false);
      expect(init?.cache).toBe('no-store');
      expect(String(url)).toMatch(/[?&]_=\d+/);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
    await sleeperGet('/draft/1', fetchImpl);
  });
});
