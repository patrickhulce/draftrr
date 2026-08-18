import { POSITIONS, type Position } from '../types.js';

const TEAM_ALIASES: Record<string, string> = {
  JAC: 'JAX',
  JAX: 'JAX',
  WSH: 'WAS',
  WAS: 'WAS',
  LA: 'LAR',
  LAR: 'LAR',
  GBP: 'GB',
  GB: 'GB',
  KCC: 'KC',
  KC: 'KC',
  NEP: 'NE',
  NE: 'NE',
  NOS: 'NO',
  NO: 'NO',
  SFO: 'SF',
  SF: 'SF',
  TBB: 'TB',
  TB: 'TB',
  ARZ: 'ARI',
  ARI: 'ARI',
  NOR: 'NO',
  GNB: 'GB',
  KAN: 'KC',
  NWE: 'NE',
  TAM: 'TB',
  SFO49: 'SF',
  PHL: 'PHI',
  PHI: 'PHI',
  CLV: 'CLE',
  CLE: 'CLE',
  BLT: 'BAL',
  BAL: 'BAL',
  HST: 'HOU',
  HOU: 'HOU',
  LVR: 'LV',
  OAK: 'LV',
  LV: 'LV',
  SD: 'LAC',
  LAC: 'LAC',
  STL: 'LAR',
};

const POSITION_ALIASES: Record<string, Position> = {
  QB: 'QB',
  RB: 'RB',
  WR: 'WR',
  TE: 'TE',
  K: 'K',
  PK: 'K',
  KICKER: 'K',
  DST: 'DST',
  DEF: 'DST',
  'D/ST': 'DST',
  'D-ST': 'DST',
  D: 'DST',
};

export function normalizeTeam(raw: string): string | null {
  const key = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (!key) return null;
  return TEAM_ALIASES[key] ?? (key.length <= 3 ? key : null);
}

export function normalizePosition(raw: string): Position | null {
  const key = raw.trim().toUpperCase();
  if (!key) return null;
  const first = key.split(/[/, ]/)[0] ?? key;
  return POSITION_ALIASES[key] ?? POSITION_ALIASES[first] ?? null;
}

export function isPosition(value: string): value is Position {
  return (POSITIONS as readonly string[]).includes(value);
}

export function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[,$]/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
