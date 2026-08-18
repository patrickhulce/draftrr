import { playerSchema } from './schema.js';
import { mapHeader } from './schema.js';
import { normalizePosition, normalizeTeam, parseNumber } from './normalize.js';
import { withKeys } from './ids.js';
import type { ImportReport, Player } from '../types.js';

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

export function importPlayersCsv(text: string): ImportReport {
  const table = parseCsv(text);
  if (table.length === 0) {
    return { players: [], unmappedColumns: [], errors: [], fuzzyMatches: [] };
  }
  const header = table[0] ?? [];
  const mapped = header.map((h) => mapHeader(h));
  const unmappedColumns = header.filter((_, i) => mapped[i] === null);

  const players: Player[] = [];
  const errors: ImportReport['errors'] = [];

  for (let r = 1; r < table.length; r++) {
    const cells = table[r] ?? [];
    const raw: Record<string, string> = {};
    const rec: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      const key = header[c] ?? `col${c}`;
      const value = cells[c] ?? '';
      raw[key] = value;
      const canon = mapped[c];
      if (canon) rec[canon] = value;
    }

    const name = rec.name?.trim();
    const team = rec.team ? normalizeTeam(rec.team) : null;
    const position = rec.position ? normalizePosition(rec.position) : null;
    const bye = rec.bye ? parseNumber(rec.bye) : null;
    const projectedPoints = rec.projectedPoints ? parseNumber(rec.projectedPoints) : null;
    const adp = rec.adp ? parseNumber(rec.adp) : null;

    if (!name || !team || !position || bye == null || projectedPoints == null || adp == null) {
      errors.push({
        row: r + 1,
        message: 'Missing required field after normalization',
        raw,
      });
      continue;
    }

    const candidate = withKeys({
      name,
      team,
      position,
      bye: Math.round(bye),
      projectedPoints,
      adp,
      adpStdev: rec.adpStdev ? (parseNumber(rec.adpStdev) ?? undefined) : undefined,
      sleeperId: rec.sleeperId?.trim() || undefined,
      tier: rec.tier ? (parseNumber(rec.tier) ?? undefined) : undefined,
      ballersRank: rec.ballersRank ? (parseNumber(rec.ballersRank) ?? undefined) : undefined,
      notes: rec.notes?.trim() || undefined,
      risk: rec.risk ? (parseNumber(rec.risk) ?? undefined) : undefined,
      upside: rec.upside ? (parseNumber(rec.upside) ?? undefined) : undefined,
    });

    const parsed = playerSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push({
        row: r + 1,
        message: parsed.error.issues.map((i) => i.message).join('; '),
        raw,
      });
      continue;
    }
    players.push(parsed.data);
  }

  return { players, unmappedColumns, errors, fuzzyMatches: [] };
}
