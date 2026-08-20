import {
  defaultPlayers,
  resolveSeedAliases,
  seedAliasRows,
  type Draft,
  type PlayerAlias,
  type RankingSet,
} from '@draftrr/core';
import Dexie, { type Table } from 'dexie';
import { defaultRankingItems } from '@/lib/players';

export interface AppSetting {
  key: string;
  value: unknown;
}

export class DraftrrDB extends Dexie {
  rankingSets!: Table<RankingSet, string>;
  drafts!: Table<Draft, string>;
  aliases!: Table<PlayerAlias, string>;
  settings!: Table<AppSetting, string>;

  constructor() {
    super('draftrr');
    this.version(1).stores({
      rankingSets: 'id, updatedAt, parentId',
      drafts: 'id, updatedAt, status, sleeperDraftId',
      aliases: 'sourceKey, playerId',
      settings: 'key',
    });
    this.version(2).stores({
      rankingSets: 'id, updatedAt, parentId',
      drafts: 'id, updatedAt, status, draftKey',
      aliases: 'sourceKey, playerId',
      settings: 'key',
    });
  }
}

export const db = new DraftrrDB();

let seedPromise: Promise<void> | null = null;

export function ensureSeeded(): Promise<void> {
  seedPromise ??= (async () => {
    const existing = await db.rankingSets.get('default');
    if (!existing) {
      const now = Date.now();
      await db.rankingSets.put({
        id: 'default',
        name: 'Ballers baseline',
        items: defaultRankingItems(),
        createdAt: now,
        updatedAt: now,
      });
    }
    const aliasCount = await db.aliases.count();
    if (aliasCount === 0) {
      const seeds = resolveSeedAliases(seedAliasRows, defaultPlayers);
      if (seeds.length) await db.aliases.bulkPut(seeds);
    }
  })();
  return seedPromise;
}

export async function exportAll() {
  return {
    rankingSets: await db.rankingSets.toArray(),
    drafts: await db.drafts.toArray(),
    aliases: await db.aliases.toArray(),
  };
}

export async function importAll(payload: {
  rankingSets?: RankingSet[];
  drafts?: Draft[];
  aliases?: PlayerAlias[];
}) {
  await db.transaction('rw', db.rankingSets, db.drafts, db.aliases, async () => {
    if (payload.rankingSets) await db.rankingSets.bulkPut(payload.rankingSets);
    if (payload.drafts) await db.drafts.bulkPut(payload.drafts);
    if (payload.aliases) await db.aliases.bulkPut(payload.aliases);
  });
}
