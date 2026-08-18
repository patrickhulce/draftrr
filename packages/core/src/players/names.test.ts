import { describe, expect, it } from 'vitest';
import { looseKey, maxDistanceFor, nameKey, normalizeName } from './names.js';

describe('normalizeName', () => {
  it('drops apostrophes and suffixes', () => {
    expect(normalizeName("Ja'Marr Chase")).toBe('jamarr chase');
    expect(normalizeName('Ja’Marr Chase')).toBe('jamarr chase');
    expect(normalizeName('Kenneth Walker III')).toBe('kenneth walker');
    expect(normalizeName('A.J. Brown')).toBe('aj brown');
    expect(normalizeName('Amon-Ra St. Brown')).toBe('amon ra st brown');
    expect(normalizeName('José')).toBe('jose');
    expect(normalizeName("De'Von Achane")).toBe('devon achane');
    expect(normalizeName('Marvin Harrison Jr.')).toBe('marvin harrison');
  });

  it('builds matching keys', () => {
    expect(nameKey("Ja'Marr Chase")).toBe('jamarr chase');
    expect(looseKey("Ja'Marr Chase")).toBe('jamarrchase');
    expect(looseKey('JaMarr Chase')).toBe('jamarrchase');
    expect(looseKey('ja marr chase')).toBe('jamarrchase');
  });

  it('scales distance cap for short keys', () => {
    expect(maxDistanceFor('abc')).toBe(1);
    expect(maxDistanceFor('abcdefgh')).toBe(2);
    expect(maxDistanceFor('jamarrchase')).toBe(2);
    expect(maxDistanceFor('abcdefghijklmnopqrst')).toBe(4);
  });
});
