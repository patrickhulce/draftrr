import type { DraftProvider } from '../types';
import { boardSignatureOf, readDraftBoard } from './board';
import { draftNameFromTitle, isYahooUrl, parseDraftId, YAHOO_HOSTS } from './parse';
import { snapshotFromYahoo } from './snapshot';

export const yahooProvider: DraftProvider = {
  id: 'yahoo',
  hostMatches: YAHOO_HOSTS,
  isProviderUrl: isYahooUrl,
  parseDraftId,
  draftNameFromTitle,
  readSnapshot(root: ParentNode, draftId: string) {
    return snapshotFromYahoo(root, draftId);
  },
  boardSignature(root?: ParentNode) {
    const board = readDraftBoard(root);
    if (!board.count) return null;
    return boardSignatureOf(board);
  },
  readBoard: readDraftBoard,
};
