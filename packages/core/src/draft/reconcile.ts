import type { DraftedPlayer } from '@draftrr/wire';
import { normalizePosition, normalizeTeam } from '../players/normalize.js';
import { matchPlayer, type MatchIndex } from '../players/match.js';
import type { DraftPick, MatchResult } from '../types.js';

export interface ReconciledPick {
  pick: DraftPick;
  match: MatchResult;
}

export function reconcileDrafted(drafted: DraftedPlayer[], index: MatchIndex): ReconciledPick[] {
  return drafted.map((dp) => {
    const position = dp.position ? normalizePosition(dp.position) : undefined;
    const team = dp.team ? (normalizeTeam(dp.team) ?? undefined) : undefined;
    const match = matchPlayer(
      {
        name: dp.name || undefined,
        position: position ?? undefined,
        team,
        externalId: dp.externalId,
      },
      index,
    );
    const pick: DraftPick = {
      pickNo: dp.pickNo,
      round: dp.round,
      slot: dp.slot,
      playerId: match.player?.id ?? null,
      externalPlayerId: dp.externalId,
      rawName: dp.name || undefined,
      rawPosition: dp.position,
      rawTeam: dp.team,
    };
    if (match.kind === 'fuzzy' && match.candidates[0] && match.candidates[0].distance === 1) {
      pick.playerId = match.candidates[0].candidate.id;
    }
    return { pick, match };
  });
}
