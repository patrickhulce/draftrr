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
  /** API-backed providers (Sleeper). DOM-backed providers omit this. */
  fetchSnapshot?(draftId: string): Promise<DraftSnapshot>;
  /** DOM-backed providers (ESPN, Yahoo). */
  readSnapshot?(root: ParentNode, draftId: string): DraftSnapshot | null;
  /** Cheap DOM signature so we only refetch when the board actually moved. */
  boardSignature(root?: ParentNode): string | null;
  readBoard?(root?: ParentNode): BoardDebug;
}
