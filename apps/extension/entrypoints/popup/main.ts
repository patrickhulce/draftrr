import { parseSleeperDraftId } from '~/lib/draftId';

const statusEl = document.getElementById('status');
const openEl = document.getElementById('open') as HTMLAnchorElement | null;
const dotEl = document.getElementById('dot');

function render(opts: { live: boolean; name: string | null; id: string | null; appLive: boolean }) {
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
}

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tabId = parseSleeperDraftId(tabs[0]?.url ?? '');
  const tabName = (tabs[0]?.title ?? '').replace(/\s*[|\-–•]\s*Sleeper.*$/i, '').trim();
  chrome.runtime.sendMessage({ type: 'draftrr:get-draft' }, (res) => {
    const id = tabId ?? (res?.draftId as string | null) ?? null;
    const live = Boolean(tabId || (res?.sleeperLive && id));
    render({
      live,
      id,
      name:
        (tabId && tabName && tabName.toLowerCase() !== 'sleeper' ? tabName : null) ??
        (res?.draftName as string | null) ??
        null,
      appLive: Boolean(res?.appLive),
    });
  });
});
