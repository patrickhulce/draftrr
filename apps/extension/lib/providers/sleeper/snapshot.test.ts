import { describe, expect, it } from 'vitest';
import { snapshotFromSleeper } from './snapshot';
import type { SleeperDraft, SleeperPick } from './apiTypes';

const halfPpr: SleeperDraft = {
  draft_id: '1395306660167163904',
  type: 'snake',
  status: 'complete',
  sport: 'nfl',
  season: '2026',
  creators: ['434212286643564544'],
  draft_order: { '434212286643564544': 9 },
  league_id: null,
  settings: {
    teams: 12,
    rounds: 15,
    slots_qb: 1,
    slots_rb: 2,
    slots_wr: 2,
    slots_te: 1,
    slots_flex: 2,
    slots_k: 1,
    slots_def: 1,
    slots_bn: 5,
  },
  metadata: { scoring_type: 'half_ppr', name: 'Mock' },
};

const superflex: SleeperDraft = {
  draft_id: '2',
  type: 'snake',
  status: 'pre_draft',
  sport: 'nfl',
  season: '2026',
  settings: {
    teams: 10,
    rounds: 16,
    slots_qb: 1,
    slots_rb: 2,
    slots_wr: 2,
    slots_te: 1,
    slots_flex: 1,
    slots_super_flex: 1,
    slots_k: 0,
    slots_def: 1,
    slots_bn: 6,
  },
  metadata: { scoring_type: 'ppr' },
};

describe('snapshotFromSleeper', () => {
  it('maps a 12-team half-PPR snake draft', () => {
    const snap = snapshotFromSleeper(halfPpr, [], halfPpr.draft_id);
    expect(snap.warnings).toEqual([]);
    expect(snap.teams).toBe(12);
    expect(snap.draftType).toBe('snake');
    expect(snap.scoring).toBe('half-ppr');
    expect(snap.slots).toEqual({
      QB: 1,
      RB: 2,
      WR: 2,
      TE: 1,
      FLEX: 2,
      DST: 1,
      K: 1,
      BENCH: 5,
    });
    expect(snap.rounds).toBe(15);
    expect(snap.phase).toBe('done');
    expect(snap.draftKey).toBe('sleeper:1395306660167163904');
    expect(snap.draftName).toBe('Mock');
  });

  it('folds superflex into FLEX and warns', () => {
    const snap = snapshotFromSleeper(superflex, [], superflex.draft_id);
    expect(snap.warnings).toContain('Superflex is graded as a standard RB/WR/TE flex.');
    expect(snap.teams).toBe(10);
    expect(snap.scoring).toBe('ppr');
    expect(snap.slots.FLEX).toBe(2);
    expect(snap.slots.QB).toBe(1);
    expect(snap.rounds).toBe(16);
    expect(snap.phase).toBe('pre');
  });

  it('absorbs a rounds mismatch into BENCH', () => {
    const snap = snapshotFromSleeper(
      { ...halfPpr, settings: { ...halfPpr.settings, rounds: 16, slots_bn: 5 } },
      [],
      halfPpr.draft_id,
    );
    expect(snap.slots.BENCH).toBe(6);
    expect(snap.rounds).toBe(16);
  });

  it('treats auction as snake with a warning', () => {
    const snap = snapshotFromSleeper({ ...halfPpr, type: 'auction' }, [], halfPpr.draft_id);
    expect(snap.draftType).toBe('snake');
    expect(snap.warnings.some((w) => /auction/i.test(w))).toBe(true);
  });

  it('keeps linear drafts linear', () => {
    const snap = snapshotFromSleeper({ ...halfPpr, type: 'linear' }, [], halfPpr.draft_id);
    expect(snap.draftType).toBe('linear');
  });

  it('reads your slot from a single-entry draft_order', () => {
    const snap = snapshotFromSleeper(halfPpr, [], halfPpr.draft_id);
    expect(snap.mySlot).toBe(9);
  });

  it('uses the mock creator slot when draft_order has several humans', () => {
    const snap = snapshotFromSleeper(
      { ...halfPpr, draft_order: { '434212286643564544': 3, '999': 7 } },
      [],
      halfPpr.draft_id,
    );
    expect(snap.mySlot).toBe(3);
  });

  it('does not guess a slot in a full league draft', () => {
    const snap = snapshotFromSleeper(
      {
        ...halfPpr,
        league_id: 'league-1',
        draft_order: { '434212286643564544': 3, '999': 7 },
      },
      [],
      halfPpr.draft_id,
    );
    expect(snap.mySlot).toBeNull();
  });

  it('maps Sleeper picks onto drafted players', () => {
    const picks: SleeperPick[] = [
      {
        player_id: '7564',
        pick_no: 1,
        round: 1,
        draft_slot: 3,
        draft_id: '1',
        metadata: { first_name: 'Ja', last_name: 'Marr Chase', position: 'WR', team: 'CIN' },
      },
    ];
    const snap = snapshotFromSleeper({ ...halfPpr, status: 'drafting' }, picks, '1');
    expect(snap.phase).toBe('live');
    expect(snap.currentPickNo).toBe(2);
    expect(snap.drafted).toEqual([
      {
        name: 'Ja Marr Chase',
        externalId: '7564',
        position: 'WR',
        team: 'CIN',
        pickNo: 1,
        round: 1,
        slot: 3,
      },
    ]);
  });
});
