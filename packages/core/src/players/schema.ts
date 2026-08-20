import { z } from 'zod';
import { POSITIONS } from '../types.js';

export const playerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  team: z.string().min(2).max(4),
  position: z.enum(POSITIONS),
  bye: z.number().int().min(1).max(18),
  projectedPoints: z.number().finite(),
  adp: z.number().finite().positive(),
  adpStdev: z.number().finite().positive().optional(),
  externalId: z.string().min(1).optional(),
  tier: z.number().int().positive().optional(),
  ballersRank: z.number().int().positive().optional(),
  notes: z.string().optional(),
  risk: z.number().finite().positive().optional(),
  upside: z.number().finite().positive().optional(),
  nameKey: z.string().min(1),
  looseKey: z.string().min(1),
});

export type CanonicalPlayer = z.infer<typeof playerSchema>;

const HEADER_ALIASES: Record<string, string> = {
  player: 'name',
  'player name': 'name',
  playername: 'name',
  name: 'name',
  player_name: 'name',
  tm: 'team',
  team: 'team',
  'nfl team': 'team',
  nfl: 'team',
  nfl_team: 'team',
  pos: 'position',
  position: 'position',
  bye: 'bye',
  'bye week': 'bye',
  byeweek: 'bye',
  bye_week: 'bye',
  fpts: 'projectedPoints',
  proj: 'projectedPoints',
  projected: 'projectedPoints',
  'projected points': 'projectedPoints',
  points: 'projectedPoints',
  pts: 'projectedPoints',
  avg: 'adp',
  adp: 'adp',
  'sleeper adp': 'adp',
  sleeperadp: 'adp',
  stdev: 'adpStdev',
  sd: 'adpStdev',
  'adp stdev': 'adpStdev',
  sleeperid: 'externalId',
  sleeper_id: 'externalId',
  'sleeper id': 'externalId',
  'external id': 'externalId',
  externalid: 'externalId',
  external_id: 'externalId',
  projectedpoints: 'projectedPoints',
  adpstdev: 'adpStdev',
  notes: 'notes',
  note: 'notes',
  tier: 'tier',
  ballersrank: 'ballersRank',
  'ballers rank': 'ballersRank',
  'ballers ranking': 'ballersRank',
  udk: 'ballersRank',
  'udk rank': 'ballersRank',
  risk: 'risk',
  upside: 'upside',
};

export const CANONICAL_FIELDS = [
  'name',
  'team',
  'position',
  'bye',
  'projectedPoints',
  'adp',
  'adpStdev',
  'externalId',
  'tier',
  'ballersRank',
  'notes',
  'risk',
  'upside',
] as const;

export function mapHeader(raw: string): string | null {
  const trimmed = raw.trim();
  if ((CANONICAL_FIELDS as readonly string[]).includes(trimmed)) return trimmed;
  const key = trimmed.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return HEADER_ALIASES[key] ?? HEADER_ALIASES[key.replace(/\s+/g, '')] ?? null;
}
