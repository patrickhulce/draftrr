import { cn } from '@/lib/cn';
import type { SleeperLinkStatus } from '@/lib/sleeper';

export function SleeperLink({
  extensionInstalled,
  sleeperLive,
  draftId,
  draftName,
}: SleeperLinkStatus) {
  const live = extensionInstalled && sleeperLive && Boolean(draftId);
  const label = live
    ? (draftName ?? `Sleeper ${draftId}`)
    : !extensionInstalled
      ? 'Extension not detected'
      : 'Sleeper draft page not open';

  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span
        className={cn('h-2 w-2 shrink-0 rounded-full', live ? 'bg-emerald-400' : 'bg-rose-500')}
        title={live ? 'Connected to a live Sleeper draft' : label}
      />
      <span className="text-white/40">{label}</span>
    </span>
  );
}
