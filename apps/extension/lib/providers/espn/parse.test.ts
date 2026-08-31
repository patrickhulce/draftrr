import { describe, expect, it } from 'vitest';
import { draftNameFromTitle, parseDraftId } from './parse';

describe('parseDraftId', () => {
  it('reads leagueId and seasonId from draft URLs', () => {
    expect(
      parseDraftId('https://fantasy.espn.com/football/draft?leagueId=123456&seasonId=2025'),
    ).toBe('123456:2025');
    expect(
      parseDraftId('https://fantasy.espn.com/football/draft?leagueId=99&seasonId=2025&teamId=3'),
    ).toBe('99:2025');
    expect(parseDraftId('https://fantasy.espn.com/football/draft?leagueId=99')).toBe('99');
  });

  it('uses a sentinel when the draft room has no league id', () => {
    expect(parseDraftId('https://fantasy.espn.com/football/draft')).toBe('live');
    expect(parseDraftId('https://fantasy.espn.com/football/draft?seasonId=2025')).toBe('live');
  });

  it('does not claim Sleeper ids or unrelated ESPN pages', () => {
    expect(parseDraftId('1249218413365043200')).toBeNull();
    expect(parseDraftId('https://sleeper.com/draft/nfl/1249218413365043200')).toBeNull();
    expect(parseDraftId('https://fantasy.espn.com/football/team?leagueId=1')).toBeNull();
    expect(parseDraftId('https://fantasy.espn.com/football/league')).toBeNull();
    expect(parseDraftId('not-a-draft')).toBeNull();
  });
});

describe('draftNameFromTitle', () => {
  it('strips the ESPN prefix', () => {
    expect(
      draftNameFromTitle(
        'ESPN Fantasy Football Draft - Practice Draft for Attention is All You Draft',
      ),
    ).toBe('Practice Draft for Attention is All You Draft');
  });
});
