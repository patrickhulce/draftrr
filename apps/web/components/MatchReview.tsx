'use client';

import {
  aliasSourceKey,
  buildMatchIndex,
  findFuzzyCandidates,
  matchPlayer,
  type ImportReport,
  type MatchIndex,
  type Player,
  type PlayerAlias,
} from '@draftrr/core';
import { useMemo, useState } from 'react';
import { db } from '@/lib/db';
import { allPlayers } from '@/lib/players';

function resolvedCatalogId(incoming: Player, index: MatchIndex): string | undefined {
  const match = matchPlayer(
    {
      name: incoming.name,
      position: incoming.position,
      team: incoming.team,
      sleeperId: incoming.sleeperId,
      bye: incoming.bye,
    },
    index,
  );
  return match.player?.id;
}

export function MatchReview({
  report,
  onClose,
  onApply,
}: {
  report: ImportReport;
  onClose: () => void;
  onApply: (playerIds: string[]) => void;
}) {
  const existing = allPlayers();
  const index = useMemo(() => buildMatchIndex(existing), [existing]);
  const [accepted, setAccepted] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    const idx = buildMatchIndex(existing);
    for (const incoming of report.players) {
      const catalogId = resolvedCatalogId(incoming, idx);
      if (catalogId) ids.add(catalogId);
      else if (!findFuzzyCandidates(incoming, idx).length) ids.add(incoming.id);
    }
    return ids;
  });
  const [aliases, setAliases] = useState<PlayerAlias[]>([]);

  const rows = useMemo(() => {
    return report.players.map((incoming) => {
      const catalogId = resolvedCatalogId(incoming, index);
      const exact = Boolean(existing.find((p) => p.id === incoming.id));
      const fuzzy = catalogId
        ? []
        : findFuzzyCandidates(
            {
              name: incoming.name,
              position: incoming.position,
              team: incoming.team,
              bye: incoming.bye,
            },
            index,
          );
      return { incoming, catalogId, exact, fuzzy };
    });
  }, [report.players, existing, index]);

  const acceptAlias = (
    incomingId: string,
    sourceName: string,
    playerId: string,
    origin: PlayerAlias['origin'],
  ) => {
    const alias = { sourceKey: aliasSourceKey(sourceName), playerId, origin };
    setAliases((a) => [...a, alias]);
    setAccepted((s) => {
      const next = new Set(s);
      next.delete(incomingId);
      next.add(playerId);
      return next;
    });
  };

  return (
    <div className="rounded-xl border border-amber-400/30 bg-ink-800 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">Review import matches</h2>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border border-white/15 px-2 py-1 text-xs"
            onClick={() => {
              for (const row of rows) {
                const top = row.fuzzy[0];
                if (top && top.distance === 1)
                  acceptAlias(row.incoming.id, row.incoming.name, top.candidate.id, 'auto');
              }
            }}
          >
            Accept all distance 1
          </button>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs text-white/60"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-md bg-field-500 px-2 py-1 text-xs text-ink-950"
            onClick={async () => {
              if (aliases.length) await db.aliases.bulkPut(aliases);
              onApply([...accepted]);
            }}
          >
            Apply
          </button>
        </div>
      </div>
      {report.errors.length > 0 && (
        <p className="mb-2 text-xs text-amber-300">{report.errors.length} rows failed validation</p>
      )}
      <div className="max-h-80 space-y-2 overflow-auto text-sm">
        {rows.map((row) => {
          const top = row.fuzzy[0];
          return (
            <div key={row.incoming.id} className="rounded-md border border-white/10 p-2">
              <div className="flex justify-between gap-3">
                <div>
                  <div>{row.incoming.name}</div>
                  <div className="text-xs text-white/50">
                    {row.incoming.position} · {row.incoming.team} · bye {row.incoming.bye}
                  </div>
                </div>
                {row.exact ? (
                  <span className="text-xs text-field-400">exact id</span>
                ) : row.catalogId ? (
                  <span className="text-xs text-field-400">matched</span>
                ) : top ? (
                  <div className="text-right text-xs">
                    <div>
                      {top.candidate.name} · d={top.distance}
                    </div>
                    <div className="text-white/50">
                      pos {top.positionMatch ? '✓' : '✗'} team {top.teamMatch ? '✓' : '✗'} bye{' '}
                      {top.byeMatch ? '✓' : '✗'}
                    </div>
                    <button
                      type="button"
                      className="mt-1 text-field-400"
                      onClick={() =>
                        acceptAlias(row.incoming.id, row.incoming.name, top.candidate.id, 'user')
                      }
                    >
                      Accept
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-white/40">new player</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
