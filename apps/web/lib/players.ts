import { defaultPlayers, type Player, type RankingItem } from '@draftrr/core';
import { uid } from '@/lib/ids';

export function allPlayers(): Player[] {
  return defaultPlayers;
}

const TIER_BREAKS = [12, 24, 48];

/** Players the Ballers never ranked (team defenses, deep bench) fall in behind by ADP. */
export function byBallersRank(a: Player, b: Player): number {
  if (a.ballersRank != null && b.ballersRank != null) return a.ballersRank - b.ballersRank;
  if (a.ballersRank != null) return -1;
  if (b.ballersRank != null) return 1;
  return a.adp - b.adp;
}

export function defaultRankingItems(): RankingItem[] {
  const sorted = defaultPlayers.slice().sort(byBallersRank);
  const items: RankingItem[] = [{ kind: 'tier', id: uid('tier'), label: 'Tier 1' }];
  sorted.forEach((player, i) => {
    const tier = TIER_BREAKS.indexOf(i);
    if (tier >= 0) items.push({ kind: 'tier', id: uid('tier'), label: `Tier ${tier + 2}` });
    items.push({ kind: 'player', playerId: player.id });
  });
  return items;
}

let cachedMap: Map<string, Player> | undefined;

export function playerMap(): Map<string, Player> {
  cachedMap ??= new Map(defaultPlayers.map((p) => [p.id, p]));
  return cachedMap;
}

export function valueOverAdp(player: Player): number {
  if (player.adp <= 0) return 0;
  return player.projectedPoints / player.adp;
}
