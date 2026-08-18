import { describe, expect, it } from 'vitest';
import { moveTierGroupTo, tierGroupBoundary, tierGroupEnd, tierGroupStart } from './tiers.js';
import type { RankingItem } from '../types.js';

function board(spec: string): RankingItem[] {
  return spec
    .split(' ')
    .map((token) =>
      token.startsWith('T')
        ? { kind: 'tier' as const, id: token.toLowerCase(), label: `Tier ${token.slice(1)}` }
        : { kind: 'player' as const, playerId: token },
    );
}

function spec(items: RankingItem[]): string {
  return items
    .map((item) => (item.kind === 'tier' ? item.id.toUpperCase() : item.playerId))
    .join(' ');
}

const three = board('T1 a b T2 c d T3 e f');

/** Drops the group led by `tierIndex` onto `overIndex`, the way the rank page does. */
function drop(items: RankingItem[], tierIndex: number, overIndex: number): string {
  const direction = overIndex > tierIndex ? 1 : -1;
  const boundary = tierGroupBoundary(items, tierIndex, overIndex, direction);
  return spec(boundary == null ? items : moveTierGroupTo(items, tierIndex, boundary));
}

describe('tierGroupStart', () => {
  it('finds the tier break owning a player', () => {
    expect(tierGroupStart(three, 4)).toBe(3);
    expect(tierGroupStart(three, 3)).toBe(3);
  });

  it('treats players above the first tier as a leading group', () => {
    expect(tierGroupStart(board('a b T1 c'), 1)).toBe(0);
  });
});

describe('tierGroupEnd', () => {
  it('stops at the next tier break', () => {
    expect(tierGroupEnd(three, 0)).toBe(3);
  });

  it('runs to the end of the board for the last tier', () => {
    expect(tierGroupEnd(three, 6)).toBe(9);
  });
});

describe('tierGroupBoundary', () => {
  it('lands below the whole target group when dragging down', () => {
    expect(tierGroupBoundary(three, 0, 4, 1)).toBe(6);
  });

  it('lands above the whole target group when dragging up', () => {
    expect(tierGroupBoundary(three, 6, 4, -1)).toBe(3);
  });

  it('reports no move when the drop is inside the dragged group', () => {
    expect(tierGroupBoundary(three, 3, 5, 1)).toBeNull();
  });

  it('reports no move when the group would land where it already is', () => {
    expect(tierGroupBoundary(three, 3, 2, 1)).toBeNull();
  });

  it('ignores a start index that is not a tier break', () => {
    expect(tierGroupBoundary(three, 1, 8, 1)).toBeNull();
  });
});

describe('moveTierGroupTo', () => {
  it('moves a group down past the next group in one short drag', () => {
    // The nearest row below the dragged group belongs to Tier 3, so Tier 2 clears it.
    expect(drop(three, 3, 6)).toBe('T1 a b T3 e f T2 c d');
  });

  it('moves a group up past the previous group in one short drag', () => {
    expect(drop(three, 3, 2)).toBe('T2 c d T1 a b T3 e f');
  });

  it('lands past the target group no matter which of its rows received the drop', () => {
    expect(drop(three, 0, 4)).toBe(drop(three, 0, 5));
  });

  it('moves a group to the end when dropped on the last group', () => {
    expect(drop(three, 0, 8)).toBe('T2 c d T3 e f T1 a b');
  });

  it('keeps the board unchanged when dropped inside the dragged group', () => {
    expect(moveTierGroupTo(three, 3, 4)).toBe(three);
  });
});
