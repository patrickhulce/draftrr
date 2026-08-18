'use client';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Something broke</h1>
      <p className="text-sm text-white/60">{error.message}</p>
      <button type="button" className="rounded-md bg-white/10 px-3 py-1.5 text-sm" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
