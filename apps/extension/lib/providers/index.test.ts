import { describe, expect, it } from 'vitest';
import { resolveConnect } from './index';

describe('resolveConnect', () => {
  it('keeps bare numeric ids on Sleeper', () => {
    const resolved = resolveConnect('1249218413365043200');
    expect(resolved?.provider.id).toBe('sleeper');
    expect(resolved?.draftId).toBe('1249218413365043200');
  });

  it('routes ESPN draft URLs to espn', () => {
    const resolved = resolveConnect(
      'https://fantasy.espn.com/football/draft?leagueId=55&seasonId=2026',
    );
    expect(resolved?.provider.id).toBe('espn');
    expect(resolved?.draftId).toBe('55:2026');
  });

  it('parses espn draft keys', () => {
    const resolved = resolveConnect('espn:55:2026');
    expect(resolved?.provider.id).toBe('espn');
    expect(resolved?.draftId).toBe('55:2026');
  });
});
