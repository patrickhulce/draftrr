/** Pull a Sleeper draft id out of a URL or pasted value. */
export function parseSleeperDraftId(input: string): string | null {
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

export const SLEEPER_HOSTS = [
  'https://sleeper.com/*',
  'https://*.sleeper.com/*',
  'https://sleeper.app/*',
  'https://*.sleeper.app/*',
];
