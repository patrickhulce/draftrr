import { POSITIONS, type Player, type Position, type RankingItem } from '../types.js';

export function parsePlayerId(
  id: string,
): { looseKey: string; position: Position; team: string } | null {
  const parts = id.split('-');
  if (parts.length < 3) return null;
  const team = parts.at(-1);
  const posRaw = parts.at(-2);
  const looseKey = parts.slice(0, -2).join('-');
  if (!team || !posRaw || !looseKey) return null;
  const position = POSITIONS.find((p) => p.toLowerCase() === posRaw);
  if (!position) return null;
  return { looseKey, position, team };
}

export function repairRankingItems(
  items: RankingItem[],
  players: Player[],
): { items: RankingItem[]; repaired: number; unresolved: string[] } {
  const byId = new Map(players.map((p) => [p.id, p]));
  const byLoosePos = new Map<string, Player[]>();
  for (const p of players) {
    const key = `${p.looseKey}|${p.position}`;
    byLoosePos.set(key, [...(byLoosePos.get(key) ?? []), p]);
  }

  const seen = new Set<string>();
  const next: RankingItem[] = [];
  let repaired = 0;
  const unresolved: string[] = [];

  for (const item of items) {
    if (item.kind === 'tier') {
      next.push(item);
      continue;
    }

    if (byId.has(item.playerId)) {
      if (seen.has(item.playerId)) continue;
      seen.add(item.playerId);
      next.push(item);
      continue;
    }

    const parsed = parsePlayerId(item.playerId);
    const cands = parsed ? (byLoosePos.get(`${parsed.looseKey}|${parsed.position}`) ?? []) : [];
    const unique = cands.length === 1 ? cands[0] : undefined;
    if (!unique) {
      unresolved.push(item.playerId);
      next.push(item);
      continue;
    }

    repaired += 1;
    if (seen.has(unique.id)) continue;
    seen.add(unique.id);
    next.push({ kind: 'player', playerId: unique.id });
  }

  return { items: next, repaired, unresolved };
}
