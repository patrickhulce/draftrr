import type { RankingItem } from '../types.js';

/**
 * A tier group is a tier break plus every player under it, up to the next tier
 * break. Players ranked above the first tier break form a leading group whose
 * start index is 0.
 */
export function tierGroupStart(items: RankingItem[], index: number): number {
  for (let i = Math.min(index, items.length - 1); i >= 0; i--) {
    if (items[i]?.kind === 'tier') return i;
  }
  return 0;
}

export function tierGroupEnd(items: RankingItem[], start: number): number {
  for (let i = start + 1; i < items.length; i++) {
    if (items[i]?.kind === 'tier') return i;
  }
  return items.length;
}

/**
 * Where the group led by `tierIndex` lands when dropped on `overIndex`: whole
 * groups swap, so it goes above the target group when dragging up and below it
 * when dragging down. Returns an index in `items`, or null when the drop would
 * leave the board unchanged.
 */
export function tierGroupBoundary(
  items: RankingItem[],
  tierIndex: number,
  overIndex: number,
  direction: 1 | -1,
): number | null {
  if (items[tierIndex]?.kind !== 'tier') return null;
  const end = tierGroupEnd(items, tierIndex);
  if (overIndex >= tierIndex && overIndex < end) return null;
  const targetStart = tierGroupStart(items, overIndex);
  const boundary = direction > 0 ? tierGroupEnd(items, targetStart) : targetStart;
  return boundary >= tierIndex && boundary <= end ? null : boundary;
}

/** Lifts the group led by `tierIndex` out of the board and re-inserts it at `boundary`. */
export function moveTierGroupTo(
  items: RankingItem[],
  tierIndex: number,
  boundary: number,
): RankingItem[] {
  if (items[tierIndex]?.kind !== 'tier') return items;
  const end = tierGroupEnd(items, tierIndex);
  if (boundary >= tierIndex && boundary <= end) return items;

  const block = items.slice(tierIndex, end);
  const rest = [...items.slice(0, tierIndex), ...items.slice(end)];
  rest.splice(boundary < tierIndex ? boundary : boundary - block.length, 0, ...block);
  return rest;
}
