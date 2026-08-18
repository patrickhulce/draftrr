import Link from 'next/link';

const cards = [
  { href: '/players/', title: 'Players', body: 'Projections, ADP, bye weeks, and value.' },
  {
    href: '/rank/',
    title: 'Rank',
    body: 'Build personal tiers. Drag players and slide boundaries.',
  },
  { href: '/draft/', title: 'Draft', body: 'Live board, availability, and pick recommendations.' },
  { href: '/history/', title: 'History', body: 'Grade past drafts by starter points and bench.' },
];

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Draft like you already know the board.</h1>
        <p className="mt-2 max-w-2xl text-white/60">
          Rank your board, connect a live Sleeper draft, and get positional advice from a
          local-first assistant.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-xl border border-white/10 bg-ink-800 p-5 hover:border-field-400/50"
          >
            <h2 className="text-lg font-medium">{c.title}</h2>
            <p className="mt-1 text-sm text-white/60">{c.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
