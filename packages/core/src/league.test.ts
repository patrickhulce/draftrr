import { describe, expect, it } from 'vitest';
import { DEFAULT_SLOTS } from './defaults.js';
import { roundsFromSlots, starterCount, withDerivedRounds } from './league.js';
import type { LeagueSettings } from './types.js';

describe('roundsFromSlots', () => {
  it('sums every roster slot', () => {
    expect(roundsFromSlots(DEFAULT_SLOTS)).toBe(15);
    expect(starterCount(DEFAULT_SLOTS)).toBe(9);
  });

  it('derives rounds onto league settings', () => {
    const settings: LeagueSettings = {
      teams: 10,
      rounds: 99,
      draftType: 'snake',
      scoring: 'ppr',
      slots: { ...DEFAULT_SLOTS, BENCH: 4 },
    };
    expect(withDerivedRounds(settings).rounds).toBe(13);
  });
});
