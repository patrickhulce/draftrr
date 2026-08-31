import {
  defaultPlayers,
  nextRankingVersion,
  resolveSeedAliases,
  seedAliasRows,
  type AnalysisRun,
  type Draft,
  type PlayerAlias,
  type RankingSet,
  type RankingVersion,
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
  rankingVersions!: Table<RankingVersion, number>;
  analysisRuns!: Table<AnalysisRun, string>;

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
    this.version(3).stores({
      rankingVersions: '++id, [rankingSetId+version], rankingSetId, hash',
      analysisRuns: 'id, [rankingSetId+version], rankingSetId, createdAt',
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
    rankingVersions: await db.rankingVersions.toArray(),
    analysisRuns: await db.analysisRuns.toArray(),
  };
}

export async function importAll(payload: {
  rankingSets?: RankingSet[];
  drafts?: Draft[];
  aliases?: PlayerAlias[];
  rankingVersions?: RankingVersion[];
  analysisRuns?: AnalysisRun[];
}) {
  await db.transaction(
    'rw',
    db.rankingSets,
    db.drafts,
    db.aliases,
    db.rankingVersions,
    db.analysisRuns,
    async () => {
      if (payload.rankingSets) await db.rankingSets.bulkPut(payload.rankingSets);
      if (payload.drafts) await db.drafts.bulkPut(payload.drafts);
      if (payload.aliases) await db.aliases.bulkPut(payload.aliases);
      if (payload.rankingVersions) await db.rankingVersions.bulkPut(payload.rankingVersions);
      if (payload.analysisRuns) await db.analysisRuns.bulkPut(payload.analysisRuns);
    },
  );
}

export async function latestRankingVersion(
  rankingSetId: string,
): Promise<RankingVersion | undefined> {
  const rows = await db.rankingVersions.where('rankingSetId').equals(rankingSetId).toArray();
  return rows.reduce<RankingVersion | undefined>(
    (best, row) => (!best || row.version > best.version ? row : best),
    undefined,
  );
}

/** Snapshot the current board if it changed since the last analyzed version. */
export async function snapshotRankingForAnalysis(
  rankingSetId: string,
  playerIds: string[],
): Promise<RankingVersion> {
  const latest = await latestRankingVersion(rankingSetId);
  const next = nextRankingVersion(latest, rankingSetId, playerIds, Date.now());
  if (!next.bumped) return next.version;
  const id = await db.rankingVersions.add(next.version);
  return { ...next.version, id };
}

export async function saveAnalysisRun(run: AnalysisRun): Promise<void> {
  const existing = await db.analysisRuns
    .where('[rankingSetId+version]')
    .equals([run.rankingSetId, run.version])
    .first();
  if (existing) {
    await db.analysisRuns.put({ ...run, id: existing.id });
    return;
  }
  await db.analysisRuns.add(run);
}
