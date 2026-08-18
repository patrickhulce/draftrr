'use client';

import {
  buildMatchIndex,
  optimalLineup,
  picksForSlot,
  reconcilePicks,
  worstCaseHighlighted,
  worstCaseProjectedAtNext,
  type EngineRequest,
} from '@draftrr/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FuzzyBanner, type PendingMatch } from '@/components/FuzzyBanner';
import { SleeperLink } from '@/components/SleeperLink';
import { cn } from '@/lib/cn';
import { db, ensureSeeded } from '@/lib/db';
import { useEngine } from '@/lib/useEngine';
import { allPlayers, playerMap } from '@/lib/players';
import { useSleeperBridge, useSleeperPicks } from '@/lib/sleeper';
import { CompactRoster } from './CompactRoster';
import { PositionBranches } from './PositionBranches';
import { ProjectedPicks } from './ProjectedPicks';

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
  const sleeper = useSleeperBridge();
  const sleeperId = draft?.sleeperDraftId ?? sleeper.draftId ?? null;
  const {
    picks: sleeperPicks,
    draft: sleeperDraft,
    error,
    refresh,
    refreshing,
  } = useSleeperPicks(draft?.status === 'live' ? sleeperId : null);
  const [pending, setPending] = useState<PendingMatch[]>([]);
  const [overrides, setOverrides] = useState<Record<number, string | null>>({});

  const index = useMemo(() => buildMatchIndex(players, aliases), [players, aliases]);

  const reconciled = useMemo(() => {
    if (!sleeperPicks.length) return draft?.picks ?? [];
    const rec = reconcilePicks(sleeperPicks, index);
    return rec.map((r) => {
      const override = overrides[r.pick.pickNo];
      if (override !== undefined) return { ...r.pick, playerId: override };
      return r.pick;
    });
  }, [sleeperPicks, index, draft?.picks, overrides]);

  const unmatched = useMemo(() => {
    if (!sleeperPicks.length) return [];
    const rec = reconcilePicks(sleeperPicks, index);
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
  }, [sleeperPicks, index, overrides]);

  const toasted = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!draft || !sleeperPicks.length) return;
    const rec = reconcilePicks(sleeperPicks, index);
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
  }, [draft, sleeperPicks, index, reconciled]);

  const pickedIds = reconciled.map((p) => p.playerId).filter((id): id is string => Boolean(id));
  const rankingIds =
    ranking?.items.filter((i) => i.kind === 'player').map((i) => i.playerId) ??
    players.map((p) => p.id);

  const mine = reconciled
    .filter((p) => p.slot === draft?.mySlot && p.playerId)
    .map((p) => byId.get(p.playerId!))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const engineReq: EngineRequest | null = draft
    ? {
        players,
        settings: draft.settings,
        mySlot: draft.mySlot,
        pickedPlayerIds: pickedIds,
        myPlayerIds: mine.map((p) => p.id),
        rankingPlayerIds: rankingIds,
        sims: 100,
        seed: 17,
        temperature: 4,
      }
    : null;
  const { result, running } = useEngine(engineReq);

  const available = rankingIds
    .filter((id) => !pickedIds.includes(id))
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const currentPickNo = pickedIds.length + 1;
  const myPickNos = draft
    ? picksForSlot(
        currentPickNo - 1,
        draft.mySlot,
        draft.settings.teams,
        draft.settings.rounds,
        draft.settings.draftType,
      )
    : [];
  const nextMyPickNo = myPickNos[0] ?? null;
  const projectedAtNext = worstCaseProjectedAtNext(available, currentPickNo, nextMyPickNo);
  const highlighted = new Set(
    worstCaseHighlighted(available, currentPickNo, myPickNos).map((p) => p.id),
  );

  const currentLineup = draft ? optimalLineup(mine, draft.settings.slots) : null;

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
            Pick {reconciled.length + 1} · you are slot {draft.mySlot}
            {sleeperDraft ? ` · ${sleeperDraft.status}` : ''}
            {running ? ' · simulating…' : ''}
            {error ? ` · ${error}` : ''}
          </p>
          <div className="mt-1">
            <SleeperLink
              extensionInstalled={sleeper.extensionInstalled}
              sleeperLive={sleeper.sleeperLive}
              draftId={sleeper.draftId ?? draft.sleeperDraftId ?? null}
              draftName={sleeper.draftName ?? sleeperDraft?.metadata?.name ?? null}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
            disabled={refreshing || !sleeperId}
            onClick={() => void refresh()}
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
