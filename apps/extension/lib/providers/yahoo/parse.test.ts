import { describe, expect, it } from 'vitest';
import { draftNameFromTitle, parseDraftId } from './parse';

describe('parseDraftId', () => {
  it('reads league ids from draftclient URLs', () => {
    expect(parseDraftId('https://football.fantasysports.yahoo.com/draftclient/f1/123456')).toBe(
      '123456',
    );
    expect(parseDraftId('https://football.fantasysports.yahoo.com/draftclient/f1/99/3')).toBe('99');
    expect(parseDraftId('https://football.fantasysports.yahoo.com/f1/123456/draftclient')).toBe(
      '123456',
    );
    expect(parseDraftId('https://football.fantasysports.yahoo.com/2025/f1/55/draftclient')).toBe(
      '55',
    );
    expect(parseDraftId('https://football.fantasysports.yahoo.com/draftclient?leagueId=77')).toBe(
      '77',
    );
    expect(
      parseDraftId('https://football.fantasysports.yahoo.com/draftclient/f1/10523945/2?auth='),
    ).toBe('10523945');
  });

  it('uses a sentinel when the draft room has no league id', () => {
    expect(parseDraftId('https://football.fantasysports.yahoo.com/draftclient')).toBe('live');
    expect(parseDraftId('https://football.fantasysports.yahoo.com/nfl/draft')).toBe('live');
  });

  it('does not claim Sleeper ids or unrelated Yahoo pages', () => {
    expect(parseDraftId('1249218413365043200')).toBeNull();
    expect(parseDraftId('https://sleeper.com/draft/nfl/1249218413365043200')).toBeNull();
    expect(parseDraftId('https://football.fantasysports.yahoo.com/f1/123456')).toBeNull();
    expect(parseDraftId('https://football.fantasysports.yahoo.com/f1/123456/2')).toBeNull();
    expect(parseDraftId('not-a-draft')).toBeNull();
  });
});

describe('draftNameFromTitle', () => {
  it('strips the Yahoo prefix', () => {
    expect(draftNameFromTitle('Yahoo Fantasy Football Draft - Pooch Kick - H2H')).toBe(
      'Pooch Kick - H2H',
    );
  });
});
