import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importPlayersCsv } from '../src/players/importCsv.ts';
import { parseAliasCsv } from '../src/players/aliases.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const csvPath = resolve(root, 'data/players.csv');
const aliasPath = resolve(root, 'data/aliases.csv');
const outDir = resolve(here, '../src/generated');

const report = importPlayersCsv(readFileSync(csvPath, 'utf8'));
if (report.errors.length) {
  console.error(report.errors);
  throw new Error(`players.csv has ${report.errors.length} invalid row(s)`);
}
if (report.players.length === 0) {
  throw new Error('players.csv produced no players');
}

const aliasRows = parseAliasCsv(readFileSync(aliasPath, 'utf8'));
mkdirSync(outDir, { recursive: true });

writeFileSync(
  resolve(outDir, 'players.ts'),
  `import type { Player } from '../types.js';\n\nexport const defaultPlayers: Player[] = ${JSON.stringify(report.players, null, 2)};\n`,
);
writeFileSync(
  resolve(outDir, 'aliases.ts'),
  `import type { SeedAliasRow } from '../players/aliases.js';\n\nexport const seedAliasRows: SeedAliasRow[] = ${JSON.stringify(aliasRows, null, 2)};\n`,
);

console.log(`Wrote ${report.players.length} players and ${aliasRows.length} alias rows`);
