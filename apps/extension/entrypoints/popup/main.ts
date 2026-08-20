import type { DraftSnapshot, LinkStatus } from '@draftrr/wire';
import { providerForUrl } from '~/lib/providers';

const statusEl = document.getElementById('status');
const openEl = document.getElementById('open') as HTMLAnchorElement | null;
const dotEl = document.getElementById('dot');
const pageEl = document.getElementById('page');
const beatsEl = document.getElementById('beats');

type DebugStatus = {
  link?: LinkStatus;
  snapshot?: DraftSnapshot | null;
  providerId?: string | null;
  providerSeenAt?: number;
  appSeenAt?: number;
  lastFetchAt?: number;
  lastFetchKind?: string | null;
  lastFetchResult?: string | null;
  lastBoardName?: string | null;
  lastBoardCount?: number | null;
  page?: {
    href?: string;
    picks?: string;
    draftKey?: string;
    phase?: string;
    pageExt?: string;
    pageLinked?: string;
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
  key: string | null;
  appLive: boolean;
  debug: DebugStatus;
}) {
  if (dotEl) dotEl.style.background = opts.live ? '#34d399' : '#f43f5e';
  if (statusEl) {
    statusEl.textContent = opts.live
      ? (opts.name ?? opts.key ?? 'Draft connected')
      : opts.appLive
        ? 'Draft page not open'
        : 'No draft connected';
  }
  if (openEl && opts.key) {
    openEl.href = `http://localhost:3000/draft/?connect=${encodeURIComponent(opts.key)}`;
  }
  const page = opts.debug.page ?? {};
  if (pageEl) {
    pageEl.innerHTML = rows([
      ['url', pathOf(page.href)],
      ['picks', page.picks ?? String(opts.debug.snapshot?.drafted.length ?? '')],
      ['draft key', page.draftKey || opts.key || ''],
      ['phase', page.phase || opts.debug.snapshot?.phase || ''],
      ['page sees ext', page.pageExt === '1' ? 'yes' : page.pageExt === '0' ? 'no' : ''],
      ['page sees live', page.pageLinked === '1' ? 'yes' : page.pageLinked === '0' ? 'no' : ''],
      ['page last status', ago(page.pageStatusAt ? Number(page.pageStatusAt) : undefined)],
    ]);
  }
  if (beatsEl) {
    beatsEl.innerHTML = rows([
      [
        'provider beat',
        `${opts.debug.link?.state === 'linked' ? 'live' : (opts.debug.link?.state ?? 'idle')} · ${ago(opts.debug.providerSeenAt)}`,
      ],
      ['app beat', `${opts.appLive ? 'live' : 'stale'} · ${ago(opts.debug.appSeenAt)}`],
      [
        'board',
        opts.debug.lastBoardCount != null
          ? `${opts.debug.lastBoardCount} picks${opts.debug.lastBoardName ? ` · ${opts.debug.lastBoardName}` : ''}`
          : opts.debug.snapshot
            ? `${opts.debug.snapshot.drafted.length} picks`
            : '—',
      ],
      [
        'last fetch',
        opts.debug.lastFetchResult
          ? `${opts.debug.lastFetchKind ?? ''} ${opts.debug.lastFetchResult} · ${ago(opts.debug.lastFetchAt)}`
          : 'never',
      ],
    ]);
  }
}

function refresh() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabUrl = tabs[0]?.url ?? '';
    const provider = providerForUrl(tabUrl);
    const tabId = provider?.parseDraftId(tabUrl) ?? null;
    const tabName = provider?.draftNameFromTitle(tabs[0]?.title ?? '') ?? null;
    chrome.runtime.sendMessage({ type: 'draftrr:get-draft' }, (res: DebugStatus | undefined) => {
      const debug = res ?? {};
      const key = debug.link?.draftKey ?? (provider && tabId ? `${provider.id}:${tabId}` : null);
      const live = Boolean(tabId || debug.link?.state === 'linked');
      const appLive = Boolean(debug.appSeenAt && Date.now() - debug.appSeenAt < 8000);
      render({
        live,
        key,
        name: tabName ?? debug.snapshot?.draftName ?? debug.link?.draftName ?? null,
        appLive,
        debug,
      });
    });
  });
}

refresh();
window.setInterval(refresh, 1000);
