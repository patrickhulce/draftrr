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
    if (!draft || !snapshot?.draftKey || snapshot.draftKey === draft.draftKey) return;
    void db.drafts.update(draft.id, { draftKey: snapshot.draftKey, updatedAt: Date.now() });
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
  const rankingIds =
    ranking?.items.filter((i) => i.kind === 'player').map((i) => i.playerId) ??
    players.map((p) => p.id);

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

  const available = rankingIds
    .filter((id) => !pickedIds.includes(id))
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

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
            {available.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void takeManual(p.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-white/5',
                  highlighted.has(p.id) && 'bg-amber-500/20 hover:bg-amber-500/30',
                )}
              >
                <span className={cn('w-8', `pos-${p.position}`)}>{p.position}</span>
                <span className="flex-1">{p.name}</span>
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
