import {
  WIRE_MSG,
  WIRE_VERSION,
  type DraftSnapshot,
  type LinkState,
  type LinkStatus,
} from '@draftrr/wire';
import { PICK_DEBOUNCE_MS } from '~/lib/pickDebounce';
import {
  allHostMatches,
  makeDraftKey,
  providerById,
  providerForUrl,
  resolveConnect,
} from '~/lib/providers';

const STALE_MS = 8000;
const LINK_KEY = 'activeLink';

type PageState = {
  href?: string;
  picks?: string;
  draftKey?: string;
  phase?: string;
  pageExt?: string;
  pageLinked?: string;
  pageStatusAt?: string;
};

type Link = {
  providerId: string;
  draftId: string;
  draftKey: string;
};

type DebugStatus = {
  link: LinkStatus;
  snapshot: DraftSnapshot | null;
  providerId: string | null;
  providerSeenAt: number;
  appSeenAt: number;
  lastFetchAt: number;
  lastFetchKind: string | null;
  lastFetchResult: string | null;
  lastBoardName: string | null;
  lastBoardCount: number | null;
  page: PageState | null;
};

export default defineBackground(() => {
  let link: Link | null = null;
  let snapshot: DraftSnapshot | null = null;
  let tabDraftName: string | null = null;
  let providerSeenAt = 0;
  let appSeenAt = 0;
  let error: string | null = null;
  let fetching = false;
  let fetchGen = 0;
  let lastFetchAt = 0;
  let lastFetchKind: string | null = null;
  let lastFetchResult: string | null = null;
  let lastBoardName: string | null = null;
  let lastBoardCount: number | null = null;
  let page: PageState | null = null;
  let pickTimer: ReturnType<typeof setTimeout> | undefined;

  const now = () => Date.now();

  const linkState = (): LinkState => {
    if (error) return 'error';
    if (fetching && !snapshot) return 'connecting';
    if (link && snapshot) {
      return providerSeenAt && now() - providerSeenAt < STALE_MS ? 'linked' : 'stale';
    }
    if (fetching || link) return 'connecting';
    return 'idle';
  };

  const linkStatus = (): LinkStatus => ({
    wire: WIRE_VERSION,
    state: linkState(),
    draftKey: link?.draftKey ?? null,
    draftName: snapshot?.draftName ?? tabDraftName,
    error,
    updatedAt: now(),
  });

  const debug = (): DebugStatus => ({
    link: linkStatus(),
    snapshot,
    providerId: link?.providerId ?? null,
    providerSeenAt,
    appSeenAt,
    lastFetchAt,
    lastFetchKind,
    lastFetchResult,
    lastBoardName,
    lastBoardCount,
    page,
  });

  const persist = () => {
    void chrome.storage.session.set({ [LINK_KEY]: link });
    chrome.action.setBadgeText({ text: linkStatus().state === 'linked' ? 'ON' : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#3d9b6a' });
  };

  const notify = async (message: object, test: (url: string) => boolean) => {
    const tabs = await chrome.tabs.query({});
    const results = await Promise.all(
      tabs.map(async (tab) => {
        if (!tab.id || !tab.url || !test(tab.url)) return false;
        try {
          await chrome.tabs.sendMessage(tab.id, message);
          return true;
        } catch {
          return false;
        }
      }),
    );
    return results.some(Boolean);
  };

  const isApp = (url: string) =>
    url.includes('localhost') || url.includes('127.0.0.1') || url.includes('draftrr.app');
  const isProviderPage = (url: string) => Boolean(providerForUrl(url));

  const pushLink = () => {
    persist();
    const status = linkStatus();
    void notify({ type: WIRE_MSG.link, status }, isApp);
    void notify({ type: 'draftrr:status', appLive: now() - appSeenAt < STALE_MS }, isProviderPage);
  };

  const pushSnapshot = () => {
    if (!snapshot) return;
    void notify({ type: WIRE_MSG.snapshot, snapshot }, isApp);
  };

  const fetchAndPush = async (kind: string) => {
    if (!link) return;
    const current = link;
    const gen = ++fetchGen;
    fetching = true;
    error = null;
    lastFetchAt = now();
    lastFetchKind = kind;
    pushLink();
    try {
      const provider = providerById(current.providerId);
      if (!provider) throw new Error("Couldn't recognize that draft URL.");
      const next = await provider.fetchSnapshot(current.draftId);
      if (gen !== fetchGen || link?.draftKey !== current.draftKey) return;
      snapshot = next;
      error = null;
      lastFetchResult = 'ok';
      pushSnapshot();
    } catch (err) {
      if (gen !== fetchGen) return;
      error = err instanceof Error ? err.message : 'Failed to load draft';
      lastFetchResult = 'error';
    } finally {
      if (gen === fetchGen) fetching = false;
      pushLink();
    }
  };

  const scheduleFetch = (kind: string) => {
    if (pickTimer !== undefined) clearTimeout(pickTimer);
    pickTimer = setTimeout(() => {
      pickTimer = undefined;
      void fetchAndPush(kind);
    }, PICK_DEBOUNCE_MS);
  };

  const connectTo = (providerId: string, draftId: string, kind: string, immediate: boolean) => {
    const draftKey = makeDraftKey(providerId, draftId);
    const same = link?.draftKey === draftKey;
    if (!same) {
      link = { providerId, draftId, draftKey };
      snapshot = null;
      error = null;
    }
    persist();
    if (immediate) void fetchAndPush(kind);
    else scheduleFetch(kind);
  };

  const connectInput = (input: string, kind: string) => {
    const resolved = resolveConnect(input);
    if (!resolved) {
      error = "Couldn't recognize that draft URL.";
      fetching = false;
      pushLink();
      return;
    }
    connectTo(resolved.provider.id, resolved.draftId, kind, true);
  };

  const disconnect = () => {
    fetchGen += 1;
    link = null;
    snapshot = null;
    tabDraftName = null;
    error = null;
    fetching = false;
    providerSeenAt = 0;
    persist();
    pushLink();
  };

  const draftFromOpenTabs = async () => {
    const tabs = await chrome.tabs.query({ url: allHostMatches() });
    for (const tab of tabs) {
      const provider = providerForUrl(tab.url ?? '');
      if (!provider) continue;
      const id = provider.parseDraftId(tab.url ?? '');
      if (!id) continue;
      const title = provider.draftNameFromTitle(tab.title ?? '');
      return { provider, draftId: id, draftName: title };
    }
    return null;
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'draftrr:provider-heartbeat') {
      const providerId = String(message.provider ?? '');
      const draftId = (message.draftId as string | null) ?? null;
      if (typeof message.draftName === 'string' && message.draftName) {
        tabDraftName = message.draftName;
      }
      if (message.board && typeof message.board === 'object') {
        const board = message.board as { count?: number; lastName?: string };
        if (typeof board.count === 'number') lastBoardCount = board.count;
        if (typeof board.lastName === 'string' && board.lastName) lastBoardName = board.lastName;
      }
      if (draftId && providerById(providerId)) {
        providerSeenAt = now();
        const wasLinked = Boolean(link);
        const same = link?.providerId === providerId && link?.draftId === draftId;
        if (!same) {
          connectTo(providerId, draftId, 'heartbeat', true);
        } else if (!wasLinked || !snapshot) {
          void fetchAndPush('heartbeat');
        } else {
          persist();
          pushLink();
        }
      }
      sendResponse(debug());
      return true;
    }

    if (message?.type === 'draftrr:provider-disconnect') {
      providerSeenAt = 0;
      persist();
      pushLink();
      sendResponse(debug());
      return true;
    }

    if (message?.type === 'draftrr:board-changed') {
      if (typeof message.count === 'number') lastBoardCount = message.count;
      if (typeof message.lastName === 'string' && message.lastName) {
        lastBoardName = message.lastName as string;
      }
      if (link) scheduleFetch('board');
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === WIRE_MSG.connect) {
      connectInput(String(message.input ?? ''), 'connect');
      sendResponse(debug());
      return true;
    }

    if (message?.type === WIRE_MSG.refresh) {
      if (link) void fetchAndPush('refresh');
      sendResponse(debug());
      return true;
    }

    if (message?.type === WIRE_MSG.disconnect) {
      disconnect();
      sendResponse(debug());
      return true;
    }

    if (message?.type === 'draftrr:app-heartbeat') {
      appSeenAt = now();
      if (message.page && typeof message.page === 'object') {
        page = message.page as PageState;
      }
      pushLink();
      sendResponse({ link: linkStatus(), snapshot });
      return true;
    }

    if (message?.type === 'draftrr:get-draft') {
      void (async () => {
        if (!link) {
          const fromTab = await draftFromOpenTabs();
          if (fromTab) {
            tabDraftName = fromTab.draftName;
            connectTo(fromTab.provider.id, fromTab.draftId, 'popup', true);
          }
        }
        sendResponse(debug());
      })();
      return true;
    }

    return false;
  });
});
