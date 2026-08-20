import { sleeperProvider } from './sleeper';
import type { DraftProvider } from './types';

export type { DraftProvider } from './types';

export const PROVIDERS: DraftProvider[] = [sleeperProvider];

export function allHostMatches(): string[] {
  return PROVIDERS.flatMap((provider) => provider.hostMatches);
}

export function providerById(id: string): DraftProvider | null {
  return PROVIDERS.find((provider) => provider.id === id) ?? null;
}

export function providerForUrl(url: string): DraftProvider | null {
  return PROVIDERS.find((provider) => provider.isProviderUrl(url)) ?? null;
}

export function providerForKey(key: string): DraftProvider | null {
  const idx = key.indexOf(':');
  if (idx <= 0) return null;
  return providerById(key.slice(0, idx));
}

export function makeDraftKey(providerId: string, draftId: string): string {
  return `${providerId}:${draftId}`;
}

export function draftIdFromKey(key: string): string | null {
  const idx = key.indexOf(':');
  if (idx <= 0 || idx === key.length - 1) return null;
  return key.slice(idx + 1);
}

export function resolveConnect(input: string): { provider: DraftProvider; draftId: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const fromUrl = providerForUrl(trimmed);
  if (fromUrl) {
    const id = fromUrl.parseDraftId(trimmed);
    if (id) return { provider: fromUrl, draftId: id };
  }

  const fromKey = providerForKey(trimmed);
  if (fromKey) {
    const id = draftIdFromKey(trimmed);
    if (id) return { provider: fromKey, draftId: id };
  }

  for (const provider of PROVIDERS) {
    const id = provider.parseDraftId(trimmed);
    if (id) return { provider, draftId: id };
  }
  return null;
}
