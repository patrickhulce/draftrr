import type { RankingItem, RankingVersion } from '../types.js';

/** Player ids in board order, skipping tier breaks. */
export function rankingPlayerIds(items: readonly RankingItem[]): string[] {
  return items
    .filter((item): item is Extract<RankingItem, { kind: 'player' }> => item.kind === 'player')
    .map((item) => item.playerId);
}

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

/** Stable FNV-1a of the player-id sequence. */
export function hashRanking(playerIds: readonly string[]): string {
  let hash = FNV_OFFSET;
  const input = playerIds.join('\0');
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function nextRankingVersion(
  latest: RankingVersion | undefined,
  rankingSetId: string,
  playerIds: readonly string[],
  now: number,
): { version: RankingVersion; bumped: boolean } {
  const hash = hashRanking(playerIds);
  if (latest && latest.hash === hash) {
    return { version: latest, bumped: false };
  }
  return {
    version: {
      rankingSetId,
      version: (latest?.version ?? 0) + 1,
      hash,
      playerIds: [...playerIds],
      createdAt: now,
    },
    bumped: true,
  };
}

export function rankingVersionLabel(
  latest: RankingVersion | undefined,
  currentHash: string,
): string {
  if (!latest) return 'never analyzed';
  if (latest.hash === currentHash) return `v${latest.version}`;
  return `edited since v${latest.version}`;
}
