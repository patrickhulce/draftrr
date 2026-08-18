import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const root = path.dirname(fileURLToPath(import.meta.url));

const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  allowedDevOrigins: ['127.0.0.1'],
  webpack: (webpackConfig) => {
    webpackConfig.resolve.alias = {
      ...webpackConfig.resolve.alias,
      '@draftrr/core': path.resolve(root, '../../packages/core/dist/index.js'),
    };
    return webpackConfig;
  },
};

export default config;
