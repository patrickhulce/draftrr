import { optimalLineup } from './engine/lineup.js';
import type { Draft, LeagueSettings, Player } from './types.js';

export interface TeamGrade {
  slot: number;
  playerIds: string[];
  starterPoints: number;
  benchPoints: number;
  valueOverAdp: number;
  reaches: { playerId: string; delta: number }[];
  steals: { playerId: string; delta: number }[];
}

export interface HistorySummary {
  teams: TeamGrade[];
  mine: TeamGrade | undefined;
}

export function gradeDraft(
  draft: Draft,
  players: Player[],
  settings: LeagueSettings = draft.settings,
): HistorySummary {
  const byId = new Map(players.map((p) => [p.id, p]));
  const bySlot = new Map<number, string[]>();
  for (const pick of draft.picks) {
    if (!pick.playerId) continue;
    const list = bySlot.get(pick.slot) ?? [];
    list.push(pick.playerId);
    bySlot.set(pick.slot, list);
  }

  const teams: TeamGrade[] = [];
  for (let slot = 1; slot <= settings.teams; slot++) {
    const ids = bySlot.get(slot) ?? [];
    const roster = ids.map((id) => byId.get(id)).filter((p): p is Player => Boolean(p));
    const lineup = optimalLineup(roster, settings.slots);
    const valueOverAdp = roster.reduce((sum, p, i) => {
      const pick = draft.picks.find((x) => x.playerId === p.id);
      const pickNo = pick?.pickNo ?? i + 1;
      return sum + (p.adp - pickNo);
    }, 0);
    const swings = roster
      .map((p) => {
        const pick = draft.picks.find((x) => x.playerId === p.id);
        return { playerId: p.id, delta: p.adp - (pick?.pickNo ?? 0) };
      })
      .filter((x) => Number.isFinite(x.delta));
    teams.push({
      slot,
      playerIds: ids,
      starterPoints: lineup.starterPoints,
      benchPoints: lineup.benchPoints,
      valueOverAdp,
      reaches: swings
        .filter((s) => s.delta < -8)
        .sort((a, b) => a.delta - b.delta)
        .slice(0, 5),
      steals: swings
        .filter((s) => s.delta > 8)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 5),
    });
  }

  return { teams, mine: teams.find((t) => t.slot === draft.mySlot) };
}
