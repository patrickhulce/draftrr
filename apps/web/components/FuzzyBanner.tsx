'use client';

import { aliasSourceKey, type FuzzyCandidate, type MatchResult } from '@draftrr/core';
import { toast } from 'sonner';
import { db } from '@/lib/db';

export interface PendingMatch {
  rawName: string;
  match: MatchResult;
  pickNo: number;
}

export function FuzzyBanner({
  pending,
  onResolve,
}: {
  pending: PendingMatch[];
  onResolve: (pickNo: number, playerId: string | null) => void;
}) {
  if (pending.length === 0) return null;
  return (
    <div className="space-y-2">
      {pending.map((p) => {
        const top = p.match.candidates[0] as FuzzyCandidate | undefined;
        return (
          <div
            key={`${p.pickNo}-${p.rawName}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm"
          >
            <div>
              Unmatched pick {p.pickNo}: <strong>{p.rawName}</strong>
              {top ? ` — closest ${top.candidate.name} (d=${top.distance})` : ''}
            </div>
            <div className="flex gap-2">
              {top && (
                <button
                  type="button"
                  className="rounded-md bg-field-500 px-2 py-1 text-xs text-ink-950"
                  onClick={async () => {
                    await db.aliases.put({
                      sourceKey: aliasSourceKey(p.rawName),
                      playerId: top.candidate.id,
                      origin: 'user',
                    });
                    onResolve(p.pickNo, top.candidate.id);
                    toast.success(`Mapped ${p.rawName} → ${top.candidate.name}`);
                  }}
                >
                  Approve
                </button>
              )}
              <button
                type="button"
                className="rounded-md border border-white/20 px-2 py-1 text-xs"
                onClick={() => onResolve(p.pickNo, null)}
              >
                Ignore
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
