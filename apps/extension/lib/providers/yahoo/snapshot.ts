import {
  WIRE_VERSION,
  type DraftPhase,
  type DraftSnapshot,
  type DraftedPlayer,
  type WireDraftType,
  type WireRosterSlots,
  type WireScoring,
} from '@draftrr/wire';
import { blobOf, readBoardPickCells, readCurrentPickNo, readLastPickRail, textOf } from './board';

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

const YOUR_TURN = /Your Turn - (\d+)(?:st|nd|rd|th) Pick/gi;

const seenByDraft = new Map<string, Map<number, DraftedPlayer>>();

export function resetYahooPickCache(): void {
  seenByDraft.clear();
}

function roundsFromSlots(slots: WireRosterSlots): number {
  return SLOT_KEYS.reduce((sum, key) => sum + (slots[key] ?? 0), 0);
}

function isDraftRoom(root: ParentNode): boolean {
  if (root.querySelector('#main-0-DraftClientBootstrap-Proxy')) return true;
  return blobOf(root).includes('Yahoo Fantasy Football Draft');
}

function draftNameFromRoot(root: ParentNode): string | null {
  for (const el of root.querySelectorAll('span')) {
    if (textOf(el) !== 'Yahoo Fantasy Football Draft') continue;
    const name = textOf(el.nextElementSibling);
    if (name) return name;
  }
  return null;
}

function teamsFromRoot(root: ParentNode): Map<number, string> {
  const out = new Map<number, string>();
  for (const el of root.querySelectorAll('.ys-team[data-id]')) {
    const slot = Number(el.getAttribute('data-id'));
    if (!Number.isFinite(slot) || slot <= 0 || out.has(slot)) continue;
    const name = textOf(el);
    if (name) out.set(slot, name);
  }
  return out;
}

function mySlotFromTeams(teams: Map<number, string>): number | null {
  for (const [slot, name] of teams) {
    if (name === 'You') return slot;
  }
  return null;
}

function yourTurnPicks(root: ParentNode): number[] {
  const out: number[] = [];
  for (const m of blobOf(root).matchAll(YOUR_TURN)) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function draftTypeFromTurns(
  picks: number[],
  teams: number,
  slot: number | null,
  warnings: string[],
): WireDraftType {
  if (picks.length < 2 || !slot || teams <= 0) return 'snake';
  const round2 = picks.find((p) => p > teams);
  if (round2 == null) return 'snake';
  const linear = teams + slot;
  const snake = teams + (teams + 1 - slot);
  if (round2 === linear && round2 !== snake) return 'linear';
  if (round2 !== snake && round2 !== linear) {
    warnings.push('Could not tell snake vs linear from upcoming picks; treating as snake.');
  }
  return 'snake';
}

function slotForPick(pickNo: number, teams: number, draftType: WireDraftType): number {
  if (teams <= 0) return 1;
  const round = Math.ceil(pickNo / teams);
  const pickInRound = ((pickNo - 1) % teams) + 1;
  if (draftType === 'linear' || round % 2 === 1) return pickInRound;
  return teams + 1 - pickInRound;
}

function roundForPick(pickNo: number, teams: number): number {
  if (teams <= 0) return 1;
  return Math.max(1, Math.ceil(pickNo / teams));
}

function pickRowOf(player: Element): Element | null {
  let node: Element | null = player;
  for (let i = 0; i < 6 && node; i += 1) {
    const parent: Element | null = node.parentElement;
    if (!parent) break;
    const first = parent.querySelector(':scope > span');
    if (first && /^\d+$/.test(textOf(first))) return parent;
    node = parent;
  }
  return null;
}

const YAHOO_POS: Record<string, string> = { DEF: 'DST', 'D/ST': 'DST' };

function playerFromEl(el: Element): { name: string; position?: string; team?: string } | null {
  const name = textOf(el.querySelector('span'));
  if (!name) return null;
  const abbrs = [...el.querySelectorAll('abbr')];
  const rawPos = textOf(abbrs[0]);
  const position = rawPos ? (YAHOO_POS[rawPos] ?? rawPos) : undefined;
  const team = textOf(abbrs[1]) || undefined;
  return { name, position, team };
}

function draftedFromBoard(
  root: ParentNode,
  teams: number,
  draftType: WireDraftType,
): DraftedPlayer[] {
  return readBoardPickCells(root).map((cell) => {
    const pickNo = (cell.round - 1) * teams + cell.pickInRound;
    return {
      name: cell.name,
      position: YAHOO_POS[cell.position] ?? cell.position,
      team: cell.team,
      pickNo,
      round: cell.round,
      slot: slotForPick(pickNo, teams, draftType),
    };
  });
}

function draftedFromPicksTab(
  root: ParentNode,
  teams: number,
  draftType: WireDraftType,
): DraftedPlayer[] {
  const byPick = new Map<number, DraftedPlayer>();
  for (const el of root.querySelectorAll('.ys-player:not([data-i13n-module])')) {
    const info = playerFromEl(el);
    const row = pickRowOf(el);
    const pickNo = Number(textOf(row?.querySelector(':scope > span')));
    if (!info || !Number.isFinite(pickNo) || pickNo <= 0) continue;
    byPick.set(pickNo, {
      name: info.name,
      position: info.position,
      team: info.team,
      pickNo,
      round: roundForPick(pickNo, teams),
      slot: slotForPick(pickNo, teams, draftType),
    });
  }
  return [...byPick.values()].sort((a, b) => a.pickNo - b.pickNo);
}

function draftedFromLastRail(
  root: ParentNode,
  currentPickNo: number,
  teams: number,
  draftType: WireDraftType,
): DraftedPlayer | null {
  const last = readLastPickRail(root);
  if (!last) return null;
  const pickNo = currentPickNo > 1 ? currentPickNo - 1 : 0;
  if (pickNo <= 0) return null;
  return {
    name: last.name,
    position: last.position ? (YAHOO_POS[last.position] ?? last.position) : undefined,
    team: last.team,
    pickNo,
    round: roundForPick(pickNo, teams),
    slot: slotForPick(pickNo, teams, draftType),
  };
}

function isInitialName(name: string): boolean {
  return /^[A-Za-z]\.\s+\S/.test(name);
}

function preferRicher(a: DraftedPlayer, b: DraftedPlayer): DraftedPlayer {
  const aInit = isInitialName(a.name);
  const bInit = isInitialName(b.name);
  let name = a.name;
  if (aInit && !bInit) name = b.name;
  else if (aInit === bInit && b.name.length > a.name.length) name = b.name;
  return {
    ...a,
    ...b,
    name,
    position: a.position || b.position,
    team: a.team || b.team,
  };
}

function mergePicks(
  draftId: string,
  sources: Array<DraftedPlayer[] | DraftedPlayer | null>,
): DraftedPlayer[] {
  const map = seenByDraft.get(draftId) ?? new Map<number, DraftedPlayer>();
  for (const source of sources) {
    const picks = !source ? [] : Array.isArray(source) ? source : [source];
    for (const pick of picks) {
      const prev = map.get(pick.pickNo);
      map.set(pick.pickNo, prev ? preferRicher(prev, pick) : pick);
    }
  }
  seenByDraft.set(draftId, map);
  return [...map.values()].sort((a, b) => a.pickNo - b.pickNo);
}

function phaseOf(blob: string, drafted: number, teams: number, rounds: number): DraftPhase {
  if (/Draft Starting Soon/i.test(blob)) return 'pre';
  if (drafted > 0 && teams * rounds > 0 && drafted >= teams * rounds) return 'done';
  return 'live';
}

export function snapshotFromYahoo(
  root: ParentNode,
  draftId: string,
  now = Date.now(),
): DraftSnapshot | null {
  if (!isDraftRoom(root)) return null;

  const warnings: string[] = [];
  const teamMap = teamsFromRoot(root);
  const teams = teamMap.size || DEFAULT_TEAMS;
  const mySlot = mySlotFromTeams(teamMap);
  const turns = yourTurnPicks(root);
  const draftType = draftTypeFromTurns(turns, teams, mySlot, warnings);
  const slots = { ...DEFAULT_SLOTS };
  const scoring = DEFAULT_SCORING;
  warnings.push('Could not read Yahoo scoring; assuming half-PPR.');
  warnings.push('Could not read Yahoo roster; assuming default slots.');

  const rounds = roundsFromSlots(slots);
  const blob = blobOf(root);
  const fromBoard = draftedFromBoard(root, teams, draftType);
  const fromList = draftedFromPicksTab(root, teams, draftType);
  const currentPickNo =
    readCurrentPickNo(root) ??
    (fromBoard.length || fromList.length
      ? Math.max(
          fromBoard.reduce((m, p) => Math.max(m, p.pickNo), 0),
          fromList.reduce((m, p) => Math.max(m, p.pickNo), 0),
        ) + 1
      : 1);
  const fromRail = draftedFromLastRail(root, currentPickNo, teams, draftType);
  const drafted = mergePicks(draftId, [fromBoard, fromList, fromRail]);

  if (currentPickNo > 1 && drafted.length < currentPickNo - 1) {
    warnings.push('Open the Picks or Board tab to sync the full draft.');
  }

  return {
    wire: WIRE_VERSION,
    draftKey: `yahoo:${draftId}`,
    draftName: draftNameFromRoot(root),
    phase: phaseOf(blob, drafted.length, teams, rounds),
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
