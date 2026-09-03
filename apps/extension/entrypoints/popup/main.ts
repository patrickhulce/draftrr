import type { DraftSnapshot, LinkStatus } from '@draftrr/wire';
import { providerForUrl } from '~/lib/providers';

const statusEl = document.getElementById('status');
const openEl = document.getElementById('open') as HTMLAnchorElement | null;
const activateEl = document.getElementById('activate') as HTMLButtonElement | null;
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
  activeTabId?: number | null;
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

type CurrentDraft = {
  tabId: number;
  providerId: string;
  draftId: string;
  draftName: string | null;
};

let currentDraft: CurrentDraft | null = null;

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
  thisTabActive: boolean;
  onDraftPage: boolean;
  name: string | null;
  key: string | null;
  appLive: boolean;
  debug: DebugStatus;
}) {
  if (dotEl) dotEl.style.background = opts.live ? '#34d399' : '#f43f5e';
  if (statusEl) {
    statusEl.textContent = opts.live
      ? (opts.name ?? opts.key ?? 'Draft connected')
      : opts.thisTabActive
        ? opts.debug.link?.state === 'connecting'
          ? 'Connecting…'
          : (opts.name ?? opts.key ?? 'Draft connected')
        : opts.onDraftPage
          ? 'This draft is idle'
          : opts.appLive
            ? 'Draft page not open'
            : 'Activate a draft tab';
  }
  if (openEl && opts.key) {
    openEl.href = `http://localhost:3000/draft/?connect=${encodeURIComponent(opts.key)}`;
  }
  if (activateEl) {
    const show = opts.onDraftPage;
    activateEl.classList.toggle('visible', show);
    activateEl.classList.toggle('stop', opts.thisTabActive);
    activateEl.textContent = opts.thisTabActive ? 'Stop' : 'Activate';
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
    const tab = tabs[0];
    const tabUrl = tab?.url ?? tab?.pendingUrl ?? '';
    const provider = providerForUrl(tabUrl);
    const draftId = provider?.parseDraftId(tabUrl) ?? null;
    const tabName = provider?.draftNameFromTitle(tab?.title ?? '') ?? null;
    currentDraft =
      tab?.id != null && provider && draftId
        ? { tabId: tab.id, providerId: provider.id, draftId, draftName: tabName }
        : null;
    chrome.runtime.sendMessage({ type: 'draftrr:get-draft' }, (res: DebugStatus | undefined) => {
      const debug = res ?? {};
      const key =
        debug.link?.draftKey ?? (provider && draftId ? `${provider.id}:${draftId}` : null);
      const thisTabActive = Boolean(
        currentDraft && debug.activeTabId != null && debug.activeTabId === currentDraft.tabId,
      );
      const live = thisTabActive && debug.link?.state === 'linked';
      const appLive = Boolean(debug.appSeenAt && Date.now() - debug.appSeenAt < 8000);
      render({
        live,
        thisTabActive,
        onDraftPage: Boolean(currentDraft),
        key,
        name: tabName ?? debug.snapshot?.draftName ?? debug.link?.draftName ?? null,
        appLive,
        debug,
      });
    });
  });
}

activateEl?.addEventListener('click', () => {
  if (!currentDraft) return;
  const stopping = activateEl.classList.contains('stop');
  chrome.runtime.sendMessage(
    {
      type: stopping ? 'draftrr:deactivate' : 'draftrr:activate',
      tabId: currentDraft.tabId,
      provider: currentDraft.providerId,
      draftId: currentDraft.draftId,
      draftName: currentDraft.draftName,
    },
    () => refresh(),
  );
});

refresh();
window.setInterval(refresh, 1000);
