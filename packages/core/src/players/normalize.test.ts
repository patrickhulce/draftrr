import { describe, expect, it } from 'vitest';
import { normalizePosition, normalizeTeam } from './normalize.js';

describe('normalizeTeam', () => {
  it('maps common non-NFL and historical aliases', () => {
    expect(normalizeTeam('PHL')).toBe('PHI');
    expect(normalizeTeam('phl')).toBe('PHI');
    expect(normalizeTeam('CLV')).toBe('CLE');
    expect(normalizeTeam('BLT')).toBe('BAL');
    expect(normalizeTeam('HST')).toBe('HOU');
    expect(normalizeTeam('LVR')).toBe('LV');
    expect(normalizeTeam('OAK')).toBe('LV');
    expect(normalizeTeam('SD')).toBe('LAC');
    expect(normalizeTeam('STL')).toBe('LAR');
  });

  it('keeps canonical codes', () => {
    expect(normalizeTeam('PHI')).toBe('PHI');
    expect(normalizeTeam('NE')).toBe('NE');
    expect(normalizeTeam('LAR')).toBe('LAR');
    expect(normalizeTeam('LV')).toBe('LV');
  });

  it('returns null for empty or overlong values', () => {
    expect(normalizeTeam('')).toBeNull();
    expect(normalizeTeam('   ')).toBeNull();
    expect(normalizeTeam('SANFRAN')).toBeNull();
  });
});

describe('normalizePosition', () => {
  it('maps aliases onto canonical positions', () => {
    expect(normalizePosition('PK')).toBe('K');
    expect(normalizePosition('DEF')).toBe('DST');
    expect(normalizePosition('wr')).toBe('WR');
  });
});
