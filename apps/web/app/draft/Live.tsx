'use client';

import {
  REC_PICKS,
  buildMatchIndex,
  optimalLineup,
  picksForSlot,
  reconcileDrafted,
  worstCaseHighlighted,
  worstCaseProjectedAtNext,
  type EngineRequest,
  type Player,
  type RankingItem,
} from '@draftrr/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FuzzyBanner, type PendingMatch } from '@/components/FuzzyBanner';
import { DraftLink } from '@/components/DraftLink';
import { cn } from '@/lib/cn';
import { db, ensureSeeded } from '@/lib/db';
import { useEngine } from '@/lib/useEngine';
import { allPlayers, playerMap } from '@/lib/players';
import { useDraftLink } from '@/lib/draftLink';
import { CompactRoster } from './CompactRoster';
import { PositionBranches } from './PositionBranches';
import { ProjectedPicks } from './ProjectedPicks';
import { SimSummary } from './SimSummary';

const RISK_UPSIDE_SCALE = 10;

function formatStat(value?: number): string {
  return value == null ? '—' : value.toFixed(1);
}

function riskFillClass(risk: number): string {
  if (risk >= 6.6) return 'bg-rose-400';
  if (risk >= 3.3) return 'bg-amber-400';
  return 'bg-emerald-400';
}

function upsideFillClass(upside: number): string {
  if (upside >= 6.6) return 'bg-emerald-400';
  if (upside >= 3.3) return 'bg-field-400';
  return 'bg-white/40';
}

function StatBar({ value, fillClass }: { value?: number; fillClass: (n: number) => string }) {
  const pct = value == null ? 0 : Math.min(100, Math.max(0, (value / RISK_UPSIDE_SCALE) * 100));
  return (
    <span className="block h-1 w-10 overflow-hidden rounded-full bg-white/10">
      {value != null && (
        <span
          className={cn('block h-full rounded-full', fillClass(value))}
          style={{ width: `${pct}%` }}
        />
      )}
    </span>
  );
}

function RiskUpsideBars({ player }: { player: Player }) {
  return (
    <span className="flex shrink-0 flex-col gap-0.5">
      <StatBar value={player.risk} fillClass={riskFillClass} />
      <StatBar value={player.upside} fillClass={upsideFillClass} />
    </span>
  );
}

function rankingBoard(
  items: RankingItem[] | undefined,
  fallbackIds: string[],
): { ids: string[]; tierByPlayer: Map<string, number> } {
  if (!items) return { ids: fallbackIds, tierByPlayer: new Map() };
  const ids: string[] = [];
  const tierByPlayer = new Map<string, number>();
  let tier = 0;
  for (const item of items) {
    if (item.kind === 'tier') {
      tier += 1;
      continue;
    }
    ids.push(item.playerId);
    if (tier > 0) tierByPlayer.set(item.playerId, tier);
  }
  return { ids, tierByPlayer };
}

function playerTooltip(player: Player, rank: number, tier?: number): string {
  const tierPart = tier != null ? ` · Tier ${tier}` : '';
  return `Rank ${rank}${tierPart} · ADP ${formatStat(player.adp)} · ${formatStat(player.projectedPoints)} pts · Risk ${formatStat(player.risk)} · Upside ${formatStat(player.upside)}`;
}

export function LiveDraft({ draftId }: { draftId: string }) {
  useEffect(() => {
    void ensureSeeded();
  }, []);
  const draft = useLiveQuery(() => db.drafts.get(draftId), [draftId]);
  const rankingSets =
    useLiveQuery(() => db.rankingSets.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const ranking = useLiveQuery(
    () => (draft ? db.rankingSets.get(draft.rankingSetId) : undefined),
    [draft?.rankingSetId],
  );
  const aliases = useLiveQuery(() => db.aliases.toArray(), []) ?? [];
  const players = allPlayers();
  const byId = playerMap();
  const { installed, status, snapshot, refresh } = useDraftLink();
  const liveSnapshot =
    draft?.status === 'live' && snapshot && snapshot.draftKey === draft.draftKey ? snapshot : null;
  const drafted = liveSnapshot?.drafted;
  const error = status?.error ?? null;
  const refreshing = status?.state === 'connecting';
  const [pending, setPending] = useState<PendingMatch[]>([]);
  const [overrides, setOverrides] = useState<Record<number, string | null>>({});

  useEffect(() => {
    if (!draft || !snapshot) return;
    const patch: { draftKey?: string; mySlot?: number; updatedAt: number } = {
      updatedAt: Date.now(),
    };
    if (snapshot.draftKey && snapshot.draftKey !== draft.draftKey) {
      patch.draftKey = snapshot.draftKey;
    }
    const sameDraft = (patch.draftKey ?? draft.draftKey) === snapshot.draftKey;
    if (sameDraft && snapshot.mySlot != null && snapshot.mySlot !== draft.mySlot) {
      patch.mySlot = snapshot.mySlot;
    }
    if (patch.draftKey || patch.mySlot != null) {
      void db.drafts.update(draft.id, patch);
    }
  }, [draft, snapshot]);

  const index = useMemo(() => buildMatchIndex(players, aliases), [players, aliases]);

  const reconciled = useMemo(() => {
    if (!drafted?.length) return draft?.picks ?? [];
    const rec = reconcileDrafted(drafted, index);
    return rec.map((r) => {
      const override = overrides[r.pick.pickNo];
      if (override !== undefined) return { ...r.pick, playerId: override };
      return r.pick;
    });
  }, [drafted, index, draft?.picks, overrides]);

  const unmatched = useMemo(() => {
    if (!drafted?.length) return [];
    const rec = reconcileDrafted(drafted, index);
    return rec
      .filter((r) => {
        if (overrides[r.pick.pickNo] !== undefined) return false;
        if (r.match.kind === 'unmatched') return true;
        if (r.match.kind === 'fuzzy' && (r.match.candidates[0]?.distance ?? 99) > 1) return true;
        return false;
      })
      .map((r) => ({
        rawName: r.pick.rawName ?? 'Unknown',
        match: r.match,
        pickNo: r.pick.pickNo,
      }));
  }, [drafted, index, overrides]);

  const toasted = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!draft || !drafted?.length) return;
    const rec = reconcileDrafted(drafted, index);
    for (const r of rec) {
      const top = r.match.candidates[0];
      if (
        r.match.kind === 'fuzzy' &&
        top &&
        top.distance === 1 &&
        r.pick.playerId &&
        !toasted.current.has(r.pick.pickNo)
      ) {
        toasted.current.add(r.pick.pickNo);
        toast.message(`Auto-matched ${r.pick.rawName} → ${top.candidate.name}`, {
          action: {
            label: 'Undo',
            onClick: () => setOverrides((o) => ({ ...o, [r.pick.pickNo]: null })),
          },
        });
      }
    }
    if (JSON.stringify(draft.picks) === JSON.stringify(reconciled)) return;
    void db.drafts.update(draft.id, { picks: reconciled, updatedAt: Date.now() });
  }, [draft, drafted, index, reconciled]);

  const pickedIds = reconciled.map((p) => p.playerId).filter((id): id is string => Boolean(id));
  const { ids: rankingIds, tierByPlayer } = rankingBoard(
    ranking?.items,
    players.map((p) => p.id),
  );

  const mine = reconciled
    .filter((p) => p.slot === draft?.mySlot && p.playerId)
    .map((p) => byId.get(p.playerId!))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const teamPlayerIds: Record<number, string[]> = {};
  for (const pick of reconciled) {
    if (!pick.playerId) continue;
    (teamPlayerIds[pick.slot] ??= []).push(pick.playerId);
  }

  const engineReq: EngineRequest | null = draft
    ? {
        players,
        settings: draft.settings,
        mySlot: draft.mySlot,
        pickedPlayerIds: pickedIds,
        myPlayerIds: mine.map((p) => p.id),
        rankingPlayerIds: rankingIds,
        teamPlayerIds,
        currentPickNo: liveSnapshot?.currentPickNo ?? reconciled.length + 1,
        sims: 500,
        seed: 17,
        // Softmax temperature in starter-PPG units (higher = more exploration).
        temperature: 1,
        stochasticProjections: Boolean(draft.stochasticProjections),
      }
    : null;
  const { result, running } = useEngine(engineReq);

  const picked = new Set(pickedIds);
  const availableRows = rankingIds.flatMap((id, i) => {
    const player = byId.get(id);
    if (!player || picked.has(id)) return [];
    return [{ player, rank: i + 1, tier: tierByPlayer.get(id) }];
  });
  const available = availableRows.map((row) => row.player);

  const currentPickNo = liveSnapshot?.currentPickNo ?? reconciled.length + 1;
  const remainingGridCols = Math.max(0, REC_PICKS - (result?.lockedPickCount ?? 0));
  const myPickNos = draft
    ? picksForSlot(
        currentPickNo - 1,
        draft.mySlot,
        draft.settings.teams,
        draft.settings.rounds,
        draft.settings.draftType,
      ).slice(0, remainingGridCols)
    : [];
  const nextMyPickNo = myPickNos[0] ?? null;
  const projectedAtNext = worstCaseProjectedAtNext(available, currentPickNo, nextMyPickNo);
  const highlighted = new Set(
    worstCaseHighlighted(available, currentPickNo, myPickNos).map((p) => p.id),
  );

  const currentLineup = draft ? optimalLineup(mine, draft.settings.slots) : null;

  useEffect(() => {
    const el = document.documentElement;
    el.dataset.draftrrPicks = String(reconciled.length);
    el.dataset.draftrrDraftKey = liveSnapshot?.draftKey ?? draft?.draftKey ?? '';
    el.dataset.draftrrPhase = liveSnapshot?.phase ?? '';
    el.dataset.draftrrExt = installed ? '1' : '0';
    el.dataset.draftrrLinked = status?.state === 'linked' ? '1' : '0';
  }, [draft?.draftKey, installed, liveSnapshot, reconciled.length, status?.state]);

  const takeManual = async (playerId: string) => {
    if (!draft) return;
    const pickNo = reconciled.length + 1;
    const round = Math.floor((pickNo - 1) / draft.settings.teams) + 1;
    const next = [...reconciled, { pickNo, round, slot: draft.mySlot, playerId }];
    await db.drafts.update(draft.id, { picks: next, updatedAt: Date.now() });
  };

  const complete = async () => {
    if (!draft) return;
    await db.drafts.update(draft.id, {
      status: 'complete',
      completedAt: Date.now(),
      updatedAt: Date.now(),
      picks: reconciled,
    });
    window.location.href = `/history/?id=${draft.id}`;
  };

  if (!draft) return <p className="text-white/50">Loading draft…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{draft.name}</h1>
          <p className="text-sm text-white/50">
            Pick {currentPickNo} · you are slot {draft.mySlot}
            {liveSnapshot ? ` · ${liveSnapshot.phase}` : ''}
            {running ? ' · simulating…' : ''}
            {error ? ` · ${error}` : ''}
          </p>
          <div className="mt-1">
            <DraftLink installed={installed} status={status} />
          </div>
          {liveSnapshot?.phase === 'pre' && liveSnapshot.drafted.length === 0 && (
            <p className="mt-1 text-sm text-amber-300/80">
              This draft still looks unstarted (0 picks). If the clock is already running and you
              are not pick 1, the connected draft is wrong or cached.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-white/60">
            Predictions
            <select
              data-testid="prediction-mode"
              className="rounded-md border border-white/10 bg-ink-800 px-3 py-1.5 text-sm text-white"
              value={draft.stochasticProjections ? 'stochastic' : 'fixed'}
              onChange={(e) => {
                void db.drafts.update(draft.id, {
                  stochasticProjections: e.target.value === 'stochastic',
                  updatedAt: Date.now(),
                });
              }}
            >
              <option value="fixed">Fixed</option>
              <option value="stochastic">Stochastic</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-white/60">
            Rankings
            <select
              data-testid="ranking-set"
              className="rounded-md border border-white/10 bg-ink-800 px-3 py-1.5 text-sm text-white"
              value={draft.rankingSetId}
              onChange={(e) => {
                void db.drafts.update(draft.id, {
                  rankingSetId: e.target.value,
                  updatedAt: Date.now(),
                });
              }}
            >
              {ranking && !rankingSets.some((s) => s.id === ranking.id) && (
                <option value={ranking.id}>{ranking.name}</option>
              )}
              {rankingSets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.parentId ? ' (fork)' : ''}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="rounded-md border border-white/15 px-3 py-1.5 text-sm disabled:opacity-50"
            disabled={refreshing || !draft.draftKey}
            onClick={() => refresh()}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            className="rounded-md border border-white/15 px-3 py-1.5 text-sm"
            onClick={() => void complete()}
          >
            Finish draft
          </button>
        </div>
      </div>

      <FuzzyBanner
        pending={unmatched.length ? unmatched : pending}
        onResolve={(pickNo, playerId) => {
          setOverrides((o) => ({ ...o, [pickNo]: playerId }));
          setPending((list) => list.filter((p) => p.pickNo !== pickNo));
        }}
      />

      {result && <SimSummary positionGrid={result.positionGrid} byId={byId} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <ProjectedPicks columns={projectedAtNext} byId={byId} />
        <section className="rounded-xl border border-white/10 p-3">
          <h2 className="mb-2 text-sm text-white/50">Your roster</h2>
          {currentLineup && (
            <CompactRoster
              testId="roster"
              slots={draft.settings.slots}
              slotsFilled={currentLineup.slotsFilled}
              benchIds={currentLineup.bench.map((p) => p.id)}
              byId={byId}
            />
          )}
        </section>

        <section className="rounded-xl border border-white/10 p-3">
          <h2 className="mb-2 text-sm text-white/50">Available</h2>
          <div
            data-testid="available-list"
            className="max-h-[min(640px,50vh)] space-y-1 overflow-auto"
          >
            {availableRows.map(({ player: p, rank, tier }) => (
              <button
                key={p.id}
                type="button"
                title={playerTooltip(p, rank, tier)}
                onClick={() => void takeManual(p.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-white/5',
                  highlighted.has(p.id) && 'bg-amber-500/20 hover:bg-amber-500/30',
                )}
              >
                <span className={cn('w-8', `pos-${p.position}`)}>{p.position}</span>
                <span className="flex-1">{p.name}</span>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="w-5 shrink-0 text-right font-mono text-[11px] tabular-nums text-white/30">
                    {tier ?? ''}
                  </span>
                  <RiskUpsideBars player={p} />
                </span>
              </button>
            ))}
          </div>
        </section>

        <PositionBranches
          branches={result?.positionBranches ?? []}
          slots={draft.settings.slots}
          byId={byId}
        />
      </div>
    </div>
  );
}
