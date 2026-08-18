import { MAX_EDIT_DISTANCE, NAME_PREFIX_LEN } from '../defaults.js';
import type { FuzzyCandidate, MatchResult, Player, PlayerAlias, Position } from '../types.js';
import { damerauLevenshtein } from './distance.js';
import { looseKey, maxDistanceFor, nameKey } from './names.js';

export interface MatchQuery {
  name?: string;
  position?: Position;
  team?: string;
  sleeperId?: string;
  bye?: number;
}

export interface MatchIndex {
  bySleeperId: Map<string, Player>;
  byNamePos: Map<string, Player[]>;
  byLoosePos: Map<string, Player[]>;
  byAlias: Map<string, Player>;
  all: Player[];
}

function namePosKey(key: string, position: Position): string {
  return `${key}|${position}`;
}

export function buildMatchIndex(players: Player[], aliases: PlayerAlias[] = []): MatchIndex {
  const bySleeperId = new Map<string, Player>();
  const byNamePos = new Map<string, Player[]>();
  const byLoosePos = new Map<string, Player[]>();
  const byId = new Map(players.map((p) => [p.id, p]));

  for (const p of players) {
    if (p.sleeperId) bySleeperId.set(p.sleeperId, p);
    const nk = namePosKey(p.nameKey, p.position);
    const lk = namePosKey(p.looseKey, p.position);
    byNamePos.set(nk, [...(byNamePos.get(nk) ?? []), p]);
    byLoosePos.set(lk, [...(byLoosePos.get(lk) ?? []), p]);
  }

  const byAlias = new Map<string, Player>();
  for (const a of aliases) {
    const player = byId.get(a.playerId);
    if (player) byAlias.set(a.sourceKey, player);
  }

  return { bySleeperId, byNamePos, byLoosePos, byAlias, all: players };
}

function pickUnique(list: Player[] | undefined): Player | undefined {
  if (!list || list.length === 0) return undefined;
  if (list.length === 1) return list[0];
  return undefined;
}

export function findFuzzyCandidates(query: MatchQuery, index: MatchIndex): FuzzyCandidate[] {
  if (!query.name || !query.position) return [];
  const qLoose = looseKey(query.name);
  if (qLoose.length < NAME_PREFIX_LEN) return [];
  const prefix = qLoose.slice(0, NAME_PREFIX_LEN);
  const cap = maxDistanceFor(qLoose, MAX_EDIT_DISTANCE);
  const out: FuzzyCandidate[] = [];

  for (const p of index.all) {
    if (p.position !== query.position) continue;
    if (!p.looseKey.startsWith(prefix)) continue;
    const dist = damerauLevenshtein(qLoose, p.looseKey, cap);
    if (!Number.isFinite(dist) || dist <= 0) continue;
    out.push({
      sourceName: query.name,
      sourcePosition: query.position,
      sourceTeam: query.team,
      sourceBye: query.bye,
      candidate: p,
      distance: dist,
      positionMatch: true,
      teamMatch: Boolean(query.team && query.team === p.team),
      byeMatch: query.bye != null && query.bye === p.bye,
    });
  }

  out.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    if (a.teamMatch !== b.teamMatch) return a.teamMatch ? -1 : 1;
    return a.candidate.adp - b.candidate.adp;
  });
  return out;
}

export function matchPlayer(query: MatchQuery, index: MatchIndex): MatchResult {
  if (query.sleeperId) {
    const hit = index.bySleeperId.get(query.sleeperId);
    if (hit) return { kind: 'sleeperId', player: hit, candidates: [] };
  }

  if (query.position === 'DST' && query.team) {
    const dst = index.all.find((p) => p.position === 'DST' && p.team === query.team);
    if (dst) return { kind: 'nameKey', player: dst, candidates: [] };
  }

  if (query.name && query.position) {
    const nk = nameKey(query.name);
    const exact = pickUnique(index.byNamePos.get(namePosKey(nk, query.position)));
    if (exact) return { kind: 'nameKey', player: exact, candidates: [] };

    const lk = looseKey(query.name);
    const loose = pickUnique(index.byLoosePos.get(namePosKey(lk, query.position)));
    if (loose) return { kind: 'looseKey', player: loose, candidates: [] };

    const alias = index.byAlias.get(lk) ?? index.byAlias.get(nk);
    if (alias) return { kind: 'alias', player: alias, candidates: [] };
  }

  const candidates = findFuzzyCandidates(query, index);
  if (candidates.length > 0) {
    return { kind: 'fuzzy', candidates };
  }
  return { kind: 'unmatched', candidates: [] };
}

export function aliasSourceKey(name: string): string {
  return looseKey(name);
}
