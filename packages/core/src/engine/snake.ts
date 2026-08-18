import type { DraftType } from '../types.js';

/** 1-indexed pick numbers. Slots are 1-indexed. */
export function slotForPick(
  pickNo: number,
  teams: number,
  draftType: DraftType,
): { round: number; slot: number } {
  const round = Math.floor((pickNo - 1) / teams) + 1;
  const posInRound = ((pickNo - 1) % teams) + 1;
  const slot = draftType === 'snake' && round % 2 === 0 ? teams - posInRound + 1 : posInRound;
  return { round, slot };
}

export function pickOrder(teams: number, rounds: number, draftType: DraftType): number[] {
  const total = teams * rounds;
  const slots: number[] = [];
  for (let n = 1; n <= total; n++) {
    slots.push(slotForPick(n, teams, draftType).slot);
  }
  return slots;
}

export function picksForSlot(
  afterPickNo: number,
  slot: number,
  teams: number,
  rounds: number,
  draftType: DraftType,
): number[] {
  const total = teams * rounds;
  const picks: number[] = [];
  for (let n = afterPickNo + 1; n <= total; n++) {
    if (slotForPick(n, teams, draftType).slot === slot) picks.push(n);
  }
  return picks;
}

export function nextPickForSlot(
  afterPickNo: number,
  slot: number,
  teams: number,
  rounds: number,
  draftType: DraftType,
): number | null {
  return picksForSlot(afterPickNo, slot, teams, rounds, draftType)[0] ?? null;
}

/** How many remaining ranked names go before our next pick in a worst-case board. */
export function worstCaseSkip(currentPickNo: number, nextMyPickNo: number | null): number {
  if (nextMyPickNo == null) return 0;
  return Math.max(0, nextMyPickNo - currentPickNo);
}

/** Remaining board after others take our ranking in order until our next pick. */
export function worstCaseReachable<T>(
  remaining: readonly T[],
  currentPickNo: number,
  nextMyPickNo: number | null,
): T[] {
  if (nextMyPickNo == null) return [];
  return remaining.slice(worstCaseSkip(currentPickNo, nextMyPickNo));
}

/** Players sitting on our remaining pick slots if the board goes in ranking order. */
export function worstCaseHighlighted<T>(
  remaining: readonly T[],
  currentPickNo: number,
  pickNos: readonly number[],
): T[] {
  return pickNos
    .map((n) => remaining[n - currentPickNo])
    .filter((item): item is T => item !== undefined);
}
