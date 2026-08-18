import { describe, expect, it } from 'vitest';
import { settingsFromSleeperDraft } from './settings.js';
import type { SleeperDraft } from './types.js';

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

describe('settingsFromSleeperDraft', () => {
  it('maps a 12-team half-PPR snake draft', () => {
    const { settings, warnings } = settingsFromSleeperDraft(halfPpr);
    expect(warnings).toEqual([]);
    expect(settings.teams).toBe(12);
    expect(settings.draftType).toBe('snake');
    expect(settings.scoring).toBe('half-ppr');
    expect(settings.slots).toEqual({
      QB: 1,
      RB: 2,
      WR: 2,
      TE: 1,
      FLEX: 2,
      DST: 1,
      K: 1,
      BENCH: 5,
    });
    expect(settings.rounds).toBe(15);
  });

  it('folds superflex into FLEX and warns', () => {
    const { settings, warnings } = settingsFromSleeperDraft(superflex);
    expect(warnings).toContain('Superflex is graded as a standard RB/WR/TE flex.');
    expect(settings.teams).toBe(10);
    expect(settings.scoring).toBe('ppr');
    expect(settings.slots.FLEX).toBe(2);
    expect(settings.slots.QB).toBe(1);
    expect(settings.rounds).toBe(16);
  });

  it('absorbs a rounds mismatch into BENCH', () => {
    const { settings } = settingsFromSleeperDraft({
      ...halfPpr,
      settings: { ...halfPpr.settings, rounds: 16, slots_bn: 5 },
    });
    expect(settings.slots.BENCH).toBe(6);
    expect(settings.rounds).toBe(16);
  });

  it('treats auction as snake with a warning', () => {
    const { settings, warnings } = settingsFromSleeperDraft({ ...halfPpr, type: 'auction' });
    expect(settings.draftType).toBe('snake');
    expect(warnings.some((w) => /auction/i.test(w))).toBe(true);
  });

  it('keeps linear drafts linear', () => {
    const { settings } = settingsFromSleeperDraft({ ...halfPpr, type: 'linear' });
    expect(settings.draftType).toBe('linear');
  });

  it('reads your slot from a single-entry draft_order', () => {
    const { mySlot } = settingsFromSleeperDraft(halfPpr);
    expect(mySlot).toBe(9);
  });

  it('uses the mock creator slot when draft_order has several humans', () => {
    const { mySlot } = settingsFromSleeperDraft({
      ...halfPpr,
      draft_order: { '434212286643564544': 3, '999': 7 },
    });
    expect(mySlot).toBe(3);
  });

  it('does not guess a slot in a full league draft', () => {
    const { mySlot } = settingsFromSleeperDraft({
      ...halfPpr,
      league_id: 'league-1',
      draft_order: { '434212286643564544': 3, '999': 7 },
    });
    expect(mySlot).toBeNull();
  });
});
