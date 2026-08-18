import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importPlayersCsv } from './importCsv.js';

const messy = `PLAYER NAME,POS,NFL Team,BYE WEEK,FPTS,Sleeper ADP,Notes
"Ja'Marr Chase",WR,CIN,12,342.4,1.4,stud
Kenneth Walker III,RB,SEA,10,202.4,41.8,
San Francisco,D/ST,SFO,9,112,130,
Bad Row,XYZ,ZZ,99,abc,nope,
`;

describe('importPlayersCsv', () => {
  it('maps common header variations and normalizes values', () => {
    const report = importPlayersCsv(messy);
    expect(report.players).toHaveLength(3);
    expect(report.players[0]?.name).toBe("Ja'Marr Chase");
    expect(report.players[0]?.looseKey).toBe('jamarrchase');
    expect(report.players[1]?.name).toBe('Kenneth Walker III');
    expect(report.players[2]?.position).toBe('DST');
    expect(report.players[2]?.team).toBe('SF');
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]?.row).toBe(5);
  });

  it('loads the repo players.csv', () => {
    const text = readFileSync(resolve(process.cwd(), '../../data/players.csv'), 'utf8');
    const report = importPlayersCsv(text);
    expect(report.errors).toEqual([]);
    expect(report.players.length).toBeGreaterThan(50);
    expect(report.players.some((p) => p.position === 'DST')).toBe(true);
    expect(report.players.some((p) => p.name.includes("'"))).toBe(true);
  });
});
