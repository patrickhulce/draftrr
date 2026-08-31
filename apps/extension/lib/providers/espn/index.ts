import type { DraftProvider } from '../types';
import { boardSignatureOf, readDraftBoard } from './board';
import { draftNameFromTitle, ESPN_HOSTS, isEspnUrl, parseDraftId } from './parse';
import { snapshotFromEspn } from './snapshot';

export const espnProvider: DraftProvider = {
  id: 'espn',
  hostMatches: ESPN_HOSTS,
  isProviderUrl: isEspnUrl,
  parseDraftId,
  draftNameFromTitle,
  readSnapshot(root: ParentNode, draftId: string) {
    return snapshotFromEspn(root, draftId);
  },
  boardSignature(root?: ParentNode) {
    const board = readDraftBoard(root);
    if (!board.count) return null;
    return boardSignatureOf(board);
  },
  readBoard: readDraftBoard,
};
