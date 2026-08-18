import type { SleeperDraft, SleeperPick } from './types.js';
import { SLEEPER_BASE } from './types.js';

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
  const res = await fetchImpl(`${SLEEPER_BASE}${path}`);
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

export function parseDraftId(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(
    /sleeper\.(?:com|app)\/(?:[\w-]+\/)*draft\/(?:[a-z]{2,4}\/)?(\d+)/i,
  );
  if (fromUrl?.[1]) return fromUrl[1];
  if (/^\d{6,}$/.test(trimmed)) return trimmed;
  return null;
}
