import { cn } from '@/lib/cn';
import type { LinkStatus } from '@draftrr/wire';

export function DraftLink({
  installed,
  status,
}: {
  installed: boolean;
  status: LinkStatus | null;
}) {
  const live = installed && status?.state === 'linked';
  const label = live
    ? (status?.draftName ?? status?.draftKey ?? 'Draft connected')
    : !installed
      ? 'Extension not detected'
      : status?.state === 'stale'
        ? 'Draft page not open'
        : status?.error
          ? status.error
          : 'Activate a draft tab';

  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span
        className={cn('h-2 w-2 shrink-0 rounded-full', live ? 'bg-emerald-400' : 'bg-rose-500')}
        title={live ? 'Connected to a live draft' : label}
      />
      <span className="text-white/40">{label}</span>
    </span>
  );
}
