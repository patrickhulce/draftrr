import type { DraftSnapshot } from '@draftrr/wire';

export interface BoardDebug {
  count: number;
  lastName: string;
  lastLabel: string;
}

export interface DraftProvider {
  id: string;
  hostMatches: string[];
  isProviderUrl(url: string): boolean;
  /** Draft id from a URL, a pasted value, or a draftKey body. */
  parseDraftId(input: string): string | null;
  draftNameFromTitle(title: string): string | null;
  fetchSnapshot(draftId: string): Promise<DraftSnapshot>;
  /** Cheap DOM signature so we only refetch when the board actually moved. */
  boardSignature(root?: ParentNode): string | null;
  readBoard?(root?: ParentNode): BoardDebug;
}
