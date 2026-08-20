export const WIRE_VERSION = 1;

export type DraftPhase = 'pre' | 'live' | 'done';
export type WireDraftType = 'snake' | 'linear';
export type WireScoring = 'half-ppr' | 'ppr' | 'standard';

export interface WireRosterSlots {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  FLEX: number;
  DST: number;
  K: number;
  BENCH: number;
}

/** A player already off the board. Undrafted players are never reported. */
export interface DraftedPlayer {
  name: string;
  externalId?: string;
  position?: string;
  team?: string;
  /** 1-indexed overall pick: this is the "when". */
  pickNo: number;
  round: number;
  /** 1-indexed team slot. */
  slot: number;
}

export interface DraftSnapshot {
  wire: typeof WIRE_VERSION;
  /** Opaque to the app, e.g. "provider:123". */
  draftKey: string;
  draftName: string | null;
  phase: DraftPhase;
  /** Pick on the clock. */
  currentPickNo: number;
  mySlot: number | null;
  teams: number;
  rounds: number;
  draftType: WireDraftType;
  scoring: WireScoring;
  slots: WireRosterSlots;
  drafted: DraftedPlayer[];
  warnings: string[];
  updatedAt: number;
}

export type LinkState = 'idle' | 'connecting' | 'linked' | 'stale' | 'error';

export interface LinkStatus {
  wire: typeof WIRE_VERSION;
  state: LinkState;
  draftKey: string | null;
  draftName: string | null;
  error: string | null;
  updatedAt: number;
}

export const WIRE_MSG = {
  hello: 'draftrr:hello',
  connect: 'draftrr:connect',
  refresh: 'draftrr:refresh',
  disconnect: 'draftrr:disconnect',
  link: 'draftrr:link',
  snapshot: 'draftrr:snapshot',
} as const;

export type WireMsg = (typeof WIRE_MSG)[keyof typeof WIRE_MSG];

const PHASES = new Set<DraftPhase>(['pre', 'live', 'done']);
const DRAFT_TYPES = new Set<WireDraftType>(['snake', 'linear']);
const SCORINGS = new Set<WireScoring>(['half-ppr', 'ppr', 'standard']);
const LINK_STATES = new Set<LinkState>(['idle', 'connecting', 'linked', 'stale', 'error']);
const SLOT_KEYS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'DST', 'K', 'BENCH'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSlots(value: unknown): value is WireRosterSlots {
  if (!isRecord(value)) return false;
  return SLOT_KEYS.every((key) => typeof value[key] === 'number');
}

function isDraftedPlayer(value: unknown): value is DraftedPlayer {
  if (!isRecord(value)) return false;
  if (typeof value.name !== 'string') return false;
  if (typeof value.pickNo !== 'number') return false;
  if (typeof value.round !== 'number') return false;
  if (typeof value.slot !== 'number') return false;
  if (value.externalId !== undefined && typeof value.externalId !== 'string') return false;
  if (value.position !== undefined && typeof value.position !== 'string') return false;
  if (value.team !== undefined && typeof value.team !== 'string') return false;
  return true;
}

export function isDraftSnapshot(value: unknown): value is DraftSnapshot {
  if (!isRecord(value)) return false;
  if (value.wire !== WIRE_VERSION) return false;
  if (typeof value.draftKey !== 'string' || !value.draftKey) return false;
  if (value.draftName !== null && typeof value.draftName !== 'string') return false;
  if (!PHASES.has(value.phase as DraftPhase)) return false;
  if (typeof value.currentPickNo !== 'number') return false;
  if (value.mySlot !== null && typeof value.mySlot !== 'number') return false;
  if (typeof value.teams !== 'number') return false;
  if (typeof value.rounds !== 'number') return false;
  if (!DRAFT_TYPES.has(value.draftType as WireDraftType)) return false;
  if (!SCORINGS.has(value.scoring as WireScoring)) return false;
  if (!isSlots(value.slots)) return false;
  if (!Array.isArray(value.drafted) || !value.drafted.every(isDraftedPlayer)) return false;
  if (!Array.isArray(value.warnings) || !value.warnings.every((w) => typeof w === 'string')) {
    return false;
  }
  if (typeof value.updatedAt !== 'number') return false;
  return true;
}

export function isLinkStatus(value: unknown): value is LinkStatus {
  if (!isRecord(value)) return false;
  if (value.wire !== WIRE_VERSION) return false;
  if (!LINK_STATES.has(value.state as LinkState)) return false;
  if (value.draftKey !== null && typeof value.draftKey !== 'string') return false;
  if (value.draftName !== null && typeof value.draftName !== 'string') return false;
  if (value.error !== null && typeof value.error !== 'string') return false;
  if (typeof value.updatedAt !== 'number') return false;
  return true;
}
