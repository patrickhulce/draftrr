import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { describe, expect, it } from 'vitest';
import { boardSignatureOf, readDraftBoard } from './board';
import { snapshotFromEspn } from './snapshot';

const fixture = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixture.html'), 'utf8');

function load(html = fixture) {
  return parseHTML(html).document;
}

describe('snapshotFromEspn', () => {
  it('maps the practice-draft fixture', () => {
    const snap = snapshotFromEspn(load(), '123:2025', 1);
    expect(snap).not.toBeNull();
    expect(snap!.warnings).toEqual([]);
    expect(snap!.draftKey).toBe('espn:123:2025');
    expect(snap!.draftName).toBe('Practice Draft for Attention is All You Draft');
    expect(snap!.phase).toBe('live');
    expect(snap!.currentPickNo).toBe(16);
    expect(snap!.mySlot).toBe(9);
    expect(snap!.teams).toBe(12);
    expect(snap!.rounds).toBe(15);
    expect(snap!.draftType).toBe('snake');
    expect(snap!.scoring).toBe('half-ppr');
    expect(snap!.slots).toEqual({
      QB: 1,
      RB: 2,
      WR: 2,
      TE: 1,
      FLEX: 1,
      DST: 1,
      K: 1,
      BENCH: 6,
    });
    expect(snap!.drafted).toHaveLength(15);
    expect(snap!.drafted[8]).toEqual({
      name: "De'Von Achane",
      position: 'RB',
      team: 'MIA',
      pickNo: 9,
      round: 1,
      slot: 9,
    });
    expect(snap!.drafted.map((p) => p.pickNo)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
    expect(snap!.drafted[12]?.name).toBe('Ashton Jeanty');
    expect(snap!.drafted[12]?.slot).toBe(12);
    expect(snap!.updatedAt).toBe(1);
  });

  it('reads PPR and standard from reception scoring', () => {
    const ppr = snapshotFromEspn(
      load(
        fixture
          .replace('0.5 Points Per Reception', '1 Points Per Reception')
          .replace('>0.5<', '>1<'),
      ),
      '1',
    );
    expect(ppr?.scoring).toBe('ppr');
    const std = snapshotFromEspn(
      load(
        fixture
          .replace('0.5 Points Per Reception', '0 Points Per Reception')
          .replace('>0.5<', '>0<'),
      ),
      '1',
    );
    expect(std?.scoring).toBe('standard');
  });

  it('does not glue clock digits onto the round count', () => {
    const html = `<div class="draftContainer">
      <h1 class="title">Mock</h1>
      <div data-testid="clock"><div class="clock__label">RND 2 of 15</div><span class="clock__digit">0</span><span class="clock__digit">0</span></div>
      <div class="draft-board-grid-header-cell myTeam" style="grid-area: 1 / 1;">Me</div>
    </div>`;
    expect(snapshotFromEspn(load(html), 'live')?.rounds).toBe(15);
  });

  it('defaults scoring and uses roster-module slots when settings are missing', () => {
    const html = fixture.replace(/<div class="tr">[\s\S]*$/, '').concat('</div></body></html>');
    const snap = snapshotFromEspn(load(html), 'live');
    expect(snap?.scoring).toBe('half-ppr');
    expect(snap?.warnings.some((w) => /half-PPR/i.test(w))).toBe(true);
    expect(snap?.slots).toEqual({
      QB: 1,
      RB: 2,
      WR: 2,
      TE: 1,
      FLEX: 1,
      DST: 1,
      K: 1,
      BENCH: 6,
    });
  });

  it('returns null off a non-draft page', () => {
    expect(snapshotFromEspn(load('<html><body><p>nope</p></body></html>'), 'x')).toBeNull();
  });
});

describe('readDraftBoard', () => {
  it('signatures the latest completed pick', () => {
    const board = readDraftBoard(load());
    expect(board.count).toBe(15);
    expect(board.lastName).toBe('Omarion Hampton');
    expect(board.lastLabel).toBe('2.3');
    expect(boardSignatureOf(board)).toBe('15|Omarion Hampton|2.3');
  });
});
