import type { Player, PlayerAlias } from '../types.js';
import { aliasSourceKey, buildMatchIndex, matchPlayer } from './match.js';
import { nameKey } from './names.js';

export interface SeedAliasRow {
  source: string;
  targetName: string;
}

export function parseAliasCsv(text: string): SeedAliasRow[] {
  return text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [source, targetName] = line.split(',').map((s) => s.trim());
      return { source: source ?? '', targetName: targetName ?? '' };
    })
    .filter((r) => r.source && r.targetName);
}

export function resolveSeedAliases(rows: SeedAliasRow[], players: Player[]): PlayerAlias[] {
  const index = buildMatchIndex(players);
  const aliases: PlayerAlias[] = [];
  for (const row of rows) {
    const target = players.find((p) => nameKey(p.name) === nameKey(row.targetName));
    if (!target) continue;
    const already = matchPlayer({ name: row.source, position: target.position }, index);
    if (already.kind === 'nameKey' || already.kind === 'looseKey') continue;
    aliases.push({
      sourceKey: aliasSourceKey(row.source),
      playerId: target.id,
      origin: 'seed',
    });
  }
  return aliases;
}
