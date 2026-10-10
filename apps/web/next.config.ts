import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * next-intl needs `next-intl/config` to resolve to the request config (`src/i18n/request.ts`). That is all the
 * `next-intl/plugin` helper does for us (we use none of its extractor features), but the helper loads `@swc/core`
 * at import time, and that native binding refuses to start on machines where a parent of
 * `%LOCALAPPDATA%\swc` grants write access to another account (the Codex sandbox does). Declaring the alias
 * directly keeps `next dev|build|typegen` independent from it. Switch back to `createNextIntlPlugin()` if the
 * extractor is ever adopted.
 */
const I18N_REQUEST_CONFIG = './src/i18n/request.ts';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@domus/domain',
    '@domus/ui-tokens',
    '@domus/supabase',
    '@domus/observability',
  ],
  turbopack: { resolveAlias: { 'next-intl/config': I18N_REQUEST_CONFIG } },
  webpack(config) {
    config.resolve ??= {};
    config.resolve.alias = {
      ...config.resolve.alias,
      'next-intl/config': path.resolve(
        config.context ?? process.cwd(),
        I18N_REQUEST_CONFIG,
      ),
    };
    return config;
  },
};
export default nextConfig;
