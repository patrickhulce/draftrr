import { looseKey, nameKey } from './names.js';
import type { Player, Position } from '../types.js';

export function playerId(name: string, position: Position, team: string): string {
  return `${looseKey(name)}-${position.toLowerCase()}-${team.toLowerCase()}`;
}

export function withKeys(
  base: Omit<Player, 'id' | 'nameKey' | 'looseKey'> & { id?: string },
): Player {
  const nk = nameKey(base.name);
  const lk = looseKey(base.name);
  return {
    ...base,
    id: base.id ?? playerId(base.name, base.position, base.team),
    nameKey: nk,
    looseKey: lk,
  };
}
