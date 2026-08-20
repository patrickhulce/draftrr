import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: '.',
  entrypointsDir: 'entrypoints',
  outDir: 'dist',
  manifest: {
    name: 'draftrr',
    description: 'Mirror a live draft into draftrr',
    version: '0.0.1',
    permissions: ['storage', 'tabs'],
    host_permissions: [
      'https://sleeper.com/*',
      'https://*.sleeper.com/*',
      'https://sleeper.app/*',
      'https://*.sleeper.app/*',
      'https://api.sleeper.app/*',
    ],
    action: { default_title: 'draftrr' },
  },
});
