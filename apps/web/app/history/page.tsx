'use client';

import { gradeDraft } from '@draftrr/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { db } from '@/lib/db';
import { playerMap } from '@/lib/players';

export default function HistoryPage() {
  return (
    <Suspense fallback={<p className="text-white/50">Loading…</p>}>
      <HistoryInner />
    </Suspense>
  );
}

function HistoryInner() {
  const id = useSearchParams().get('id');
  const drafts = useLiveQuery(() => db.drafts.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const selected = drafts.find((d) => d.id === id) ?? drafts.find((d) => d.status === 'complete');
  const players = playerMap();

  if (!drafts.length) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">History</h1>
        <p className="mt-2 text-white/50">No drafts yet. Finish one from the draft board.</p>
      </div>
    );
  }

  const summary = selected ? gradeDraft(selected, [...players.values()]) : null;
  const mine = summary?.mine;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">History</h1>
        <select
          className="rounded-md border border-white/10 bg-ink-800 px-3 py-1.5 text-sm"
          value={selected?.id ?? ''}
          onChange={(e) => {
            window.location.href = `/history/?id=${e.target.value}`;
          }}
        >
          {drafts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} · {d.status}
            </option>
          ))}
        </select>
      </div>

      {mine && selected && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Starter PPG" value={mine.starterPoints.toFixed(1)} />
          <Stat label="Bench points" value={mine.benchPoints.toFixed(1)} />
          <Stat label="Value vs ADP" value={mine.valueOverAdp.toFixed(1)} />
        </div>
      )}

      {selected && (
        <section className="rounded-xl border border-white/10 p-3">
          <h2 className="mb-2 text-sm text-white/50">Your team</h2>
          <ul className="space-y-1 text-sm">
            {selected.picks
              .filter((p) => p.slot === selected.mySlot && p.playerId)
              .map((p) => {
                const pl = players.get(p.playerId!);
                return (
                  <li key={p.pickNo} className="flex justify-between">
                    <span>
                      R{p.round} {pl?.name}
                    </span>
                    <span className="text-white/50">
                      {pl?.position} · ADP {pl?.adp.toFixed(0)} · pick {p.pickNo}
                    </span>
                  </li>
                );
              })}
          </ul>
          {mine && (
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <h3 className="text-white/50">Steals</h3>
                {mine.steals.length === 0 && <p className="text-white/40">None flagged</p>}
                {mine.steals.map((s) => (
                  <p key={s.playerId}>
                    {players.get(s.playerId)?.name} (+{s.delta.toFixed(0)})
                  </p>
                ))}
              </div>
              <div>
                <h3 className="text-white/50">Reaches</h3>
                {mine.reaches.length === 0 && <p className="text-white/40">None flagged</p>}
                {mine.reaches.map((s) => (
                  <p key={s.playerId}>
                    {players.get(s.playerId)?.name} ({s.delta.toFixed(0)})
                  </p>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {summary && (
        <section className="rounded-xl border border-white/10 p-3">
          <h2 className="mb-2 text-sm text-white/50">Positional strength</h2>
          <table className="w-full text-left text-sm">
            <thead className="text-white/50">
              <tr>
                <th className="py-1">Slot</th>
                <th>Starters</th>
                <th>Bench</th>
                <th>VoA</th>
              </tr>
            </thead>
            <tbody>
              {summary.teams.map((t) => (
                <tr key={t.slot} className={t.slot === selected?.mySlot ? 'text-field-400' : ''}>
                  <td className="py-1">{t.slot}</td>
                  <td>{t.starterPoints.toFixed(1)}</td>
                  <td>{t.benchPoints.toFixed(1)}</td>
                  <td>{t.valueOverAdp.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-ink-800 p-4">
      <div className="text-xs uppercase tracking-wide text-white/50">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
