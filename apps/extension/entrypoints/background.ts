import { parseSleeperDraftId, SLEEPER_HOSTS } from '~/lib/draftId';
import {
  PICK_DEBOUNCE_MS,
  mergePending,
  pickEventSignature,
  toPickMessage,
  type PendingPickEvent,
} from '~/lib/pickDebounce';

const STALE_MS = 8000;
const DRAFT_KEY = 'activeDraftId';
const NAME_KEY = 'activeDraftName';

type PageState = {
  href?: string;
  picks?: string;
  sleeperStatus?: string;
  sleeperId?: string;
  pageExt?: string;
  pageLive?: string;
  pageStatusAt?: string;
};

type Status = {
  draftId: string | null;
  draftName: string | null;
  sleeperLive: boolean;
  appLive: boolean;
  sleeperSeenAt: number;
  appSeenAt: number;
  lastPickAt: number;
  lastPickKind: string | null;
  lastFlushAt: number;
  lastFlushResult: string | null;
  lastFlushKind: string | null;
  lastPayloadCount: number | null;
  lastBoardName: string | null;
  page: PageState | null;
};

export default defineBackground(() => {
  let draftId: string | null = null;
  let draftName: string | null = null;
  let sleeperSeenAt = 0;
  let appSeenAt = 0;
  let lastPickAt = 0;
  let lastPickKind: string | null = null;
  let lastFlushAt = 0;
  let lastFlushResult: string | null = null;
  let lastFlushKind: string | null = null;
  let lastPayloadCount: number | null = null;
  let lastBoardName: string | null = null;
  let page: PageState | null = null;

  let pickTimer: ReturnType<typeof setTimeout> | undefined;
  let pending: PendingPickEvent | null = null;
  let lastFlushSig = '';
  let undelivered: ReturnType<typeof toPickMessage> | null = null;

  const snapshot = (): Status => {
    const now = Date.now();
    return {
      draftId,
      draftName,
      sleeperLive: Boolean(draftId) && now - sleeperSeenAt < STALE_MS,
      appLive: now - appSeenAt < STALE_MS,
      sleeperSeenAt,
      appSeenAt,
      lastPickAt,
      lastPickKind,
      lastFlushAt,
      lastFlushResult,
      lastFlushKind,
      lastPayloadCount,
      lastBoardName,
      page,
    };
  };

  const persist = () => {
    void chrome.storage.session.set({ [DRAFT_KEY]: draftId, [NAME_KEY]: draftName });
    chrome.action.setBadgeText({ text: snapshot().sleeperLive ? 'ON' : '' });
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
  const isSleeper = (url: string) => url.includes('sleeper.com') || url.includes('sleeper.app');

  const flushPicks = () => {
    pickTimer = undefined;
    const event = pending;
    pending = null;
    if (!event) return;
    const sig = pickEventSignature(event);
    lastFlushAt = Date.now();
    lastFlushKind = event.kind;
    if (event.kind === 'payload' && sig === lastFlushSig) {
      lastFlushResult = 'deduped';
      return;
    }
    if (event.kind === 'payload') lastFlushSig = sig;
    const message = toPickMessage(event);
    void notify(message, isApp).then((ok) => {
      lastFlushResult = ok ? 'sent' : 'undelivered';
      if (!ok) undelivered = message;
    });
  };

  const schedulePickEvent = (incoming: PendingPickEvent, kind: string) => {
    lastPickAt = Date.now();
    lastPickKind = kind;
    if (incoming.kind === 'payload') lastPayloadCount = incoming.picks.length;
    pending = mergePending(pending, incoming);
    if (pickTimer !== undefined) clearTimeout(pickTimer);
    pickTimer = setTimeout(flushPicks, PICK_DEBOUNCE_MS);
  };

  const pushStatus = () => {
    const status = snapshot();
    void notify({ type: 'draftrr:status', ...status }, (url) => isApp(url) || isSleeper(url));
  };

  const draftFromOpenTabs = async () => {
    const tabs = await chrome.tabs.query({ url: [...SLEEPER_HOSTS] });
    for (const tab of tabs) {
      const id = parseSleeperDraftId(tab.url ?? '');
      if (!id) continue;
      const title = (tab.title ?? '').replace(/\s*[|\-–•]\s*Sleeper.*$/i, '').trim();
      return {
        draftId: id,
        draftName: title && title.toLowerCase() !== 'sleeper' ? title : null,
      };
    }
    return null;
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'draftrr:sleeper-heartbeat') {
      const prevId = draftId;
      const wasLive = snapshot().sleeperLive;
      draftId = (message.draftId as string | null) ?? null;
      draftName = (message.draftName as string | null) ?? draftName;
      sleeperSeenAt = Date.now();
      if (message.board && typeof message.board === 'object') {
        const board = message.board as { count?: number; lastName?: string };
        if (typeof board.count === 'number') lastPayloadCount = board.count;
        if (typeof board.lastName === 'string' && board.lastName) lastBoardName = board.lastName;
      }
      persist();
      const nowLive = snapshot().sleeperLive;
      if (draftId && (draftId !== prevId || !wasLive) && nowLive) {
        lastFlushSig = '';
        schedulePickEvent({ kind: 'refresh' }, 'sleeper-live');
      }
      pushStatus();
      sendResponse(snapshot());
      return true;
    }

    if (message?.type === 'draftrr:sleeper-disconnect') {
      sleeperSeenAt = 0;
      persist();
      pushStatus();
      sendResponse(snapshot());
      return true;
    }

    if (message?.type === 'draftrr:app-heartbeat') {
      appSeenAt = Date.now();
      if (message.page && typeof message.page === 'object') {
        page = message.page as PageState;
      }
      const pendingPicks = undelivered;
      undelivered = null;
      pushStatus();
      sendResponse(pendingPicks ? { ...snapshot(), pendingPicks } : snapshot());
      return true;
    }

    if (message?.type === 'draftrr:picks-changed') {
      if (typeof message.count === 'number') lastPayloadCount = message.count;
      if (typeof message.lastName === 'string' && message.lastName) {
        lastBoardName = message.lastName as string;
      }
      schedulePickEvent({ kind: 'refresh' }, 'dom');
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === 'draftrr:picks-payload') {
      if (Array.isArray(message.picks)) {
        schedulePickEvent(
          {
            kind: 'payload',
            draftId: message.draftId as string | undefined,
            picks: message.picks as unknown[],
          },
          'payload',
        );
      } else {
        schedulePickEvent({ kind: 'refresh' }, 'network');
      }
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === 'draftrr:get-draft') {
      void (async () => {
        const fromTab = await draftFromOpenTabs();
        if (fromTab) {
          draftId = fromTab.draftId;
          draftName = fromTab.draftName ?? draftName;
          persist();
        }
        sendResponse(snapshot());
      })();
      return true;
    }

    return false;
  });
});
