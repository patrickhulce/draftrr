import {
  WIRE_VERSION,
  type DraftPhase,
  type DraftSnapshot,
  type DraftedPlayer,
  type WireDraftType,
  type WireRosterSlots,
  type WireScoring,
} from '@draftrr/wire';

const DEFAULT_TEAMS = 12;
const DEFAULT_SCORING: WireScoring = 'half-ppr';
const DEFAULT_SLOTS: WireRosterSlots = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  FLEX: 2,
  DST: 1,
  K: 0,
  BENCH: 6,
};

const SLOT_KEYS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'DST', 'K', 'BENCH'] as const;

const SETTINGS_SLOT: Record<string, keyof WireRosterSlots | 'SKIP'> = {
  QB: 'QB',
  RB: 'RB',
  WR: 'WR',
  TE: 'TE',
  FLEX: 'FLEX',
  OP: 'FLEX',
  SFLEX: 'FLEX',
  SUPERFLEX: 'FLEX',
  DST: 'DST',
  'D/ST': 'DST',
  DEF: 'DST',
  K: 'K',
  PK: 'K',
  BE: 'BENCH',
  BN: 'BENCH',
  BENCH: 'BENCH',
  IR: 'SKIP',
};

function roundsFromSlots(slots: WireRosterSlots): number {
  return SLOT_KEYS.reduce((sum, key) => sum + (slots[key] ?? 0), 0);
}

function textOf(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function parseGridArea(el: Element): { row: number; col: number } | null {
  const style = el.getAttribute('style') ?? '';
  const m = style.match(/grid-area:\s*(\d+)\s*\/\s*(\d+)/i);
  if (!m) return null;
  return { row: Number(m[1]), col: Number(m[2]) };
}

function parseRoundPick(label: string): { round: number; pickInRound: number } | null {
  const m = label.trim().match(/^(\d+)\.(\d+)$/);
  if (!m) return null;
  return { round: Number(m[1]), pickInRound: Number(m[2]) };
}

function pickNoFor(
  round: number,
  slot: number,
  pickInRound: number | null,
  teams: number,
  draftType: WireDraftType,
): number {
  if (pickInRound != null) return (round - 1) * teams + pickInRound;
  if (draftType === 'linear' || round % 2 === 1) return (round - 1) * teams + slot;
  return (round - 1) * teams + (teams + 1 - slot);
}

function draftTypeFromCells(cells: Element[], teams: number, warnings: string[]): WireDraftType {
  let snake = 0;
  let linear = 0;
  for (const cell of cells) {
    const grid = parseGridArea(cell);
    const rp = parseRoundPick(textOf(cell.querySelector('.roundPick')));
    if (!grid || !rp || rp.round % 2 !== 0) continue;
    if (rp.pickInRound === grid.col) linear += 1;
    if (rp.pickInRound + grid.col === teams + 1) snake += 1;
  }
  if (linear > snake) return 'linear';
  if (snake === 0 && linear === 0 && cells.length === 0) {
    warnings.push('Auction drafts are not supported; treating as snake.');
  }
  return 'snake';
}

function scoringFromValue(raw: string): WireScoring | null {
  const ppr = raw.match(/([\d.]+)\s*Points Per Reception/i);
  const n = ppr ? Number(ppr[1]) : Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n >= 0.9) return 'ppr';
  if (n >= 0.4) return 'half-ppr';
  if (n === 0 || ppr) return 'standard';
  return null;
}

function scoringFromRoot(root: ParentNode, warnings: string[]): WireScoring {
  for (const row of root.querySelectorAll('.tr')) {
    const cells = [...row.querySelectorAll('.td')];
    if (cells.length < 2) continue;
    const label = textOf(cells[0]);
    const value = textOf(cells[1]);
    if (/scoring type/i.test(label) || /points per reception/i.test(value)) {
      const scored = scoringFromValue(value);
      if (scored) return scored;
    }
    if (/each reception/i.test(label) || /\(REC\)/i.test(label)) {
      const scored = scoringFromValue(value);
      if (scored) return scored;
    }
  }
  const blob = textOf(root.querySelector('body') ?? (root as Element));
  const scored = scoringFromValue(blob);
  if (scored && /points per reception|each reception/i.test(blob)) return scored;
  warnings.push('Could not read ESPN scoring; assuming half-PPR.');
  return DEFAULT_SCORING;
}

function slotsFromSettings(root: ParentNode, warnings: string[]): WireRosterSlots | null {
  const rows = [...root.querySelectorAll('.tr')];
  const found: Partial<Record<keyof WireRosterSlots, number>> = {};
  let hits = 0;
  for (const row of rows) {
    const cells = [...row.querySelectorAll('.td')];
    if (cells.length < 2) continue;
    const label = textOf(cells[0]);
    const value = Number(textOf(cells[1]));
    if (!Number.isFinite(value)) continue;
    const code = label.match(/\(([A-Z][A-Z/]*)\)\s*$/)?.[1] ?? '';
    const key = SETTINGS_SLOT[code] ?? SETTINGS_SLOT[label.toUpperCase()];
    if (!key) continue;
    hits += 1;
    if (key === 'SKIP') continue;
    if (code === 'OP' || code === 'SFLEX' || code === 'SUPERFLEX') {
      warnings.push('Superflex is graded as a standard RB/WR/TE flex.');
      found.FLEX = (found.FLEX ?? 0) + value;
    } else {
      found[key] = (found[key] ?? 0) + value;
    }
  }
  if (hits === 0) return null;
  return { ...DEFAULT_SLOTS, ...found };
}

function slotsFromRosterModule(root: ParentNode): WireRosterSlots | null {
  const mod = root.querySelector('.roster-module');
  if (!mod) return null;
  const blob = textOf(mod);
  const counts: WireRosterSlots = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    FLEX: 0,
    DST: 0,
    K: 0,
    BENCH: 0,
  };
  const map: Record<string, keyof WireRosterSlots> = {
    QB: 'QB',
    RB: 'RB',
    WR: 'WR',
    TE: 'TE',
    FLEX: 'FLEX',
    OP: 'FLEX',
    'D/ST': 'DST',
    DST: 'DST',
    K: 'K',
    BE: 'BENCH',
  };
  let hits = 0;
  for (const m of blob.matchAll(/\b(QB|RB|WR|TE|FLEX|OP|D\/ST|DST|K|BE)\b/g)) {
    const key = map[m[1] ?? ''];
    if (!key) continue;
    counts[key] += 1;
    hits += 1;
  }
  return hits > 0 ? counts : null;
}

function slotsFromRoot(root: ParentNode, warnings: string[]): WireRosterSlots {
  return slotsFromSettings(root, warnings) ?? slotsFromRosterModule(root) ?? { ...DEFAULT_SLOTS };
}

function draftNameFromRoot(root: ParentNode): string | null {
  const h1 = textOf(root.querySelector('h1.title, h1'));
  if (h1) {
    const stripped = h1.replace(/^ESPN Fantasy Football Draft\s*[-–—]\s*/i, '').trim();
    if (stripped) return stripped;
  }
  for (const row of root.querySelectorAll('.tr')) {
    const cells = [...row.querySelectorAll('.td')];
    if (cells.length >= 2 && textOf(cells[0]) === 'League Name') {
      const name = textOf(cells[1]);
      if (name) return name;
    }
  }
  return null;
}

function currentPickFromRoot(root: ParentNode): number | null {
  const blob = textOf(root.querySelector('.on-the-clock') ?? (root as unknown as Element));
  const m = blob.match(/On the Clock:\s*Pick\s+(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function roundsFromClock(root: ParentNode): number | null {
  const label = root.querySelector('.clock__label') ?? root.querySelector('[data-testid="clock"]');
  const blob = textOf(label);
  const m = blob.match(/RND\s+\d{1,2}\s+of\s+(\d{1,2})(?!\d)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function maxRoundFromPicks(root: ParentNode): number {
  let max = 0;
  for (const el of root.querySelectorAll('.roundPick')) {
    const rp = parseRoundPick(textOf(el));
    if (rp) max = Math.max(max, rp.round);
  }
  return max;
}

function mySlotFromHeaders(headers: Element[]): number | null {
  const idx = headers.findIndex((el) => el.classList.contains('myTeam'));
  if (idx >= 0) {
    const grid = parseGridArea(headers[idx]!);
    return grid?.col ?? idx + 1;
  }
  return null;
}

function phaseOf(
  drafted: number,
  totalCells: number,
  completedCells: number,
  currentPickNo: number,
  teams: number,
  rounds: number,
): DraftPhase {
  if (completedCells > 0 && completedCells === totalCells) return 'done';
  if (drafted >= teams * rounds && teams * rounds > 0) return 'done';
  if (drafted === 0 && currentPickNo <= 1) return 'pre';
  return 'live';
}

function draftedFromCells(
  cells: Element[],
  teams: number,
  draftType: WireDraftType,
): DraftedPlayer[] {
  const out: DraftedPlayer[] = [];
  for (const cell of cells) {
    const grid = parseGridArea(cell);
    const rp = parseRoundPick(textOf(cell.querySelector('.roundPick')));
    const first = textOf(
      cell.querySelector('.pickCellMiddle .playerFirstName') ??
        cell.querySelector('.playerFirstName'),
    );
    const last = textOf(
      cell.querySelector('.pickCellMiddle .playerLastName') ??
        cell.querySelector('.playerLastName'),
    );
    const name = [first, last].filter(Boolean).join(' ');
    if (!name) continue;
    const round = rp?.round ?? grid?.row ?? 1;
    const slot = grid?.col ?? rp?.pickInRound ?? 1;
    const pickNo = pickNoFor(round, slot, rp?.pickInRound ?? null, teams, draftType);
    const position = textOf(cell.querySelector('.positionPill')) || undefined;
    const team = textOf(cell.querySelector('.playerProTeam')) || undefined;
    out.push({ name, position, team, pickNo, round, slot });
  }
  out.sort((a, b) => a.pickNo - b.pickNo);
  return out;
}

export function snapshotFromEspn(
  root: ParentNode,
  draftId: string,
  now = Date.now(),
): DraftSnapshot | null {
  const headers = [...root.querySelectorAll('.draft-board-grid-header-cell')];
  const pickCells = [...root.querySelectorAll('.draft-board-grid-pick-cell')];
  const completed = [...root.querySelectorAll('.draft-board-grid-pick-cell.completedPick')];
  const isDraftRoom = Boolean(
    headers.length ||
    pickCells.length ||
    root.querySelector('.draftContainer, .draft-content-wrapper, h1.title'),
  );
  if (!isDraftRoom) return null;

  const warnings: string[] = [];
  const teams =
    headers.length ||
    Math.max(0, ...pickCells.map((el) => parseGridArea(el)?.col ?? 0)) ||
    DEFAULT_TEAMS;
  const draftType = draftTypeFromCells(pickCells, teams, warnings);
  const slots = slotsFromRoot(root, warnings);
  const scoring = scoringFromRoot(root, warnings);
  const drafted = draftedFromCells(completed, teams, draftType);
  const clockRounds = roundsFromClock(root);
  const pickRounds = maxRoundFromPicks(root);
  const boardRounds = Math.max(0, ...pickCells.map((el) => parseGridArea(el)?.row ?? 0));
  const rounds = clockRounds || pickRounds || boardRounds || roundsFromSlots(slots);
  const mySlot = mySlotFromHeaders(headers);
  const currentPickNo = currentPickFromRoot(root) ?? drafted.length + 1;
  const phase = phaseOf(
    drafted.length,
    pickCells.length,
    completed.length,
    currentPickNo,
    teams,
    rounds,
  );

  return {
    wire: WIRE_VERSION,
    draftKey: `espn:${draftId}`,
    draftName: draftNameFromRoot(root),
    phase,
    currentPickNo,
    mySlot,
    teams,
    rounds,
    draftType,
    scoring,
    slots,
    drafted,
    warnings,
    updatedAt: now,
  };
}
