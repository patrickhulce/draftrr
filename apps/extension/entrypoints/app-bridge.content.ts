import { onRuntimeMessage, sendMessage } from '~/lib/runtime';

export default defineContentScript({
  matches: [
    'http://localhost/*',
    'https://localhost/*',
    'http://127.0.0.1/*',
    'https://127.0.0.1/*',
    'https://draftrr.app/*',
    'https://*.draftrr.app/*',
  ],
  runAt: 'document_start',
  main(ctx) {
    document.documentElement.dataset.draftrrExtension = '1';
    (window as Window & { __draftrrExtension?: boolean }).__draftrrExtension = true;

    const post = (data: Record<string, unknown>) => {
      window.postMessage({ ...data }, '*');
    };

    const pageState = () => {
      const el = document.documentElement;
      return {
        href: location.href,
        picks: el.dataset.draftrrPicks ?? '',
        sleeperStatus: el.dataset.draftrrSleeperStatus ?? '',
        sleeperId: el.dataset.draftrrSleeperId ?? '',
        pageExt: el.dataset.draftrrExt ?? '',
        pageLive: el.dataset.draftrrLive ?? '',
        pageStatusAt: el.dataset.draftrrStatusAt ?? '',
      };
    };

    const beat = () => {
      sendMessage({ type: 'draftrr:app-heartbeat', page: pageState() }, (res) => {
        if (!res || typeof res !== 'object') {
          post({ type: 'draftrr:status' });
          return;
        }
        const data = res as Record<string, unknown>;
        const pendingPicks = data.pendingPicks;
        const status = { ...data };
        delete status.pendingPicks;
        post({ type: 'draftrr:status', ...status });
        if (pendingPicks && typeof pendingPicks === 'object') {
          post(pendingPicks as Record<string, unknown>);
        }
      });
    };

    onRuntimeMessage((message) => {
      if (message.type === 'draftrr:status') post({ type: 'draftrr:status', ...message });
      if (message.type === 'draftrr:refresh-picks') post({ type: 'draftrr:refresh-picks' });
      if (message.type === 'draftrr:picks-payload') {
        post({
          type: 'draftrr:picks-payload',
          draftId: message.draftId,
          picks: message.picks,
        });
      }
    });

    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string };
      if (data?.type === 'draftrr:hello') beat();
    });

    post({ type: 'draftrr:status' });
    beat();
    ctx.setInterval(beat, 3000);
  },
});
