import { roundsFromSlots } from './league.js';
import type { LeagueSettings, RosterSlots } from './types.js';

export const DEFAULT_SLOTS: RosterSlots = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  FLEX: 2,
  DST: 1,
  K: 0,
  BENCH: 6,
};

export const DEFAULT_LEAGUE: LeagueSettings = {
  teams: 12,
  rounds: roundsFromSlots(DEFAULT_SLOTS),
  draftType: 'snake',
  scoring: 'half-ppr',
  slots: DEFAULT_SLOTS,
};

export const DEFAULT_SIMS = 800;
export const DEFAULT_TEMPERATURE = 4;
export const PROJECTION_GAMES = 16;
export const NAME_PREFIX_LEN = 3;
export const MAX_EDIT_DISTANCE = 4;
