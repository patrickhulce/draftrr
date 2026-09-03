export const YAHOO_HOSTS = [
  'https://football.fantasysports.yahoo.com/*',
  'https://*.fantasysports.yahoo.com/*',
];

const SENTINEL_ID = 'live';

export function isYahooUrl(url: string): boolean {
  return /fantasysports\.yahoo\.com/i.test(url) || /\/draftclient\//i.test(url);
}

export function draftNameFromTitle(title: string): string | null {
  const name = title
    .replace(/^Yahoo Fantasy Football Draft\s*[-–—]\s*/i, '')
    .replace(/\s*[|\-–•]\s*Yahoo.*$/i, '')
    .trim();
  return name.length > 0 && name.toLowerCase() !== 'yahoo' ? name : null;
}

/** Pull a Yahoo draft id out of a URL, path, or pasted value. Never claims bare digits. */
export function parseDraftId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || /^\d+$/.test(trimmed)) return null;

  const yahooHint = /fantasysports\.yahoo\.com/i.test(trimmed) || /draftclient/i.test(trimmed);
  if (!yahooHint) return null;

  // Prefer the raw path so `?auth=` / team-id suffixes don't depend on URL parsing.
  const fromDraftClient = trimmed.match(/draftclient\/(?:[a-z][a-z0-9]*\/)?(\d+)/i)?.[1];
  if (fromDraftClient) return fromDraftClient;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    try {
      url = new URL(trimmed, 'https://football.fantasysports.yahoo.com');
    } catch {
      return null;
    }
  }

  if (
    url.protocol !== 'file:' &&
    url.hostname &&
    !/fantasysports\.yahoo\.com$/i.test(url.hostname)
  ) {
    return null;
  }

  const isDraftPath = /draftclient/i.test(url.pathname) || /\/draft(?:\/|$)/i.test(url.pathname);
  if (!isDraftPath) return null;

  const leagueId =
    url.searchParams.get('leagueId') ||
    url.pathname.match(/\/f1\/(\d+)/i)?.[1] ||
    url.pathname.match(/\/draftclient\/[^/]+\/(\d+)/i)?.[1];
  return leagueId || SENTINEL_ID;
}
