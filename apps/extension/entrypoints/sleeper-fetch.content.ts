export default defineContentScript({
  matches: [
    'https://sleeper.com/*',
    'https://*.sleeper.com/*',
    'https://sleeper.app/*',
    'https://*.sleeper.app/*',
  ],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    const orig = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const result = orig(input, init);
      if (/api\.sleeper\.app\/v1\/draft\/[^/]+\/picks/.test(url)) {
        void Promise.resolve(result).then(() => {
          window.postMessage({ type: 'draftrr:sleeper-network-picks' }, '*');
        });
      }
      return result;
    };
  },
});
