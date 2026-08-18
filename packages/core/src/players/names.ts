const APOSTROPHES = /['\u2018\u2019\u02BC]/g;
const DIACRITICS = /\p{M}/gu;
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

export function normalizeName(input: string): string {
  const nfkd = input.normalize('NFKD').replace(DIACRITICS, '');
  const noApos = nfkd.toLowerCase().replace(APOSTROPHES, '').replace(/\./g, '');
  const spaced = noApos.replace(/[-_/]+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const tokens = spaced
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !SUFFIXES.has(t));
  return tokens.join(' ').trim();
}

export function nameKey(input: string): string {
  return normalizeName(input);
}

export function looseKey(input: string): string {
  return normalizeName(input).replace(/\s+/g, '');
}

export function maxDistanceFor(key: string, cap = 4): number {
  return Math.min(cap, Math.max(1, Math.floor(key.length / 4)));
}
