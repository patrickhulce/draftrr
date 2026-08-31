import {
  WIRE_MSG,
  WIRE_VERSION,
  isDraftSnapshot,
  type DraftSnapshot,
  type LinkState,
  type LinkStatus,
} from '@draftrr/wire';
import { PICK_DEBOUNCE_MS } from '~/lib/pickDebounce';
import { makeDraftKey, providerById, providerForUrl, resolveConnect } from '~/lib/providers';

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

type StoredLink = {
  link: Link | null;
  activeTabId: number | null;
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
  activeTabId: number | null;
  tabId: number | null;
  thisTabActive: boolean;
};

function isStoredLink(value: unknown): value is StoredLink {
  return typeof value === 'object' && value !== null && 'link' in value && 'activeTabId' in value;
}

function isLink(value: unknown): value is Link {
  if (typeof value !== 'object' || value === null) return false;
  const rec = value as Record<string, unknown>;
  return (
    typeof rec.providerId === 'string' &&
    typeof rec.draftId === 'string' &&
    typeof rec.draftKey === 'string'
  );
}

export default defineBackground(() => {
  let link: Link | null = null;
  let snapshot: DraftSnapshot | null = null;
  let tabDraftName: string | null = null;
  let activeTabId: number | null = null;
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
  let hydrated = false;

  const now = () => Date.now();

  const senderTabId = (sender: chrome.runtime.MessageSender) => sender.tab?.id ?? null;

  const messageTabId = (sender: chrome.runtime.MessageSender, message: { tabId?: unknown }) => {
    const fromSender = senderTabId(sender);
    if (fromSender != null) return fromSender;
    return typeof message.tabId === 'number' ? message.tabId : null;
  };

  const isActiveTab = (sender: chrome.runtime.MessageSender, message: { tabId?: unknown } = {}) => {
    const tabId = messageTabId(sender, message);
    return tabId != null && tabId === activeTabId;
  };

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

  const debug = (sender?: chrome.runtime.MessageSender): DebugStatus => {
    const tabId = sender ? senderTabId(sender) : null;
    return {
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
      activeTabId,
      tabId,
      thisTabActive: tabId != null && tabId === activeTabId,
    };
  };

  const persist = () => {
    hydrated = true;
    const stored: StoredLink = { link, activeTabId };
    void chrome.storage.session.set({ [LINK_KEY]: stored });
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
    void notify(
      {
        type: 'draftrr:status',
        appLive: now() - appSeenAt < STALE_MS,
        activeTabId,
      },
      isProviderPage,
    );
  };

  const pushSnapshot = () => {
    if (!snapshot) return;
    void notify({ type: WIRE_MSG.snapshot, snapshot }, isApp);
  };

  const applySnapshot = (next: DraftSnapshot, kind: string) => {
    snapshot = next;
    error = null;
    fetching = false;
    lastFetchAt = now();
    lastFetchKind = kind;
    lastFetchResult = 'ok';
    pushSnapshot();
    pushLink();
  };

  const requestSnapshotFromTab = async (tabId: number): Promise<DraftSnapshot> => {
    try {
      const res = (await chrome.tabs.sendMessage(tabId, { type: 'draftrr:read-snapshot' })) as {
        snapshot?: unknown;
      };
      if (isDraftSnapshot(res?.snapshot)) return res.snapshot;
    } catch {
      /* tab has no content script */
    }
    throw new Error('Open the draft in this browser and click Activate.');
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
      let next: DraftSnapshot;
      if (provider.fetchSnapshot) {
        next = await provider.fetchSnapshot(current.draftId);
      } else if (activeTabId != null) {
        next = await requestSnapshotFromTab(activeTabId);
      } else {
        throw new Error('Open the draft in this browser and click Activate.');
      }
      if (gen !== fetchGen || link?.draftKey !== current.draftKey) return;
      applySnapshot(next, kind);
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

  const connectTo = (
    providerId: string,
    draftId: string,
    kind: string,
    immediate: boolean,
    incoming?: DraftSnapshot,
  ) => {
    const draftKey = makeDraftKey(providerId, draftId);
    const same = link?.draftKey === draftKey;
    if (!same) {
      link = { providerId, draftId, draftKey };
      snapshot = null;
      error = null;
    }
    persist();
    if (incoming) {
      applySnapshot(incoming, kind);
      return;
    }
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

  const recordBoard = (message: { board?: unknown; count?: unknown; lastName?: unknown }) => {
    const board =
      message.board && typeof message.board === 'object'
        ? (message.board as { count?: number; lastName?: string })
        : message;
    if (typeof board.count === 'number') lastBoardCount = board.count;
    if (typeof board.lastName === 'string' && board.lastName) lastBoardName = board.lastName;
  };

  const tabMatchesLink = (url: string | undefined) => {
    if (!link || !url) return false;
    const provider = providerForUrl(url);
    const draftId = provider?.parseDraftId(url) ?? null;
    return Boolean(provider && provider.id === link.providerId && draftId === link.draftId);
  };

  const touchActiveTab = async () => {
    if (activeTabId == null || !link) return false;
    try {
      const tab = await chrome.tabs.get(activeTabId);
      return tabMatchesLink(tab.url);
    } catch {
      return false;
    }
  };

  const pollActive = async (kind: string) => {
    if (activeTabId == null || !link) return false;
    const open = await touchActiveTab();
    if (!open) {
      if (providerSeenAt) markProviderStale();
      return false;
    }
    providerSeenAt = now();
    if (!fetching && now() - lastFetchAt >= PICK_DEBOUNCE_MS) {
      void fetchAndPush(kind);
    } else {
      persist();
      pushLink();
    }
    return true;
  };

  const keepAlive = (providerId: string, draftId: string, kind: string) => {
    providerSeenAt = now();
    const wasLinked = Boolean(link);
    const same = link?.providerId === providerId && link?.draftId === draftId;
    if (!same) {
      connectTo(providerId, draftId, kind, true);
    } else if (!wasLinked || !snapshot) {
      void fetchAndPush(kind);
    } else {
      persist();
      pushLink();
    }
  };

  const disconnect = () => {
    fetchGen += 1;
    link = null;
    snapshot = null;
    tabDraftName = null;
    error = null;
    fetching = false;
    providerSeenAt = 0;
    activeTabId = null;
    persist();
    pushLink();
  };

  const markProviderStale = () => {
    providerSeenAt = 0;
    persist();
    pushLink();
  };

  void chrome.storage.session.get(LINK_KEY).then(async (data) => {
    if (hydrated) return;
    const stored = data[LINK_KEY];
    if (!isStoredLink(stored)) {
      hydrated = true;
      return;
    }
    let restoredTab: number | null = null;
    if (typeof stored.activeTabId === 'number') {
      try {
        await chrome.tabs.get(stored.activeTabId);
        restoredTab = stored.activeTabId;
      } catch {
        restoredTab = null;
      }
    }
    if (hydrated) return;
    hydrated = true;
    if (isLink(stored.link)) link = stored.link;
    activeTabId = restoredTab;
    if (!link) {
      pushLink();
      return;
    }
    const open = await pollActive('restore');
    if (!open) void fetchAndPush('restore');
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId !== activeTabId) return;
    activeTabId = null;
    markProviderStale();
  });

  chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (tabId !== activeTabId || !link) return;
    const url = tab.url ?? info.url;
    if (!url) return;
    if (tabMatchesLink(url)) {
      providerSeenAt = now();
      pushLink();
      return;
    }
    if (info.url) markProviderStale();
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'draftrr:provider-heartbeat') {
      const providerId = String(message.provider ?? '');
      const draftId = (message.draftId as string | null) ?? null;
      if (isActiveTab(sender) && draftId && providerById(providerId)) {
        if (typeof message.draftName === 'string' && message.draftName) {
          tabDraftName = message.draftName;
        }
        recordBoard(message);
        const incoming = isDraftSnapshot(message.snapshot) ? message.snapshot : undefined;
        if (incoming) {
          providerSeenAt = now();
          connectTo(providerId, draftId, 'heartbeat', false, incoming);
        } else {
          keepAlive(providerId, draftId, 'heartbeat');
        }
      }
      sendResponse(debug(sender));
      return true;
    }

    if (message?.type === 'draftrr:activate') {
      const tabId = messageTabId(sender, message);
      const providerId = String(message.provider ?? '');
      const draftId = (message.draftId as string | null) ?? null;
      if (tabId != null && draftId && providerById(providerId)) {
        activeTabId = tabId;
        if (typeof message.draftName === 'string' && message.draftName) {
          tabDraftName = message.draftName;
        }
        providerSeenAt = now();
        const incoming = isDraftSnapshot(message.snapshot) ? message.snapshot : undefined;
        connectTo(providerId, draftId, 'activate', true, incoming);
      }
      sendResponse(debug(sender));
      return true;
    }

    if (message?.type === 'draftrr:deactivate') {
      if (isActiveTab(sender, message)) disconnect();
      sendResponse(debug(sender));
      return true;
    }

    if (message?.type === 'draftrr:provider-disconnect') {
      if (isActiveTab(sender)) markProviderStale();
      sendResponse(debug(sender));
      return true;
    }

    if (message?.type === 'draftrr:board-changed') {
      if (isActiveTab(sender)) {
        recordBoard(message);
        const incoming = isDraftSnapshot(message.snapshot) ? message.snapshot : undefined;
        if (incoming) applySnapshot(incoming, 'board');
        else if (link) scheduleFetch('board');
      }
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === WIRE_MSG.connect) {
      connectInput(String(message.input ?? ''), 'connect');
      sendResponse(debug(sender));
      return true;
    }

    if (message?.type === WIRE_MSG.refresh) {
      if (link) void fetchAndPush('refresh');
      sendResponse(debug(sender));
      return true;
    }

    if (message?.type === WIRE_MSG.disconnect) {
      disconnect();
      sendResponse(debug(sender));
      return true;
    }

    if (message?.type === 'draftrr:app-heartbeat') {
      appSeenAt = now();
      if (message.page && typeof message.page === 'object') {
        page = message.page as PageState;
      }
      void (async () => {
        if (activeTabId != null && link) await pollActive('poll');
        else pushLink();
        sendResponse({ link: linkStatus(), snapshot, activeTabId });
      })();
      return true;
    }

    if (message?.type === 'draftrr:get-draft') {
      sendResponse(debug(sender));
      return true;
    }

    return false;
  });
});
