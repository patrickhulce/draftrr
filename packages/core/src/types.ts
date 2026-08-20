export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'DST', 'K'] as const;
export type Position = (typeof POSITIONS)[number];
export type FlexEligible = 'RB' | 'WR' | 'TE';
export type RosterSlotKind = Position | 'FLEX' | 'BENCH';

export interface Player {
  id: string;
  name: string;
  team: string;
  position: Position;
  bye: number;
  projectedPoints: number;
  adp: number;
  adpStdev?: number;
  externalId?: string;
  tier?: number;
  ballersRank?: number;
  notes?: string;
  risk?: number;
  upside?: number;
  nameKey: string;
  looseKey: string;
}

export type RankingItem =
  { kind: 'player'; playerId: string } | { kind: 'tier'; id: string; label: string };

export interface RankingSet {
  id: string;
  name: string;
  parentId?: string;
  items: RankingItem[];
  createdAt: number;
  updatedAt: number;
}

export interface RosterSlots {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  FLEX: number;
  DST: number;
  K: number;
  BENCH: number;
}

export type ScoringFormat = 'half-ppr' | 'ppr' | 'standard';
export type DraftType = 'snake' | 'linear';

export interface LeagueSettings {
  teams: number;
  rounds: number;
  draftType: DraftType;
  scoring: ScoringFormat;
  slots: RosterSlots;
}

export interface DraftPick {
  pickNo: number;
  round: number;
  slot: number;
  playerId: string | null;
  externalPlayerId?: string;
  rawName?: string;
  rawPosition?: string;
  rawTeam?: string;
}

export type DraftStatus = 'setup' | 'live' | 'complete';

export interface Draft {
  id: string;
  name: string;
  rankingSetId: string;
  settings: LeagueSettings;
  mySlot: number;
  draftKey?: string;
  picks: DraftPick[];
  status: DraftStatus;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export type AliasOrigin = 'user' | 'auto' | 'seed';

export interface PlayerAlias {
  sourceKey: string;
  playerId: string;
  origin: AliasOrigin;
}

export interface ImportRowError {
  row: number;
  message: string;
  raw: Record<string, string>;
}

export interface FuzzyCandidate {
  sourceName: string;
  sourcePosition?: Position;
  sourceTeam?: string;
  sourceBye?: number;
  candidate: Player;
  distance: number;
  positionMatch: boolean;
  teamMatch: boolean;
  byeMatch: boolean;
}

export interface ImportReport {
  players: Player[];
  unmappedColumns: string[];
  errors: ImportRowError[];
  fuzzyMatches: FuzzyCandidate[];
}

export interface LineupResult {
  starters: Player[];
  bench: Player[];
  starterPoints: number;
  benchPoints: number;
  slotsFilled: Partial<Record<Position | 'FLEX', string[]>>;
}

export interface AvailabilityRow {
  playerId: string;
  pAvailableAtNext: number;
  pAvailableByRound: number[];
}

export interface ProjectedAtNext {
  position: Position;
  playerIds: string[];
}

export interface PositionBranch {
  position: Position;
  pickPlayerId: string | null;
  expectedPpg: number;
  medianStarterPpg: number;
  slotsFilled: LineupResult['slotsFilled'];
  benchIds: string[];
  ppgSamples: number[];
}

export interface SimRecommendation {
  positions: Position[];
  expectedPpg: number;
}

export interface SelectionFlow {
  positions: Position[];
  count: number;
  expectedPpg: number;
}

export interface GridPickPlayer {
  playerId: string;
  expectedPpg: number;
  count: number;
}

export interface PositionRoundCell {
  position: Position;
  pickIndex: number;
  expectedPpg: number | null;
  count: number;
  topPlayers: GridPickPlayer[];
  locked?: boolean;
}

export interface SimulationResult {
  availability: AvailabilityRow[];
  projectedAtNext: ProjectedAtNext[];
  positionBranches: PositionBranch[];
  nextPickNo: number;
  nextMyPickNo: number | null;
  lockedPickCount: number;
  recommendation: SimRecommendation;
  ppgSamples: number[];
  flows: SelectionFlow[];
  positionGrid: PositionRoundCell[];
}

export interface EngineRequest {
  players: Player[];
  settings: LeagueSettings;
  mySlot: number;
  pickedPlayerIds: string[];
  myPlayerIds: string[];
  rankingPlayerIds: string[];
  teamPlayerIds?: Record<number, string[]>;
  /** 1-indexed overall pick to simulate from. Defaults to pickedPlayerIds.length + 1. */
  currentPickNo?: number;
  sims: number;
  seed: number;
  /** Softmax temperature in starter-PPG units. Higher = more exploration. */
  temperature: number;
}

export type MatchKind = 'externalId' | 'nameKey' | 'looseKey' | 'alias' | 'fuzzy' | 'unmatched';

export interface MatchResult {
  kind: MatchKind;
  player?: Player;
  candidates: FuzzyCandidate[];
}
