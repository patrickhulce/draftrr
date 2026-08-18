'use client';

import { useMemo, useState } from 'react';
import { POSITIONS, type Position } from '@draftrr/core';
import { allPlayers, valueOverAdp } from '@/lib/players';
import { cn } from '@/lib/cn';

type SortKey = 'name' | 'team' | 'position' | 'bye' | 'projectedPoints' | 'adp' | 'value';

export default function PlayersPage() {
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<Position | 'ALL'>('ALL');
  const [sort, setSort] = useState<SortKey>('adp');
  const [dir, setDir] = useState<1 | -1>(1);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return allPlayers()
      .filter((p) => (pos === 'ALL' ? true : p.position === pos))
      .filter((p) =>
        !query
          ? true
          : p.name.toLowerCase().includes(query) ||
            p.team.toLowerCase().includes(query) ||
            p.looseKey.includes(query.replace(/\s/g, '')),
      )
      .map((p) => ({ ...p, value: valueOverAdp(p) }))
      .sort((a, b) => {
        const av = a[sort];
        const bv = b[sort];
        if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir;
        return ((av as number) - (bv as number)) * dir;
      });
  }, [q, pos, sort, dir]);

  const toggle = (key: SortKey) => {
    if (sort === key) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSort(key);
      setDir(key === 'name' || key === 'team' || key === 'position' ? 1 : 1);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Players</h1>
          <p className="text-sm text-white/50">{rows.length} in view</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or team"
            className="rounded-md border border-white/10 bg-ink-800 px-3 py-1.5 text-sm"
          />
          <select
            value={pos}
            onChange={(e) => setPos(e.target.value as Position | 'ALL')}
            className="rounded-md border border-white/10 bg-ink-800 px-3 py-1.5 text-sm"
          >
            <option value="ALL">All positions</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="overflow-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-ink-800 text-white/60">
            <tr>
              {(
                [
                  ['name', 'Player'],
                  ['team', 'Team'],
                  ['position', 'Pos'],
                  ['bye', 'Bye'],
                  ['projectedPoints', 'Proj'],
                  ['adp', 'ADP'],
                  ['value', 'Pts/ADP'],
                ] as const
              ).map(([key, label]) => (
                <th key={key} className="px-3 py-2 font-medium">
                  <button type="button" onClick={() => toggle(key)} className="hover:text-white">
                    {label}
                    {sort === key ? (dir === 1 ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-white/5">
                <td className="px-3 py-2">{p.name}</td>
                <td className="px-3 py-2 text-white/70">{p.team}</td>
                <td className={cn('px-3 py-2 font-medium', `pos-${p.position}`)}>{p.position}</td>
                <td className="px-3 py-2 text-white/70">{p.bye}</td>
                <td className="px-3 py-2 font-mono">{p.projectedPoints.toFixed(1)}</td>
                <td className="px-3 py-2 font-mono">{p.adp.toFixed(1)}</td>
                <td className="px-3 py-2 font-mono text-white/70">{p.value.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
