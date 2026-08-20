import { describe, expect, it } from 'vitest';
import { parseDraftId, sleeperGet } from './api';

describe('parseDraftId', () => {
  it('extracts ids from urls and raw digits', () => {
    expect(parseDraftId('https://sleeper.com/draft/nfl/1249218413365043200?x=1')).toBe(
      '1249218413365043200',
    );
    expect(parseDraftId('https://sleeper.com/draft/1249218413365043200')).toBe(
      '1249218413365043200',
    );
    expect(parseDraftId('https://sleeper.com/beta/draft/nfl/1395533647028690944')).toBe(
      '1395533647028690944',
    );
    expect(parseDraftId('https://sleeper.com/beta/draft/nfl/1395306660167163904?x=1')).toBe(
      '1395306660167163904',
    );
    expect(parseDraftId('1249218413365043200')).toBe('1249218413365043200');
    expect(parseDraftId('not-a-draft')).toBeNull();
  });
});

describe('sleeperGet', () => {
  it('does not send If-None-Match (Sleeper CORS rejects it)', async () => {
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.has('If-None-Match')).toBe(false);
      expect(init?.cache).toBe('no-store');
      expect(String(url)).toMatch(/[?&]_=\d+/);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
    await sleeperGet('/draft/1', fetchImpl);
  });
});
