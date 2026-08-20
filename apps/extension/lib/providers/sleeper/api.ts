import type { SleeperDraft, SleeperPick } from './apiTypes';
import { SLEEPER_BASE } from './apiTypes';

export interface FetchResult<T> {
  data: T;
  status: number;
}

export async function sleeperGet<T>(
  path: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchResult<T>> {
  // Do not send If-None-Match: Sleeper's CORS allow-list omits it, so a
  // second poll with an etag preflights and the browser reports "Failed to fetch".
  // cache: 'no-store' plus a bust query keep the browser (and any CDN copy)
  // from replaying the first pre_draft / empty-picks body.
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetchImpl(`${SLEEPER_BASE}${path}${sep}_=${Date.now()}`, {
    cache: 'no-store',
  } as RequestInit);
  if (!res.ok) {
    throw new Error(`Sleeper ${path} failed: ${res.status}`);
  }
  const data = (await res.json()) as T;
  return { data, status: res.status };
}

export function fetchDraft(draftId: string, fetchImpl?: typeof fetch) {
  return sleeperGet<SleeperDraft>(`/draft/${draftId}`, fetchImpl);
}

export function fetchDraftPicks(draftId: string, fetchImpl?: typeof fetch) {
  return sleeperGet<SleeperPick[]>(`/draft/${draftId}/picks`, fetchImpl);
}

/** Pull a Sleeper draft id out of a URL, path, or pasted value. */
export function parseDraftId(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(
    /sleeper\.(?:com|app)\/(?:[\w-]+\/)*draft\/(?:[a-z]{2,4}\/)?(\d+)/i,
  );
  if (fromUrl?.[1]) return fromUrl[1];
  const fromPath = trimmed.match(/\/draft\/(?:[a-z]{2,4}\/)?(\d+)/i);
  if (fromPath?.[1]) return fromPath[1];
  if (/^\d{6,}$/.test(trimmed)) return trimmed;
  return null;
}
