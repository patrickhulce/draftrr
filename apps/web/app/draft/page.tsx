'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { DraftSetup } from './Setup';

const LiveDraft = dynamic(() => import('./Live').then((m) => m.LiveDraft), {
  ssr: false,
  loading: () => <p className="text-white/50">Loading board…</p>,
});

export default function DraftPage() {
  return (
    <Suspense fallback={<p className="text-white/50">Loading…</p>}>
      <DraftRoute />
    </Suspense>
  );
}

function DraftRoute() {
  const params = useSearchParams();
  const id = params.get('id');
  return id ? <LiveDraft draftId={id} /> : <DraftSetup />;
}
