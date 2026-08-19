export const PICK_DEBOUNCE_MS = 2000;

export type PendingPickEvent =
  { kind: 'payload'; draftId?: string; picks: unknown[] } | { kind: 'refresh' };

export function pickEventSignature(event: PendingPickEvent): string {
  if (event.kind === 'refresh') return 'refresh';
  const last = event.picks.at(-1);
  return `${event.draftId ?? ''}:${event.picks.length}:${JSON.stringify(last ?? null)}`;
}

/** Prefer a body when one arrives during the debounce window. */
export function mergePending(
  current: PendingPickEvent | null,
  incoming: PendingPickEvent,
): PendingPickEvent {
  if (incoming.kind === 'payload') return incoming;
  if (current?.kind === 'payload') return current;
  return incoming;
}

export function toPickMessage(event: PendingPickEvent): {
  type: string;
  draftId?: string;
  picks?: unknown[];
} {
  if (event.kind === 'payload') {
    return { type: 'draftrr:picks-payload', draftId: event.draftId, picks: event.picks };
  }
  return { type: 'draftrr:refresh-picks' };
}
