import type { Player, PositionBranch, RosterSlots } from '@draftrr/core';
import { CompactRoster } from './CompactRoster';
import { PpgHistogram } from './PpgHistogram';
import { cn } from '@/lib/cn';

export function PositionBranches({
  branches,
  slots,
  byId,
}: {
  branches: PositionBranch[];
  slots: RosterSlots;
  byId: Map<string, Player>;
}) {
  return (
    <section className="space-y-2">
      {branches.map((branch) => {
        const pick = branch.pickPlayerId ? byId.get(branch.pickPlayerId) : undefined;
        return (
          <div key={branch.position} className="rounded-xl border border-white/10 p-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-sm">
                <span className={cn('font-medium', `pos-${branch.position}`)}>
                  {branch.position}
                </span>
                {pick ? <span className="text-white/70"> · {pick.name}</span> : null}
              </div>
              <div className="flex min-w-[7rem] flex-col items-end gap-1">
                <div className="text-right font-mono text-sm text-field-400">
                  {branch.expectedPpg.toFixed(1)}
                  <span className="ml-1 font-sans text-[10px] text-white/40">exp</span>
                </div>
                <div className="w-24">
                  <PpgHistogram samples={branch.ppgSamples} compact />
                </div>
              </div>
            </div>
            <CompactRoster
              slots={slots}
              slotsFilled={branch.slotsFilled}
              benchIds={branch.benchIds}
              byId={byId}
            />
          </div>
        );
      })}
      {branches.length === 0 && (
        <p className="rounded-xl border border-white/10 p-3 text-sm text-white/40">
          No remaining skill-position picks to project.
        </p>
      )}
    </section>
  );
}
