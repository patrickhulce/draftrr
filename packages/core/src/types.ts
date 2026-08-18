export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'DST', 'K'] as const;
export type Position = (typeof POSITIONS)[number];
export type FlexEligible = 'RB' | 'WR' | 'TE';

export interface Player {
  id: string;
  name: string;
  team: string;
  position: Position;
  bye: number;
  projectedPoints: number;
  adp: number;
  adpStdev?: number;
  sleeperId?: string;
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
  sleeperPlayerId?: string;
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
  sleeperDraftId?: string;
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
  medianStarterPpg: number;
  slotsFilled: LineupResult['slotsFilled'];
  benchIds: string[];
}

export interface SimulationResult {
  availability: AvailabilityRow[];
  projectedAtNext: ProjectedAtNext[];
  positionBranches: PositionBranch[];
  nextPickNo: number;
  nextMyPickNo: number | null;
}

export interface EngineRequest {
  players: Player[];
  settings: LeagueSettings;
  mySlot: number;
  pickedPlayerIds: string[];
  myPlayerIds: string[];
  rankingPlayerIds: string[];
  sims: number;
  seed: number;
  temperature: number;
}

export type MatchKind = 'sleeperId' | 'nameKey' | 'looseKey' | 'alias' | 'fuzzy' | 'unmatched';

export interface MatchResult {
  kind: MatchKind;
  player?: Player;
  candidates: FuzzyCandidate[];
}
