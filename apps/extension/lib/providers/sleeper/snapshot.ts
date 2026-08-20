import {
  WIRE_VERSION,
  type DraftPhase,
  type DraftSnapshot,
  type DraftedPlayer,
  type WireDraftType,
  type WireRosterSlots,
  type WireScoring,
} from '@draftrr/wire';
import { fetchDraft, fetchDraftPicks } from './api';
import type { SleeperDraft, SleeperDraftSettings, SleeperPick } from './apiTypes';

const DEFAULT_TEAMS = 12;
const DEFAULT_SCORING: WireScoring = 'half-ppr';
const DEFAULT_SLOTS: WireRosterSlots = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  FLEX: 2,
  DST: 1,
  K: 0,
  BENCH: 6,
};

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

const SLOT_KEYS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'DST', 'K', 'BENCH'] as const;

function roundsFromSlots(slots: WireRosterSlots): number {
  return SLOT_KEYS.reduce((sum, key) => sum + (slots[key] ?? 0), 0);
}

function draftTypeFromSleeper(type: string, warnings: string[]): WireDraftType {
  if (type === 'linear') return 'linear';
  if (type === 'auction') {
    warnings.push('Auction drafts are not supported; treating as snake.');
  } else if (type && type !== 'snake') {
    warnings.push(`Unknown draft type "${type}"; treating as snake.`);
  }
  return 'snake';
}

function scoringFromSleeper(raw?: string): WireScoring {
  const key = (raw ?? '').toLowerCase().replace(/[_-]+/g, '');
  if (key === 'ppr') return 'ppr';
  if (key === 'halfppr') return 'half-ppr';
  if (key === 'std' || key === 'standard' || key === 'nonppr' || key === '0ppr') return 'standard';
  return DEFAULT_SCORING;
}

function slotsFromSleeper(raw: SleeperDraftSettings, warnings: string[]): WireRosterSlots {
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

function reconcileRounds(slots: WireRosterSlots, sleeperRounds: number | undefined): void {
  if (sleeperRounds == null) return;
  const derived = roundsFromSlots(slots);
  slots.BENCH = Math.max(0, slots.BENCH + (sleeperRounds - derived));
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

function phaseFromSleeper(status: string): DraftPhase {
  if (status === 'pre_draft') return 'pre';
  if (status === 'complete') return 'done';
  return 'live';
}

function draftedFromPicks(picks: SleeperPick[]): DraftedPlayer[] {
  return picks.map((sp) => {
    const name = [sp.metadata?.first_name, sp.metadata?.last_name].filter(Boolean).join(' ');
    return {
      name,
      externalId: sp.player_id,
      position: sp.metadata?.position,
      team: sp.metadata?.team,
      pickNo: sp.pick_no,
      round: sp.round,
      slot: sp.draft_slot,
    };
  });
}

export function snapshotFromSleeper(
  draft: SleeperDraft,
  picks: SleeperPick[],
  draftId: string,
  now = Date.now(),
): DraftSnapshot {
  const warnings: string[] = [];
  const raw = draft.settings ?? {};
  const teams = raw.teams ?? DEFAULT_TEAMS;
  const draftType = draftTypeFromSleeper(draft.type, warnings);
  const scoring = scoringFromSleeper(draft.metadata?.scoring_type);
  const slots = slotsFromSleeper(raw, warnings);
  reconcileRounds(slots, raw.rounds);
  const mySlot = mySlotFromSleeperDraft(draft, teams);
  const drafted = draftedFromPicks(picks);

  return {
    wire: WIRE_VERSION,
    draftKey: `sleeper:${draftId}`,
    draftName: draft.metadata?.name ?? null,
    phase: phaseFromSleeper(draft.status),
    currentPickNo: drafted.length + 1,
    mySlot,
    teams,
    rounds: roundsFromSlots(slots),
    draftType,
    scoring,
    slots,
    drafted,
    warnings,
    updatedAt: now,
  };
}

export async function fetchSnapshot(draftId: string): Promise<DraftSnapshot> {
  const d = await fetchDraft(draftId);
  if (!d.data) {
    throw new Error('Sleeper returned an empty draft.');
  }
  const p = await fetchDraftPicks(draftId);
  return snapshotFromSleeper(d.data, p.data ?? [], draftId);
}
