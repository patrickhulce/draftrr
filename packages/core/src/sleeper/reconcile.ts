import { normalizePosition, normalizeTeam } from '../players/normalize.js';
import { matchPlayer, type MatchIndex } from '../players/match.js';
import type { DraftPick, MatchResult } from '../types.js';
import type { SleeperPick } from './types.js';

export interface ReconciledPick {
  pick: DraftPick;
  match: MatchResult;
}

export function reconcilePicks(picks: SleeperPick[], index: MatchIndex): ReconciledPick[] {
  return picks.map((sp) => {
    const name = [sp.metadata?.first_name, sp.metadata?.last_name].filter(Boolean).join(' ');
    const position = sp.metadata?.position ? normalizePosition(sp.metadata.position) : undefined;
    const team = sp.metadata?.team ? (normalizeTeam(sp.metadata.team) ?? undefined) : undefined;
    const match = matchPlayer(
      {
        name: name || undefined,
        position: position ?? undefined,
        team,
        sleeperId: sp.player_id,
      },
      index,
    );
    const pick: DraftPick = {
      pickNo: sp.pick_no,
      round: sp.round,
      slot: sp.draft_slot,
      playerId: match.player?.id ?? (match.kind === 'fuzzy' ? null : null),
      sleeperPlayerId: sp.player_id,
      rawName: name || undefined,
      rawPosition: sp.metadata?.position,
      rawTeam: sp.metadata?.team,
    };
    if (match.kind === 'fuzzy' && match.candidates[0] && match.candidates[0].distance === 1) {
      pick.playerId = match.candidates[0].candidate.id;
    }
    return { pick, match };
  });
}
