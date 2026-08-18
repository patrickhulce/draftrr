import { parseSleeperDraftId } from '~/lib/draftId';
import { onRuntimeMessage, sendMessage } from '~/lib/runtime';

function draftNameFromPage(): string | null {
  const title = document.title.replace(/\s*[|\-–•]\s*Sleeper.*$/i, '').trim();
  return title.length > 0 && title.toLowerCase() !== 'sleeper' ? title : null;
}

function ensureBadge() {
  let el = document.getElementById('draftrr-link');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'draftrr-link';
  el.style.cssText = [
    'position:fixed',
    'right:12px',
    'bottom:12px',
    'z-index:2147483647',
    'display:flex',
    'align-items:center',
    'gap:6px',
    'padding:6px 10px',
    'border-radius:999px',
    'background:#0b1220ee',
    'color:#9aa4b2',
    'font:12px/1.2 system-ui,sans-serif',
    'box-shadow:0 0 0 1px #ffffff22',
    'pointer-events:none',
  ].join(';');
  el.innerHTML =
    '<span id="draftrr-dot" style="width:8px;height:8px;border-radius:99px;background:#f43f5e"></span><span>draftrr</span>';
  document.documentElement.appendChild(el);
  return el;
}

function setBadge(appLive: boolean) {
  ensureBadge();
  const dot = document.getElementById('draftrr-dot');
  if (dot) dot.style.background = appLive ? '#34d399' : '#f43f5e';
}

function hideBadge() {
  document.getElementById('draftrr-link')?.remove();
}

export default defineContentScript({
  matches: [
    'https://sleeper.com/*',
    'https://*.sleeper.com/*',
    'https://sleeper.app/*',
    'https://*.sleeper.app/*',
  ],
  runAt: 'document_idle',
  main(ctx) {
    const beat = () => {
      const draftId = parseSleeperDraftId(location.href);
      if (!draftId) {
        hideBadge();
        return;
      }
      sendMessage(
        {
          type: 'draftrr:sleeper-heartbeat',
          draftId,
          draftName: draftNameFromPage(),
        },
        (res) => {
          const live = Boolean((res as { appLive?: boolean } | undefined)?.appLive);
          setBadge(live);
        },
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
      sendMessage({ type: 'draftrr:sleeper-disconnect' });
    });

    onRuntimeMessage((message) => {
      if (message.type === 'draftrr:status' && parseSleeperDraftId(location.href)) {
        setBadge(Boolean(message.appLive));
      }
    });

    let lastPickSig = '';
    let pickTimer: number | undefined;
    const pingPicks = () => {
      if (!parseSleeperDraftId(location.href)) return;
      sendMessage({ type: 'draftrr:picks-changed' });
    };
    const schedulePickPing = () => {
      window.clearTimeout(pickTimer);
      pickTimer = window.setTimeout(pingPicks, 400);
    };

    const pickSig = () => {
      const nums = [...(document.body?.innerText ?? '').matchAll(/\bPick(?:\s*#)?\s*(\d+)/gi)].map(
        (m) => Number(m[1]),
      );
      return nums.length ? String(Math.max(...nums)) : '';
    };

    let observeTimer: number | undefined;
    const observer = new MutationObserver(() => {
      window.clearTimeout(observeTimer);
      observeTimer = window.setTimeout(() => {
        const sig = pickSig();
        if (!sig || sig === lastPickSig) return;
        lastPickSig = sig;
        schedulePickPing();
      }, 400);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if ((event.data as { type?: string })?.type === 'draftrr:sleeper-network-picks') {
        schedulePickPing();
      }
    });

    beat();
    ctx.setInterval(beat, 3000);
    ctx.onInvalidated(() => {
      hideBadge();
      observer.disconnect();
    });
  },
});
