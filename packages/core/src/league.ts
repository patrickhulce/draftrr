import type { LeagueSettings, RosterSlots } from './types.js';

const SLOT_KEYS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'DST', 'K', 'BENCH'] as const;

export function roundsFromSlots(slots: RosterSlots): number {
  return SLOT_KEYS.reduce((sum, key) => sum + (slots[key] ?? 0), 0);
}

export function starterCount(slots: RosterSlots): number {
  return roundsFromSlots(slots) - (slots.BENCH ?? 0);
}

export function withDerivedRounds(settings: LeagueSettings): LeagueSettings {
  return { ...settings, rounds: roundsFromSlots(settings.slots) };
}
