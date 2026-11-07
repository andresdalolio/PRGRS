import type { NextConfig } from 'next';
import { randomUUID } from 'node:crypto';
import { publicConfiguration } from './src/lib/config';
const release = randomUUID();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const configuration = publicConfiguration(url, key);
if (
  configuration.error &&
  (process.env.VERCEL === '1' ||
    ((url || key) && !((!url || /YOUR_PROJECT/.test(url)) && (!key || /YOUR_PUBLIC/.test(key)))))
)
  throw new Error(configuration.error);
const config: NextConfig = {
  generateBuildId: async () => release,
  env: { NEXT_PUBLIC_RELEASE_ID: release },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },
};
export default config;
