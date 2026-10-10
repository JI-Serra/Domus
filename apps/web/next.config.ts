import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@domus/domain',
    '@domus/ui-tokens',
    '@domus/supabase',
    '@domus/observability',
  ],
};
export default nextConfig;
