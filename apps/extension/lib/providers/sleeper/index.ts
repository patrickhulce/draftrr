import type { DraftProvider } from '../types';
import { parseDraftId } from './api';
import { boardSignatureOf, readDraftBoard } from './board';
import { fetchSnapshot } from './snapshot';

export const SLEEPER_HOSTS = [
  'https://sleeper.com/*',
  'https://*.sleeper.com/*',
  'https://sleeper.app/*',
  'https://*.sleeper.app/*',
];

export function isSleeperUrl(url: string): boolean {
  return url.includes('sleeper.com') || url.includes('sleeper.app');
}

export function draftNameFromTitle(title: string): string | null {
  const name = title.replace(/\s*[|\-–•]\s*Sleeper.*$/i, '').trim();
  return name.length > 0 && name.toLowerCase() !== 'sleeper' ? name : null;
}

export const sleeperProvider: DraftProvider = {
  id: 'sleeper',
  hostMatches: SLEEPER_HOSTS,
  isProviderUrl: isSleeperUrl,
  parseDraftId,
  draftNameFromTitle,
  fetchSnapshot,
  boardSignature(root?: ParentNode) {
    const board = readDraftBoard(root);
    if (!board.count) return null;
    return boardSignatureOf(board);
  },
  readBoard: readDraftBoard,
};
