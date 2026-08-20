const CELL_SEL = 'div.relative.isolate.w-28.h-16.rounded-xl';

export interface DraftBoardSnapshot {
  count: number;
  lastName: string;
  lastLabel: string;
}

/** Read filled pick cells from Sleeper's live draft board. */
export function readDraftBoard(root: ParentNode = document): DraftBoardSnapshot {
  const cells = [...root.querySelectorAll<HTMLElement>(CELL_SEL)].filter((el) =>
    [...el.classList].some((cls) => cls.startsWith('bg-dls-picked-')),
  );
  const last = cells.at(-1);
  const lastName =
    last?.querySelector<HTMLElement>('span.dls-label-medium')?.textContent?.trim() ?? '';
  const lastLabel =
    last?.querySelector<HTMLElement>('.absolute.right-2.top-2')?.textContent?.trim() ?? '';
  return { count: cells.length, lastName, lastLabel };
}

export function boardSignatureOf(board: DraftBoardSnapshot): string {
  return `${board.count}|${board.lastName}|${board.lastLabel}`;
}
