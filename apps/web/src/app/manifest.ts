import type { MetadataRoute } from 'next';

/**
 * Web app manifest (installable PWA). Icons are generated from the emblem by `pnpm brand:build`. The theme color is
 * the ink of the brand; the app itself follows the user's light/dark preference.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Domus',
    short_name: 'Domus',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1d1d1f',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
