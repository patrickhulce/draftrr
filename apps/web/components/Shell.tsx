'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const LINKS = [
  { href: '/players/', label: 'Players' },
  { href: '/rank/', label: 'Rank' },
  { href: '/draft/', label: 'Draft' },
  { href: '/history/', label: 'History' },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-ink-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-semibold tracking-tight">
            draftrr
          </Link>
          <nav className="flex gap-1">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm text-white/70 hover:bg-white/5 hover:text-white',
                  path.startsWith(l.href.replace(/\/$/, '')) && 'bg-white/10 text-white',
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
