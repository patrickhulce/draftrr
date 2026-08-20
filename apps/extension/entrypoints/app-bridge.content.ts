import { WIRE_MSG, isDraftSnapshot, isLinkStatus } from '@draftrr/wire';
import { onRuntimeMessage, sendMessage } from '~/lib/runtime';

const PAGE_TO_BG = new Set<string>([
  WIRE_MSG.hello,
  WIRE_MSG.connect,
  WIRE_MSG.refresh,
  WIRE_MSG.disconnect,
]);

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
        draftKey: el.dataset.draftrrDraftKey ?? '',
        phase: el.dataset.draftrrPhase ?? '',
        pageExt: el.dataset.draftrrExt ?? '',
        pageLinked: el.dataset.draftrrLinked ?? '',
        pageStatusAt: el.dataset.draftrrStatusAt ?? '',
      };
    };

    const beat = () => {
      sendMessage({ type: 'draftrr:app-heartbeat', page: pageState() }, (res) => {
        if (!res || typeof res !== 'object') {
          post({ type: WIRE_MSG.link });
          return;
        }
        const data = res as { link?: unknown; snapshot?: unknown };
        if (isLinkStatus(data.link)) post({ type: WIRE_MSG.link, status: data.link });
        if (isDraftSnapshot(data.snapshot))
          post({ type: WIRE_MSG.snapshot, snapshot: data.snapshot });
      });
    };

    onRuntimeMessage((message) => {
      if (message.type === WIRE_MSG.link) post({ type: WIRE_MSG.link, status: message.status });
      if (message.type === WIRE_MSG.snapshot) {
        post({ type: WIRE_MSG.snapshot, snapshot: message.snapshot });
      }
    });

    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string };
      if (!data?.type || !PAGE_TO_BG.has(data.type)) return;
      if (data.type === WIRE_MSG.hello) {
        beat();
        return;
      }
      sendMessage(data, () => {
        beat();
      });
    });

    beat();
    ctx.setInterval(beat, 3000);
  },
});
