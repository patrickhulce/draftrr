import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAGUE } from './defaults.js';
import { gradeDraft } from './history.js';
import { withKeys } from './players/ids.js';
import type { Draft, Player } from './types.js';

function mk(name: string, pos: Player['position'], adp: number): Player {
  return withKeys({
    name,
    position: pos,
    team: 'BUF',
    bye: 12,
    projectedPoints: 200,
    adp,
  });
}

const steal = mk('Late Bargain', 'WR', 20);
const reach = mk('Early Grab', 'RB', 10);
const onBoard = mk('Fair Price', 'TE', 15);

function draftFor(picks: { player: Player; pickNo: number }[]): Draft {
  return {
    id: 'd1',
    name: 'Test',
    rankingSetId: 'default',
    settings: { ...DEFAULT_LEAGUE, teams: 2, rounds: 3 },
    mySlot: 1,
    picks: picks.map(({ player, pickNo }) => ({
      pickNo,
      round: 1,
      slot: 1,
      playerId: player.id,
    })),
    status: 'complete',
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('gradeDraft', () => {
  it('flags picking later than ADP as a steal and earlier as a reach', () => {
    const players = [steal, reach, onBoard];
    const summary = gradeDraft(
      draftFor([
        { player: steal, pickNo: 30 },
        { player: reach, pickNo: 1 },
        { player: onBoard, pickNo: 15 },
      ]),
      players,
    );

    expect(summary.mine?.steals.map((s) => s.playerId)).toEqual([steal.id]);
    expect(summary.mine?.steals[0]?.delta).toBe(10);
    expect(summary.mine?.reaches.map((s) => s.playerId)).toEqual([reach.id]);
    expect(summary.mine?.reaches[0]?.delta).toBe(-9);
    expect(summary.mine?.valueOverAdp).toBe(1);
  });

  it('treats pick 10 vs ADP 20 as a reach and pick 20 vs ADP 10 as a steal', () => {
    const early = mk('Taken Early', 'WR', 20);
    const late = mk('Fallen', 'RB', 10);
    const summary = gradeDraft(
      draftFor([
        { player: early, pickNo: 10 },
        { player: late, pickNo: 20 },
      ]),
      [early, late],
    );

    expect(summary.mine?.reaches.map((s) => s.playerId)).toEqual([early.id]);
    expect(summary.mine?.steals.map((s) => s.playerId)).toEqual([late.id]);
    expect(summary.mine?.valueOverAdp).toBe(0);
  });
});
