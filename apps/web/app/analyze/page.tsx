'use client';

import {
  DEFAULT_INNER_SIMS,
  DEFAULT_LEAGUE,
  DEFAULT_OUTER_SIMS,
  DEFAULT_SLOTS,
  hashRanking,
  rankingPlayerIds,
  rankingVersionLabel,
  roundsFromSlots,
  type AnalysisResult,
  type AnalysisStrategyId,
  type DraftType,
  type LeagueSettings,
  type RankingSet,
  type RankingVersion,
  type RosterSlots,
  type ScoringFormat,
} from '@draftrr/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CompactRoster } from '@/app/draft/CompactRoster';
import { PpgHistogram } from '@/app/draft/PpgHistogram';
import { RosterSlotsField } from '@/app/draft/RosterSlotsField';
import { db, ensureSeeded, saveAnalysisRun, snapshotRankingForAnalysis } from '@/lib/db';
import { uid } from '@/lib/ids';
import { allPlayers, playerMap } from '@/lib/players';
import { useAnalysis } from '@/lib/useAnalysis';

const SETTINGS_KEY = 'analysisConfig';

const STRATEGY_COPY: Record<AnalysisStrategyId, { title: string; body: string }> = {
  balanced: { title: 'Balanced', body: '1 WR and 1 RB in rounds 1–2' },
  doubleRb: { title: 'Double RB', body: 'RB in both round 1 and round 2' },
  earlyTe: { title: 'Early TE', body: 'TE drafted before round 5' },
  earlyQb: { title: 'Early QB', body: 'QB drafted before round 5' },
};

interface AnalysisConfig {
  rankingSetId: string;
  mySlot: number;
  teams: number;
  draftType: DraftType;
  scoring: ScoringFormat;
  slots: RosterSlots;
}

const DEFAULT_CONFIG: AnalysisConfig = {
  rankingSetId: 'default',
  mySlot: 1,
  teams: DEFAULT_LEAGUE.teams,
  draftType: DEFAULT_LEAGUE.draftType,
  scoring: DEFAULT_LEAGUE.scoring,
  slots: { ...DEFAULT_SLOTS },
};

function latestVersion(rows: RankingVersion[]): RankingVersion | undefined {
  return rows.reduce<RankingVersion | undefined>(
    (best, row) => (!best || row.version > best.version ? row : best),
    undefined,
  );
}

export default function AnalyzePage() {
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<AnalysisConfig>(DEFAULT_CONFIG);
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const [storedResult, setStoredResult] = useState<AnalysisResult | null>(null);
  const { result: liveResult, running, progress, run, setResult } = useAnalysis();
  const runMeta = useRef<{
    rankingSetId: string;
    version: number;
    hash: string;
    settings: LeagueSettings;
    mySlot: number;
  } | null>(null);

  useEffect(() => {
    void ensureSeeded().then(() => setReady(true));
  }, []);

  const sets =
    useLiveQuery(() => db.rankingSets.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const currentSet: RankingSet | undefined =
    sets.find((s) => s.id === config.rankingSetId) ?? sets[0];
  const rankingSetId = currentSet?.id ?? config.rankingSetId;
  const versions =
    useLiveQuery(
      () => db.rankingVersions.where('rankingSetId').equals(rankingSetId).toArray(),
      [rankingSetId],
    ) ?? [];
  const runs =
    useLiveQuery(
      () => db.analysisRuns.where('rankingSetId').equals(rankingSetId).toArray(),
      [rankingSetId],
    ) ?? [];
  const savedConfig = useLiveQuery(() => db.settings.get(SETTINGS_KEY), []);

  useEffect(() => {
    const value = savedConfig?.value as AnalysisConfig | undefined;
    if (!value) return;
    setConfig({ ...DEFAULT_CONFIG, ...value, slots: { ...DEFAULT_SLOTS, ...value.slots } });
  }, [savedConfig]);

  const playerIds = useMemo(
    () => (currentSet ? rankingPlayerIds(currentSet.items) : []),
    [currentSet],
  );
  const currentHash = useMemo(() => hashRanking(playerIds), [playerIds]);
  const sortedVersions = useMemo(
    () => [...versions].sort((a, b) => b.version - a.version),
    [versions],
  );
  const newest = latestVersion(versions);
  const selectedVersion =
    (viewVersion != null ? versions.find((v) => v.version === viewVersion) : undefined) ?? newest;
  const selectedRun = selectedVersion
    ? runs
        .filter((r) => r.version === selectedVersion.version)
        .sort((a, b) => b.createdAt - a.createdAt)[0]
    : undefined;

  useEffect(() => {
    setStoredResult(selectedRun?.result ?? null);
    setResult(null);
  }, [selectedRun?.id, setResult]);

  const result = running ? null : (liveResult ?? storedResult);
  const players = useMemo(() => allPlayers(), []);
  const byId = useMemo(() => playerMap(), []);

  const persistConfig = (next: AnalysisConfig) => {
    setConfig(next);
    void db.settings.put({ key: SETTINGS_KEY, value: next });
  };

  const start = () => {
    if (!currentSet) return;
    const settings: LeagueSettings = {
      ...DEFAULT_LEAGUE,
      teams: config.teams,
      draftType: config.draftType,
      scoring: config.scoring,
      slots: config.slots,
      rounds: roundsFromSlots(config.slots),
    };
    const mySlot = Math.min(config.mySlot, config.teams);
    void (async () => {
      const snapshot = await snapshotRankingForAnalysis(currentSet.id, playerIds);
      runMeta.current = {
        rankingSetId: currentSet.id,
        version: snapshot.version,
        hash: snapshot.hash,
        settings,
        mySlot,
      };
      setViewVersion(snapshot.version);
      run({
        players,
        settings,
        mySlot,
        rankingPlayerIds: playerIds,
        outerSims: DEFAULT_OUTER_SIMS,
        innerSims: DEFAULT_INNER_SIMS,
        seed: 17,
      });
    })();
  };

  useEffect(() => {
    if (running || !liveResult || !runMeta.current) return;
    const meta = runMeta.current;
    void saveAnalysisRun({
      id: uid('analysis'),
      rankingSetId: meta.rankingSetId,
      version: meta.version,
      hash: meta.hash,
      settings: meta.settings,
      mySlot: meta.mySlot,
      seed: 17,
      outerSims: DEFAULT_OUTER_SIMS,
      innerSims: DEFAULT_INNER_SIMS,
      createdAt: Date.now(),
      result: liveResult,
    });
  }, [running, liveResult]);

  if (!ready) return <p className="text-white/50">Loading analysis…</p>;

  const badge = rankingVersionLabel(newest, currentHash);
  const pct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Analyze</h1>
        <p className="mt-1 max-w-2xl text-sm text-white/50">
          Simulate a season of drafts from a ranking snapshot. CPU boards use the geometric mean of
          our rank, ADP, and Ballers; our picks follow nested position-branch EV.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          Rankings
          <select
            data-testid="ranking-set"
            className="w-full rounded-md border border-white/10 bg-ink-800 px-3 py-2"
            value={currentSet?.id ?? ''}
            onChange={(e) => {
              persistConfig({ ...config, rankingSetId: e.target.value });
              setViewVersion(null);
            }}
          >
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.parentId ? ' (fork)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span>Version</span>
            <span data-testid="ranking-version" className="text-xs text-white/40">
              {badge}
            </span>
          </div>
          <select
            data-testid="ranking-version-select"
            className="w-full rounded-md border border-white/10 bg-ink-800 px-3 py-2"
            value={selectedVersion?.version ?? ''}
            onChange={(e) => setViewVersion(e.target.value ? Number(e.target.value) : null)}
            disabled={sortedVersions.length === 0}
          >
            {sortedVersions.length === 0 && <option value="">No snapshots yet</option>}
            {sortedVersions.map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version}
                {v.hash === currentHash ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </div>
        <label className="space-y-1 text-sm">
          Your slot
          <input
            type="number"
            min={1}
            max={config.teams}
            className="w-full rounded-md border border-white/10 bg-ink-800 px-3 py-2"
            value={config.mySlot}
            onChange={(e) =>
              persistConfig({
                ...config,
                mySlot: Math.min(config.teams, Math.max(1, Number(e.target.value))),
              })
            }
          />
        </label>
        <label className="space-y-1 text-sm">
          Teams
          <input
            type="number"
            min={4}
            max={16}
            className="w-full rounded-md border border-white/10 bg-ink-800 px-3 py-2"
            value={config.teams}
            onChange={(e) => {
              const teams = Number(e.target.value);
              persistConfig({
                ...config,
                teams,
                mySlot: Math.min(config.mySlot, teams || 1),
              });
            }}
          />
        </label>
        <label className="space-y-1 text-sm">
          Draft type
          <select
            className="w-full rounded-md border border-white/10 bg-ink-800 px-3 py-2"
            value={config.draftType}
            onChange={(e) => persistConfig({ ...config, draftType: e.target.value as DraftType })}
          >
            <option value="snake">Snake</option>
            <option value="linear">Linear</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          Scoring
          <select
            className="w-full rounded-md border border-white/10 bg-ink-800 px-3 py-2"
            value={config.scoring}
            onChange={(e) => persistConfig({ ...config, scoring: e.target.value as ScoringFormat })}
          >
            <option value="half-ppr">Half PPR</option>
            <option value="ppr">PPR</option>
            <option value="standard">Standard</option>
          </select>
        </label>
        <RosterSlotsField
          slots={config.slots}
          onChange={(slots) => persistConfig({ ...config, slots })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="run-analysis"
          className="rounded-md bg-field-500 px-4 py-2 text-sm font-medium text-ink-950 disabled:opacity-50"
          disabled={running || !currentSet}
          onClick={start}
        >
          {running ? 'Running…' : 'Run analysis'}
        </button>
        {running && progress && (
          <span className="text-sm text-white/50">
            {progress.done} / {progress.total} drafts ({pct}%)
          </span>
        )}
      </div>

      {result && result.ppgSamples.length > 0 && (
        <section className="space-y-3 rounded-xl border border-white/10 bg-ink-800 p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium">Expected starter PPG</h2>
              <p className="text-sm text-white/50">
                Median {result.medianPpg.toFixed(1)} across {result.ppgSamples.length} drafts
              </p>
            </div>
          </div>
          <PpgHistogram samples={result.ppgSamples} />
        </section>
      )}

      {result && (
        <div className="grid gap-4 lg:grid-cols-2">
          {result.strategies.map((strategy) => {
            const copy = STRATEGY_COPY[strategy.id];
            return (
              <section
                key={strategy.id}
                data-testid={`strategy-${strategy.id}`}
                className="space-y-3 rounded-xl border border-white/10 bg-ink-800 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-medium">{copy.title}</h2>
                    <p className="text-sm text-white/50">{copy.body}</p>
                  </div>
                  <span className="text-xs text-white/40">
                    {strategy.count} / {result.ppgSamples.length}
                  </span>
                </div>
                {strategy.count === 0 || !strategy.medianRoster ? (
                  <p className="text-sm text-white/40">Did not materialize</p>
                ) : (
                  <>
                    <p className="text-sm text-white/70">
                      Median {strategy.medianPpg.toFixed(1)} starter PPG
                    </p>
                    <PpgHistogram samples={strategy.ppgSamples} compact />
                    <CompactRoster
                      slots={config.slots}
                      slotsFilled={strategy.medianRoster.slotsFilled}
                      benchIds={strategy.medianRoster.benchIds}
                      byId={byId}
                    />
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
