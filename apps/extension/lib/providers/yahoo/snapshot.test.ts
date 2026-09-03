import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { afterEach, describe, expect, it } from 'vitest';
import { boardSignatureOf, readDraftBoard } from './board';
import { resetYahooPickCache, snapshotFromYahoo } from './snapshot';

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(dir, 'fixture.html'), 'utf8');
const fixturePre = readFileSync(join(dir, 'fixture-pre.html'), 'utf8');
const fixtureBoard = readFileSync(join(dir, 'fixture-board.html'), 'utf8');

function load(html = fixture) {
  return parseHTML(html).document;
}

afterEach(() => {
  resetYahooPickCache();
});

describe('snapshotFromYahoo', () => {
  it('maps the pre-draft fixture', () => {
    const snap = snapshotFromYahoo(load(fixturePre), '123', 1);
    expect(snap).not.toBeNull();
    expect(snap!.draftKey).toBe('yahoo:123');
    expect(snap!.draftName).toBe('Pooch Kick - H2H');
    expect(snap!.phase).toBe('pre');
    expect(snap!.currentPickNo).toBe(1);
    expect(snap!.mySlot).toBe(9);
    expect(snap!.teams).toBe(14);
    expect(snap!.draftType).toBe('snake');
    expect(snap!.scoring).toBe('half-ppr');
    expect(snap!.drafted).toEqual([]);
    expect(snap!.warnings.some((w) => /half-PPR/i.test(w))).toBe(true);
    expect(snap!.updatedAt).toBe(1);
  });

  it('maps the mid-draft fixture', () => {
    const snap = snapshotFromYahoo(load(), '123', 1);
    expect(snap).not.toBeNull();
    expect(snap!.draftKey).toBe('yahoo:123');
    expect(snap!.draftName).toBe('Pooch Kick - H2H');
    expect(snap!.phase).toBe('live');
    expect(snap!.currentPickNo).toBe(7);
    expect(snap!.mySlot).toBe(9);
    expect(snap!.teams).toBe(14);
    expect(snap!.rounds).toBe(15);
    expect(snap!.draftType).toBe('snake');
    expect(snap!.drafted).toHaveLength(6);
    expect(snap!.drafted.map((p) => p.pickNo)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(snap!.drafted[0]).toEqual({
      name: 'J. Gibbs',
      position: 'RB',
      team: 'Det',
      pickNo: 1,
      round: 1,
      slot: 1,
    });
    expect(snap!.drafted.map((p) => p.name)).toEqual([
      'J. Gibbs',
      'B. Robinson',
      'J. Chase',
      'P. Nacua',
      'C. McCaffrey',
      'J. Taylor',
    ]);
    expect(snap!.drafted[5]).toEqual({
      name: 'J. Taylor',
      position: 'RB',
      team: 'Ind',
      pickNo: 6,
      round: 1,
      slot: 6,
    });
    expect(snap!.warnings.some((w) => /Picks or Board/i.test(w))).toBe(false);
    expect(snap!.updatedAt).toBe(1);
  });

  it('maps the Board-tab fixture with full names', () => {
    const snap = snapshotFromYahoo(load(fixtureBoard), '10523945', 1);
    expect(snap).not.toBeNull();
    expect(snap!.draftKey).toBe('yahoo:10523945');
    expect(snap!.draftName).toBe('Squib Kick - H2H');
    expect(snap!.phase).toBe('live');
    expect(snap!.currentPickNo).toBe(76);
    expect(snap!.mySlot).toBe(2);
    expect(snap!.teams).toBe(12);
    expect(snap!.draftType).toBe('snake');
    expect(snap!.drafted).toHaveLength(75);
    expect(snap!.drafted[0]).toEqual({
      name: 'Jahmyr Gibbs',
      position: 'RB',
      team: 'Det',
      pickNo: 1,
      round: 1,
      slot: 1,
    });
    expect(snap!.drafted[1]).toEqual({
      name: 'Bijan Robinson',
      position: 'RB',
      team: 'Atl',
      pickNo: 2,
      round: 1,
      slot: 2,
    });
    const nabers = snap!.drafted.find((p) => p.name === 'Malik Nabers');
    expect(nabers).toEqual({
      name: 'Malik Nabers',
      position: 'WR',
      team: 'NYG',
      pickNo: 24,
      round: 2,
      slot: 1,
    });
    expect(snap!.drafted[74]).toEqual({
      name: 'Dak Prescott',
      position: 'QB',
      team: 'Dal',
      pickNo: 75,
      round: 7,
      slot: 3,
    });
    expect(snap!.warnings.some((w) => /Picks or Board/i.test(w))).toBe(false);
  });

  it('backfills the latest pick from the last-pick rail when the list is missing', () => {
    const html = `<div id="main-0-DraftClientBootstrap-Proxy">
      <span>Yahoo Fantasy Football Draft</span>
      <span>Rail League</span>
      <span>00:20</span>
      <span>Round 1, Pick 3</span>
      <div class="ys-team" data-id="1">A</div>
      <div class="ys-team" data-id="2">B</div>
      <span>Last:</span>
      <span>J. Chase</span>
      <span>(WR · Cin)</span>
    </div>`;
    const snap = snapshotFromYahoo(load(html), 'rail');
    expect(snap?.phase).toBe('live');
    expect(snap?.currentPickNo).toBe(3);
    expect(snap?.drafted).toEqual([
      {
        name: 'J. Chase',
        position: 'WR',
        team: 'Cin',
        pickNo: 2,
        round: 1,
        slot: 2,
      },
    ]);
    expect(snap?.warnings.some((w) => /Picks or Board/i.test(w))).toBe(true);
  });

  it('prefers Board full names over Picks initials in the same document', () => {
    const html = `<div id="main-0-DraftClientBootstrap-Proxy">
      <span>Yahoo Fantasy Football Draft</span>
      <span>Both Tabs</span>
      <span>Round 1, Pick 2</span>
      <div class="ys-team" data-id="1">A</div>
      <div class="ys-team" data-id="2">You</div>
      <div title="Jahmyr Gibbs, Det-RB, 1.1"></div>
      <div>
        <span>1</span>
        <div class="ys-player"><span>J. Gibbs</span><abbr>RB</abbr><abbr>Det</abbr></div>
      </div>
    </div>`;
    const snap = snapshotFromYahoo(load(html), 'both');
    expect(snap?.drafted).toEqual([
      {
        name: 'Jahmyr Gibbs',
        position: 'RB',
        team: 'Det',
        pickNo: 1,
        round: 1,
        slot: 1,
      },
    ]);
  });

  it('keeps Board full names after switching to the Picks tab', () => {
    const boardHtml = `<div id="main-0-DraftClientBootstrap-Proxy">
      <span>Yahoo Fantasy Football Draft</span>
      <span>Switch League</span>
      <span>Round 1, Pick 2</span>
      <div class="ys-team" data-id="1">A</div>
      <div class="ys-team" data-id="2">You</div>
      <div title="Jahmyr Gibbs, Det-RB, 1.1"></div>
    </div>`;
    const picksHtml = `<div id="main-0-DraftClientBootstrap-Proxy">
      <span>Yahoo Fantasy Football Draft</span>
      <span>Switch League</span>
      <span>Round 1, Pick 3</span>
      <div class="ys-team" data-id="1">A</div>
      <div class="ys-team" data-id="2">You</div>
      <div>
        <span>1</span>
        <div class="ys-player"><span>J. Gibbs</span><abbr>RB</abbr><abbr>Det</abbr></div>
      </div>
      <div>
        <span>2</span>
        <div class="ys-player"><span>B. Robinson</span><abbr>RB</abbr><abbr>Atl</abbr></div>
      </div>
    </div>`;
    snapshotFromYahoo(load(boardHtml), 'switch');
    const snap = snapshotFromYahoo(load(picksHtml), 'switch');
    expect(snap?.drafted.map((p) => p.name)).toEqual(['Jahmyr Gibbs', 'B. Robinson']);
    expect(snap?.currentPickNo).toBe(3);
  });

  it('returns null off a non-draft page', () => {
    expect(snapshotFromYahoo(load('<html><body><p>nope</p></body></html>'), 'x')).toBeNull();
  });
});

describe('readDraftBoard', () => {
  it('signatures the latest pick from the last-pick rail', () => {
    const board = readDraftBoard(load());
    expect(board.count).toBe(6);
    expect(board.lastName).toBe('J. Taylor');
    expect(board.lastLabel).toBe('6');
    expect(boardSignatureOf(board)).toBe('6|J. Taylor|6');
  });

  it('signatures the latest filled Board cell', () => {
    const board = readDraftBoard(load(fixtureBoard));
    expect(board.count).toBe(75);
    expect(board.lastName).toBe('Dak Prescott');
    expect(board.lastLabel).toBe('7.3');
    expect(boardSignatureOf(board)).toBe('75|Dak Prescott|7.3');
  });

  it('is empty before the draft starts', () => {
    const board = readDraftBoard(load(fixturePre));
    expect(board.count).toBe(0);
    expect(board.lastName).toBe('');
  });
});
