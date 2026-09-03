export interface DraftBoardSnapshot {
  count: number;
  lastName: string;
  lastLabel: string;
}

export interface LastPickRail {
  name: string;
  position?: string;
  team?: string;
}

export interface YahooBoardPick {
  name: string;
  team: string;
  position: string;
  round: number;
  pickInRound: number;
}

/** `Jahmyr Gibbs, Det-RB, 1.1` on filled Board cells. */
const PICK_TITLE = /^(.+),\s*([A-Za-z]{2,4})-([A-Za-z/]{1,5}),\s*(\d+)\.(\d+)$/;

export function textOf(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

export function blobOf(root: ParentNode): string {
  if ('documentElement' in root) {
    const doc = root as Document;
    return textOf(doc.documentElement) || textOf(doc.body);
  }
  return textOf(root as Element);
}

export function readCurrentPickNo(root: ParentNode): number | null {
  const m = blobOf(root).match(/Round\s+\d+,\s*Pick\s+(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function readLastPickRail(root: ParentNode): LastPickRail | null {
  const spans = [...root.querySelectorAll('span')];
  const idx = spans.findIndex((el) => textOf(el) === 'Last:');
  if (idx < 0) return null;
  const name = textOf(spans[idx + 1]);
  if (!name) return null;
  const meta = textOf(spans[idx + 2]);
  const m = meta.match(/\(\s*([A-Za-z/]{1,4})\s*[·•\-–—]\s*([A-Za-z]{2,4})\s*\)/);
  return {
    name,
    position: m?.[1]?.trim() || undefined,
    team: m?.[2]?.trim() || undefined,
  };
}

export function readBoardPickCells(root: ParentNode): YahooBoardPick[] {
  const byKey = new Map<string, YahooBoardPick>();
  for (const el of root.querySelectorAll('[title]')) {
    const raw = el.getAttribute('title') ?? '';
    const m = raw.match(PICK_TITLE);
    if (!m) continue;
    const round = Number(m[4]);
    const pickInRound = Number(m[5]);
    if (!Number.isFinite(round) || !Number.isFinite(pickInRound) || round <= 0 || pickInRound <= 0) {
      continue;
    }
    const key = `${round}.${pickInRound}`;
    byKey.set(key, {
      name: m[1]!.trim(),
      team: m[2]!,
      position: m[3]!,
      round,
      pickInRound,
    });
  }
  return [...byKey.values()].sort(
    (a, b) => a.round - b.round || a.pickInRound - b.pickInRound,
  );
}

function lastBoardPick(picks: YahooBoardPick[]): YahooBoardPick | undefined {
  return picks.reduce<YahooBoardPick | undefined>((best, pick) => {
    if (!best) return pick;
    if (pick.round > best.round) return pick;
    if (pick.round === best.round && pick.pickInRound > best.pickInRound) return pick;
    return best;
  }, undefined);
}

/** Prefer the Board grid; fall back to the last-pick rail when Board isn't mounted. */
export function readDraftBoard(root: ParentNode = document): DraftBoardSnapshot {
  const cells = readBoardPickCells(root);
  const lastCell = lastBoardPick(cells);
  if (lastCell) {
    return {
      count: cells.length,
      lastName: lastCell.name,
      lastLabel: `${lastCell.round}.${lastCell.pickInRound}`,
    };
  }
  const last = readLastPickRail(root);
  const current = readCurrentPickNo(root);
  const count = current != null && current > 1 ? current - 1 : last ? 1 : 0;
  return {
    count,
    lastName: last?.name ?? '',
    lastLabel: count > 0 ? String(count) : '',
  };
}

export function boardSignatureOf(board: DraftBoardSnapshot): string {
  return `${board.count}|${board.lastName}|${board.lastLabel}`;
}
