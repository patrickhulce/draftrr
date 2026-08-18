export interface SleeperDraftSettings {
  teams?: number;
  rounds?: number;
  slots_wr?: number;
  slots_te?: number;
  slots_rb?: number;
  slots_qb?: number;
  slots_flex?: number;
  slots_super_flex?: number;
  slots_k?: number;
  slots_def?: number;
  slots_bn?: number;
  pick_timer?: number;
}

export interface SleeperDraft {
  draft_id: string;
  type: 'snake' | 'linear' | 'auction' | string;
  status: 'pre_draft' | 'drafting' | 'paused' | 'complete' | string;
  sport: string;
  season: string;
  settings?: SleeperDraftSettings;
  draft_order?: Record<string, number> | null;
  slot_to_roster_id?: Record<string, number> | null;
  creators?: string[] | null;
  league_id?: string | null;
  metadata?: { scoring_type?: string; name?: string };
}

export interface SleeperPickMetadata {
  first_name?: string;
  last_name?: string;
  team?: string;
  position?: string;
  player_id?: string;
}

export interface SleeperPick {
  player_id: string;
  picked_by?: string;
  roster_id?: number | string;
  round: number;
  draft_slot: number;
  pick_no: number;
  metadata?: SleeperPickMetadata;
  is_keeper?: boolean | null;
  draft_id: string;
}

export const SLEEPER_BASE = 'https://api.sleeper.app/v1';
