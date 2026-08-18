import { parseSleeperDraftId, SLEEPER_HOSTS } from '~/lib/draftId';

const STALE_MS = 8000;
const DRAFT_KEY = 'activeDraftId';
const NAME_KEY = 'activeDraftName';

type Status = {
  draftId: string | null;
  draftName: string | null;
  sleeperLive: boolean;
  appLive: boolean;
};

export default defineBackground(() => {
  let draftId: string | null = null;
  let draftName: string | null = null;
  let sleeperSeenAt = 0;
  let appSeenAt = 0;

  const snapshot = (): Status => {
    const now = Date.now();
    return {
      draftId,
      draftName,
      sleeperLive: Boolean(draftId) && now - sleeperSeenAt < STALE_MS,
      appLive: now - appSeenAt < STALE_MS,
    };
  };

  const persist = () => {
    void chrome.storage.session.set({ [DRAFT_KEY]: draftId, [NAME_KEY]: draftName });
    chrome.action.setBadgeText({ text: snapshot().sleeperLive ? 'ON' : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#3d9b6a' });
  };

  const notify = async (message: object, test: (url: string) => boolean) => {
    const tabs = await chrome.tabs.query({});
    await Promise.all(
      tabs.map(async (tab) => {
        if (!tab.id || !tab.url || !test(tab.url)) return;
        try {
          await chrome.tabs.sendMessage(tab.id, message);
        } catch {
          /* tab has no content script */
        }
      }),
    );
  };

  const isApp = (url: string) =>
    url.includes('localhost') || url.includes('127.0.0.1') || url.includes('draftrr.app');
  const isSleeper = (url: string) => url.includes('sleeper.com') || url.includes('sleeper.app');

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
      persist();
      const nowLive = snapshot().sleeperLive;
      if (draftId && (draftId !== prevId || !wasLive) && nowLive) {
        void notify({ type: 'draftrr:refresh-picks' }, isApp);
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
      pushStatus();
      sendResponse(snapshot());
      return true;
    }

    if (message?.type === 'draftrr:picks-changed') {
      void notify({ type: 'draftrr:refresh-picks' }, isApp);
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === 'draftrr:get-draft') {
      void (async () => {
        const fromTab = await draftFromOpenTabs();
        if (fromTab) {
          draftId = fromTab.draftId;
          draftName = fromTab.draftName ?? draftName;
          sleeperSeenAt = Date.now();
          persist();
        }
        sendResponse(snapshot());
      })();
      return true;
    }

    return false;
  });
});
