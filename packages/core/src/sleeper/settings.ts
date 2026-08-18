import { DEFAULT_LEAGUE, DEFAULT_SLOTS } from '../defaults.js';
import { roundsFromSlots, withDerivedRounds } from '../league.js';
import type { DraftType, LeagueSettings, RosterSlots, ScoringFormat } from '../types.js';
import type { SleeperDraft, SleeperDraftSettings } from './types.js';

const SLOT_FIELDS = [
  'slots_qb',
  'slots_rb',
  'slots_wr',
  'slots_te',
  'slots_flex',
  'slots_super_flex',
  'slots_def',
  'slots_k',
  'slots_bn',
] as const;

export function settingsFromSleeperDraft(d: SleeperDraft): {
  settings: LeagueSettings;
  mySlot: number | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  const raw = d.settings ?? {};
  const teams = raw.teams ?? DEFAULT_LEAGUE.teams;
  const draftType = draftTypeFromSleeper(d.type, warnings);
  const scoring = scoringFromSleeper(d.metadata?.scoring_type);
  const slots = slotsFromSleeper(raw, warnings);
  reconcileRounds(slots, raw.rounds);
  const mySlot = mySlotFromSleeperDraft(d, teams);

  return {
    settings: withDerivedRounds({
      teams,
      rounds: roundsFromSlots(slots),
      draftType,
      scoring,
      slots,
    }),
    mySlot,
    warnings,
  };
}

/** Slot is knowable without Sleeper auth when only one human is in draft_order (CPU mocks). */
export function mySlotFromSleeperDraft(d: SleeperDraft, teams?: number): number | null {
  const order = d.draft_order;
  if (!order) return null;
  const slots = Object.values(order).filter((slot) => Number.isInteger(slot) && slot > 0);
  const unique = slots.length === 1 ? slots[0] : undefined;
  const creatorId = d.creators?.[0];
  const creatorSlot = creatorId != null ? order[creatorId] : undefined;
  const picked = unique ?? (d.league_id == null && creatorSlot != null ? creatorSlot : undefined);
  if (picked == null) return null;
  const max = teams ?? d.settings?.teams ?? picked;
  if (picked > max) return null;
  return picked;
}

function draftTypeFromSleeper(type: string, warnings: string[]): DraftType {
  if (type === 'linear') return 'linear';
  if (type === 'auction') {
    warnings.push('Auction drafts are not supported; treating as snake.');
  } else if (type && type !== 'snake') {
    warnings.push(`Unknown draft type "${type}"; treating as snake.`);
  }
  return 'snake';
}

function scoringFromSleeper(raw?: string): ScoringFormat {
  const key = (raw ?? '').toLowerCase().replace(/[_-]/g, '');
  if (key === 'ppr') return 'ppr';
  if (key === 'halfppr') return 'half-ppr';
  if (key === 'std' || key === 'standard' || key === 'nonppr' || key === '0ppr') return 'standard';
  return DEFAULT_LEAGUE.scoring;
}

function slotsFromSleeper(raw: SleeperDraftSettings, warnings: string[]): RosterSlots {
  const hasAny = SLOT_FIELDS.some((key) => raw[key] != null);
  if (!hasAny) return { ...DEFAULT_SLOTS };

  const superFlex = raw.slots_super_flex ?? 0;
  if (superFlex > 0) {
    warnings.push('Superflex is graded as a standard RB/WR/TE flex.');
  }

  return {
    QB: raw.slots_qb ?? 0,
    RB: raw.slots_rb ?? 0,
    WR: raw.slots_wr ?? 0,
    TE: raw.slots_te ?? 0,
    FLEX: (raw.slots_flex ?? 0) + superFlex,
    DST: raw.slots_def ?? 0,
    K: raw.slots_k ?? 0,
    BENCH: raw.slots_bn ?? 0,
  };
}

function reconcileRounds(slots: RosterSlots, sleeperRounds: number | undefined): void {
  if (sleeperRounds == null) return;
  const derived = roundsFromSlots(slots);
  slots.BENCH = Math.max(0, slots.BENCH + (sleeperRounds - derived));
}
