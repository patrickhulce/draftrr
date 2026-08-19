import { cn } from '@/lib/cn';

const DEFAULT_BINS = 12;

function binSamples(samples: number[], bins: number) {
  if (samples.length === 0) return { counts: [] as number[], medianBin: -1 };
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const span = max - min || 1;
  const counts = Array.from({ length: bins }, () => 0);
  for (const value of samples) {
    const index = Math.min(bins - 1, Math.floor(((value - min) / span) * bins));
    counts[index] += 1;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? min;
  const medianBin = Math.min(bins - 1, Math.floor(((median - min) / span) * bins));
  return { counts, medianBin };
}

export function PpgHistogram({
  samples,
  bins = DEFAULT_BINS,
  compact = false,
}: {
  samples: number[];
  bins?: number;
  compact?: boolean;
}) {
  const { counts, medianBin } = binSamples(samples, bins);
  const peak = Math.max(1, ...counts);
  if (counts.length === 0) return null;

  return (
    <div
      className={cn('flex items-end gap-px', compact ? 'h-6' : 'h-10')}
      role="img"
      aria-label="Starter PPG distribution"
    >
      {counts.map((count, i) => (
        <div
          key={i}
          className={cn(
            'min-w-0 flex-1 rounded-t-sm',
            i === medianBin ? 'bg-field-400' : 'bg-white/25',
          )}
          style={{ height: `${Math.max(12, (count / peak) * 100)}%` }}
          title={`${count}`}
        />
      ))}
    </div>
  );
}
