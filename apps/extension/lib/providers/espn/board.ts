export interface DraftBoardSnapshot {
  count: number;
  lastName: string;
  lastLabel: string;
}

function cellName(cell: Element): string {
  const first =
    cell.querySelector('.pickCellMiddle .playerFirstName')?.textContent?.trim() ??
    cell.querySelector('.playerFirstName')?.textContent?.trim() ??
    '';
  const last =
    cell.querySelector('.pickCellMiddle .playerLastName')?.textContent?.trim() ??
    cell.querySelector('.playerLastName')?.textContent?.trim() ??
    '';
  return [first, last].filter(Boolean).join(' ');
}

function cellLabel(cell: Element): string {
  return cell.querySelector('.roundPick')?.textContent?.trim() ?? '';
}

function pickOrder(label: string): number {
  const m = label.match(/^(\d+)\.(\d+)$/);
  if (!m) return 0;
  return Number(m[1]) * 1000 + Number(m[2]);
}

/** Read filled pick cells from ESPN's live draft board. */
export function readDraftBoard(root: ParentNode = document): DraftBoardSnapshot {
  const cells = [...root.querySelectorAll('.draft-board-grid-pick-cell.completedPick')];
  const last = cells.reduce<Element | undefined>((best, cell) => {
    if (!best) return cell;
    return pickOrder(cellLabel(cell)) >= pickOrder(cellLabel(best)) ? cell : best;
  }, undefined);
  return {
    count: cells.length,
    lastName: last ? cellName(last) : '',
    lastLabel: last ? cellLabel(last) : '',
  };
}

export function boardSignatureOf(board: DraftBoardSnapshot): string {
  return `${board.count}|${board.lastName}|${board.lastLabel}`;
}
