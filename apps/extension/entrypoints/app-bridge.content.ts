import { onRuntimeMessage, sendMessage } from '~/lib/runtime';

export default defineContentScript({
  matches: ['http://localhost/*', 'https://localhost/*', 'https://*.draftrr.app/*'],
  runAt: 'document_start',
  main(ctx) {
    (window as Window & { __draftrrExtension?: boolean }).__draftrrExtension = true;

    const post = (data: Record<string, unknown>) => {
      window.postMessage({ ...data }, window.location.origin);
    };

    const beat = () => {
      sendMessage({ type: 'draftrr:app-heartbeat' }, (res) => {
        if (!res || typeof res !== 'object') return;
        post({ type: 'draftrr:status', ...(res as Record<string, unknown>) });
      });
    };

    onRuntimeMessage((message) => {
      if (message.type === 'draftrr:status') post({ type: 'draftrr:status', ...message });
      if (message.type === 'draftrr:refresh-picks') post({ type: 'draftrr:refresh-picks' });
    });

    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string };
      if (data?.type === 'draftrr:hello') beat();
    });

    beat();
    ctx.setInterval(beat, 3000);
  },
});
