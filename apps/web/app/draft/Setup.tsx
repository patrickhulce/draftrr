'use client';

import {
  DEFAULT_LEAGUE,
  DEFAULT_SLOTS,
  fetchDraft,
  parseDraftId,
  roundsFromSlots,
  settingsFromSleeperDraft,
  type Draft,
  type DraftType,
  type LeagueSettings,
  type RosterSlots,
  type ScoringFormat,
} from '@draftrr/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db, ensureSeeded } from '@/lib/db';
import { SleeperLink } from '@/components/SleeperLink';
import { uid } from '@/lib/ids';
import { useSleeperBridge } from '@/lib/sleeper';
import { RosterSlotsField } from './RosterSlotsField';

type ImportStatus =
  | { kind: 'loading' }
  | { kind: 'ok'; message: string; warnings: string[] }
  | { kind: 'error'; message: string };

export function DraftSetup() {
  useEffect(() => {
    void ensureSeeded();
  }, []);
  const params = useSearchParams();
  const drafts = useLiveQuery(() => db.drafts.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const sleeper = useSleeperBridge();
  const { draftId: liveId } = sleeper;
  const [mySlot, setMySlot] = useState(1);
  const [teams, setTeams] = useState(DEFAULT_LEAGUE.teams);
  const [draftType, setDraftType] = useState<DraftType>(DEFAULT_LEAGUE.draftType);
  const [scoring, setScoring] = useState<ScoringFormat>(DEFAULT_LEAGUE.scoring);
  const [slots, setSlots] = useState<RosterSlots>({ ...DEFAULT_SLOTS });
  const [sleeperInput, setSleeperInput] = useState(params.get('sleeper') ?? '');
  const [imported, setImported] = useState(false);
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null);

  const sleeperDraftId = parseDraftId(sleeperInput) || liveId || null;

  useEffect(() => {
    if (!sleeperDraftId) {
      setImportStatus(null);
      setImported(false);
      return;
    }

    let cancelled = false;
    setImportStatus({ kind: 'loading' });
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetchDraft(sleeperDraftId);
          if (cancelled) return;
          if (!res.data) {
            setImportStatus({ kind: 'error', message: 'Sleeper returned an empty draft.' });
            return;
          }
          const { settings, mySlot: importedSlot, warnings } = settingsFromSleeperDraft(res.data);
          setTeams(settings.teams);
          setDraftType(settings.draftType);
          setScoring(settings.scoring);
          setSlots(settings.slots);
          setMySlot((slot) => {
            const next = importedSlot ?? slot;
            return Math.min(Math.max(1, next), settings.teams);
          });
          setImported(true);
          const scoringLabel = settings.scoring.replace('-', ' ');
          const slotBit = importedSlot ? `, slot ${importedSlot}` : '';
          setImportStatus({
            kind: 'ok',
            message: `${settings.teams}-team ${settings.draftType}, ${scoringLabel}, ${settings.rounds} rounds${slotBit} loaded from Sleeper`,
            warnings,
          });
        } catch (err) {
          if (cancelled) return;
          setImportStatus({
            kind: 'error',
            message: err instanceof Error ? err.message : 'Failed to load Sleeper draft',
          });
        }
      })();
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [sleeperDraftId]);

  const start = async () => {
    const settings: LeagueSettings = {
      ...DEFAULT_LEAGUE,
      teams,
      draftType,
      scoring,
      slots,
      rounds: roundsFromSlots(slots),
    };
    const draft: Draft = {
      id: uid('draft'),
      name: sleeperDraftId
        ? `Sleeper ${sleeperDraftId.slice(-6)}`
        : `Draft ${new Date().toLocaleString()}`,
      rankingSetId: 'default',
      settings,
      mySlot,
      sleeperDraftId: sleeperDraftId ?? undefined,
      picks: [],
      status: 'live',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.drafts.add(draft);
    window.location.href = `/draft/?id=${draft.id}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Start a draft</h1>
        <div className="mt-1">
          <SleeperLink
            extensionInstalled={sleeper.extensionInstalled}
            sleeperLive={sleeper.sleeperLive}
            draftId={sleeper.draftId}
            draftName={sleeper.draftName}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm sm:col-span-2">
          Sleeper draft URL or ID
          <input
            className="w-full rounded-md border border-white/10 bg-ink-800 px-3 py-2"
            placeholder={liveId ?? 'https://sleeper.com/beta/draft/nfl/…'}
            value={sleeperInput}
            onChange={(e) => setSleeperInput(e.target.value)}
          />
        </label>
        {importStatus && (
          <div className="sm:col-span-2 text-sm">
            {importStatus.kind === 'loading' && (
              <p className="text-white/50">Loading league settings from Sleeper…</p>
            )}
            {importStatus.kind === 'ok' && (
              <div className="space-y-1">
                <p className="text-field-400">{importStatus.message}</p>
                {importStatus.warnings.map((w) => (
                  <p key={w} className="text-amber-300/80">
                    {w}
                  </p>
                ))}
              </div>
            )}
            {importStatus.kind === 'error' && (
              <p className="text-rose-300/90">{importStatus.message}</p>
            )}
          </div>
        )}
        <label className="space-y-1 text-sm">
          Your slot
          <input
            type="number"
            min={1}
            max={teams}
            className="w-full rounded-md border border-white/10 bg-ink-800 px-3 py-2"
            value={mySlot}
            onChange={(e) => setMySlot(Number(e.target.value))}
          />
        </label>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs uppercase tracking-wide text-white/40">
            Manual configuration
          </span>
          <div className="h-px flex-1 bg-white/10" />
        </div>
        <details
          key={imported ? 'imported' : 'fresh'}
          {...(!imported ? { open: true } : {})}
          className="rounded-xl border border-white/10 p-3"
        >
          <summary className="cursor-pointer text-sm text-white/70">
            {imported ? 'Override imported settings' : 'Teams, scoring, and roster'}
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              Teams
              <input
                type="number"
                min={4}
                max={16}
                className="w-full rounded-md border border-white/10 bg-ink-800 px-3 py-2"
                value={teams}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setTeams(next);
                  setMySlot((slot) => Math.min(slot, next || 1));
                }}
              />
            </label>
            <label className="space-y-1 text-sm">
              Draft type
              <select
                className="w-full rounded-md border border-white/10 bg-ink-800 px-3 py-2"
                value={draftType}
                onChange={(e) => setDraftType(e.target.value as DraftType)}
              >
                <option value="snake">Snake</option>
                <option value="linear">Linear</option>
              </select>
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              Scoring
              <select
                className="w-full rounded-md border border-white/10 bg-ink-800 px-3 py-2"
                value={scoring}
                onChange={(e) => setScoring(e.target.value as ScoringFormat)}
              >
                <option value="half-ppr">Half PPR</option>
                <option value="ppr">PPR</option>
                <option value="standard">Standard</option>
              </select>
            </label>
            <RosterSlotsField slots={slots} onChange={setSlots} />
          </div>
        </details>
      </div>

      <button
        type="button"
        data-testid="start-draft"
        className="rounded-md bg-field-500 px-4 py-2 text-sm font-medium text-ink-950"
        onClick={() => void start()}
      >
        Open board
      </button>
      {drafts.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm text-white/50">Recent</h2>
          <ul className="space-y-1 text-sm">
            {drafts.map((d) => (
              <li key={d.id}>
                <a className="text-field-400 hover:underline" href={`/draft/?id=${d.id}`}>
                  {d.name} · {d.status}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
