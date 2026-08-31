export const ESPN_HOSTS = ['https://fantasy.espn.com/*', 'https://*.fantasy.espn.com/*'];

const SENTINEL_ID = 'live';

export function isEspnUrl(url: string): boolean {
  return /fantasy\.espn\.com/i.test(url);
}

export function draftNameFromTitle(title: string): string | null {
  const name = title
    .replace(/^ESPN Fantasy Football Draft\s*[-–—]\s*/i, '')
    .replace(/\s*[|\-–•]\s*ESPN.*$/i, '')
    .trim();
  return name.length > 0 && name.toLowerCase() !== 'espn' ? name : null;
}

/** Pull an ESPN draft id out of a URL, path, or pasted value. Never claims bare digits. */
export function parseDraftId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || /^\d+$/.test(trimmed)) return null;

  const espnHint = /fantasy\.espn\.com/i.test(trimmed) || /\/football\/draft/i.test(trimmed);
  if (!espnHint) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    try {
      url = new URL(trimmed, 'https://fantasy.espn.com');
    } catch {
      return null;
    }
  }

  if (url.protocol !== 'file:' && url.hostname && !/espn\.com$/i.test(url.hostname)) {
    return null;
  }

  const isDraftPath = /\/football\/draft/i.test(url.pathname);
  if (!isDraftPath) return null;

  const leagueId = url.searchParams.get('leagueId');
  const seasonId = url.searchParams.get('seasonId');
  if (leagueId && seasonId) return `${leagueId}:${seasonId}`;
  if (leagueId) return leagueId;
  return SENTINEL_ID;
}
