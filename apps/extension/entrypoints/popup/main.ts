import { parseSleeperDraftId } from '~/lib/draftId';

const statusEl = document.getElementById('status');
const openEl = document.getElementById('open') as HTMLAnchorElement | null;
const dotEl = document.getElementById('dot');
const pageEl = document.getElementById('page');
const beatsEl = document.getElementById('beats');

type DebugStatus = {
  draftId?: string | null;
  draftName?: string | null;
  sleeperLive?: boolean;
  appLive?: boolean;
  sleeperSeenAt?: number;
  appSeenAt?: number;
  lastPickAt?: number;
  lastPickKind?: string | null;
  lastFlushAt?: number;
  lastFlushResult?: string | null;
  lastFlushKind?: string | null;
  lastPayloadCount?: number | null;
  lastBoardName?: string | null;
  page?: {
    href?: string;
    picks?: string;
    sleeperStatus?: string;
    sleeperId?: string;
    pageExt?: string;
    pageLive?: string;
    pageStatusAt?: string;
  } | null;
};

function ago(ts: number | undefined): string {
  if (!ts) return 'never';
  const ms = Date.now() - ts;
  if (ms < 1000) return 'just now';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  return `${Math.round(ms / 60_000)}m ago`;
}

function pathOf(href: string | undefined): string {
  if (!href) return '—';
  try {
    const url = new URL(href);
    return url.pathname + url.search;
  } catch {
    return href;
  }
}

function rows(items: [string, string][]): string {
  return items
    .map(([label, value]) => `<div class="row"><span>${label}</span><b>${value || '—'}</b></div>`)
    .join('');
}

function render(opts: {
  live: boolean;
  name: string | null;
  id: string | null;
  appLive: boolean;
  debug: DebugStatus;
}) {
  if (dotEl) dotEl.style.background = opts.live ? '#34d399' : '#f43f5e';
  if (statusEl) {
    statusEl.textContent = opts.live
      ? (opts.name ?? `Sleeper ${opts.id}`)
      : opts.appLive
        ? 'Sleeper draft page not open'
        : 'No live Sleeper draft';
  }
  if (openEl && opts.id) {
    openEl.href = `http://localhost:3000/draft/?sleeper=${opts.id}`;
  }
  const page = opts.debug.page ?? {};
  if (pageEl) {
    pageEl.innerHTML = rows([
      ['url', pathOf(page.href)],
      ['picks', page.picks ?? ''],
      ['sleeper status', page.sleeperStatus ?? ''],
      ['sleeper id', page.sleeperId || opts.debug.draftId || ''],
      ['page sees ext', page.pageExt === '1' ? 'yes' : page.pageExt === '0' ? 'no' : ''],
      ['page sees live', page.pageLive === '1' ? 'yes' : page.pageLive === '0' ? 'no' : ''],
      ['page last status', ago(page.pageStatusAt ? Number(page.pageStatusAt) : undefined)],
    ]);
  }
  if (beatsEl) {
    beatsEl.innerHTML = rows([
      [
        'sleeper beat',
        `${opts.debug.sleeperLive ? 'live' : 'stale'} · ${ago(opts.debug.sleeperSeenAt)}`,
      ],
      ['app beat', `${opts.debug.appLive ? 'live' : 'stale'} · ${ago(opts.debug.appSeenAt)}`],
      [
        'sleeper board',
        opts.debug.lastPayloadCount != null
          ? `${opts.debug.lastPayloadCount} picks${opts.debug.lastBoardName ? ` · ${opts.debug.lastBoardName}` : ''}`
          : '—',
      ],
      [
        'last pick ping',
        opts.debug.lastPickKind
          ? `${opts.debug.lastPickKind} · ${ago(opts.debug.lastPickAt)}`
          : 'never',
      ],
      [
        'last flush',
        opts.debug.lastFlushResult
          ? `${opts.debug.lastFlushKind ?? ''} ${opts.debug.lastFlushResult} · ${ago(opts.debug.lastFlushAt)}`
          : 'never',
      ],
    ]);
  }
}

function refresh() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = parseSleeperDraftId(tabs[0]?.url ?? '');
    const tabName = (tabs[0]?.title ?? '').replace(/\s*[|\-–•]\s*Sleeper.*$/i, '').trim();
    chrome.runtime.sendMessage({ type: 'draftrr:get-draft' }, (res: DebugStatus | undefined) => {
      const debug = res ?? {};
      const id = tabId ?? debug.draftId ?? null;
      const live = Boolean(tabId || (debug.sleeperLive && id));
      render({
        live,
        id,
        name:
          (tabId && tabName && tabName.toLowerCase() !== 'sleeper' ? tabName : null) ??
          debug.draftName ??
          null,
        appLive: Boolean(debug.appLive),
        debug,
      });
    });
  });
}

refresh();
window.setInterval(refresh, 1000);
