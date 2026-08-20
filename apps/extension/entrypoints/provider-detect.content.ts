import { allHostMatches, providerForUrl } from '~/lib/providers';
import { onRuntimeMessage, sendMessage } from '~/lib/runtime';

const STALE_MS = 8000;

type StatusPayload = {
  tabId?: number | null;
  thisTabActive?: boolean;
  activeTabId?: number | null;
  appSeenAt?: number;
  appLive?: boolean;
};

let myTabId: number | null = null;
let thisTabActive = false;
let appLive = false;

function ensureBadge() {
  let el = document.getElementById('draftrr-link') as HTMLButtonElement | null;
  if (el) return el;
  el = document.createElement('button');
  el.id = 'draftrr-link';
  el.type = 'button';
  el.style.cssText = [
    'position:fixed',
    'right:12px',
    'bottom:12px',
    'z-index:2147483647',
    'display:flex',
    'align-items:center',
    'gap:6px',
    'padding:6px 10px',
    'border:none',
    'border-radius:999px',
    'background:#0b1220ee',
    'color:#5ec48a',
    'font:12px/1.2 system-ui,sans-serif',
    'box-shadow:0 0 0 1px #ffffff22',
    'cursor:pointer',
    'pointer-events:auto',
    'user-select:none',
  ].join(';');
  el.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const provider = providerForUrl(location.href);
    const draftId = provider?.parseDraftId(location.href) ?? null;
    if (!provider || !draftId) return;
    if (thisTabActive) {
      sendMessage({ type: 'draftrr:deactivate' }, applyStatus);
      return;
    }
    sendMessage(
      {
        type: 'draftrr:activate',
        provider: provider.id,
        draftId,
        draftName: provider.draftNameFromTitle(document.title),
      },
      applyStatus,
    );
  });
  document.documentElement.appendChild(el);
  return el;
}

function renderBadge() {
  const el = ensureBadge();
  const live = thisTabActive;
  if (el.dataset.live !== String(live)) {
    el.dataset.live = String(live);
    el.style.color = live ? '#9aa4b2' : '#5ec48a';
    el.title = live ? 'Stop sending this draft to draftrr' : 'Send this draft to draftrr';
    el.innerHTML = live
      ? '<span id="draftrr-dot" style="width:8px;height:8px;border-radius:99px;background:#f43f5e;flex:0 0 auto"></span><span>draftrr · live</span>'
      : '<span>Activate</span>';
  }
  if (live) {
    const dot = document.getElementById('draftrr-dot');
    if (dot) dot.style.background = appLive ? '#34d399' : '#f43f5e';
  }
}

function hideBadge() {
  document.getElementById('draftrr-link')?.remove();
}

function applyStatus(res: unknown) {
  const data = res as StatusPayload | undefined;
  if (typeof data?.tabId === 'number') myTabId = data.tabId;
  if (typeof data?.thisTabActive === 'boolean') {
    thisTabActive = data.thisTabActive;
  } else if (myTabId != null && 'activeTabId' in (data ?? {})) {
    thisTabActive = data?.activeTabId === myTabId;
  }
  if (typeof data?.appLive === 'boolean') {
    appLive = data.appLive;
  } else {
    const seen = data?.appSeenAt ?? 0;
    appLive = Boolean(seen) && Date.now() - seen < STALE_MS;
  }
  renderBadge();
}

function currentDraft() {
  const provider = providerForUrl(location.href);
  const draftId = provider?.parseDraftId(location.href) ?? null;
  if (!provider || !draftId) return null;
  return { provider, draftId };
}

export default defineContentScript({
  matches: allHostMatches(),
  runAt: 'document_idle',
  main(ctx) {
    const beat = () => {
      const draft = currentDraft();
      if (!draft) {
        if (thisTabActive) sendMessage({ type: 'draftrr:deactivate' });
        thisTabActive = false;
        hideBadge();
        return;
      }
      renderBadge();
      sendMessage(
        {
          type: 'draftrr:provider-heartbeat',
          provider: draft.provider.id,
          draftId: draft.draftId,
          draftName: draft.provider.draftNameFromTitle(document.title),
          board: draft.provider.readBoard?.(),
        },
        applyStatus,
      );
    };

    const wrap = (fn: typeof history.pushState) =>
      function (this: History, ...args: Parameters<typeof history.pushState>) {
        const ret = fn.apply(this, args);
        beat();
        return ret;
      };
    history.pushState = wrap(history.pushState.bind(history));
    history.replaceState = wrap(history.replaceState.bind(history));
    window.addEventListener('popstate', beat);
    window.addEventListener('pagehide', () => {
      sendMessage({ type: 'draftrr:provider-disconnect' });
    });

    onRuntimeMessage((message) => {
      if (message.type !== 'draftrr:status' || !currentDraft()) return;
      if (
        myTabId != null &&
        (typeof message.activeTabId === 'number' || message.activeTabId === null)
      ) {
        thisTabActive = message.activeTabId === myTabId;
      }
      appLive = Boolean(message.appLive);
      renderBadge();
    });

    let lastSig = '';
    const pollBoard = () => {
      if (!thisTabActive) return;
      const draft = currentDraft();
      if (!draft) return;
      const board = draft.provider.readBoard?.();
      const sig = draft.provider.boardSignature();
      if (!sig || sig === lastSig) return;
      lastSig = sig;
      sendMessage({
        type: 'draftrr:board-changed',
        count: board?.count,
        lastName: board?.lastName,
        lastLabel: board?.lastLabel,
      });
    };

    beat();
    pollBoard();
    ctx.setInterval(beat, 3000);
    ctx.setInterval(pollBoard, 1000);
    ctx.onInvalidated(() => {
      hideBadge();
    });
  },
});
