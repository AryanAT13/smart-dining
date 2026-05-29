/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages ship as TS source; Next must transpile them.
  transpilePackages: ['@smart-dining/core', '@smart-dining/shared'],
  // The Recommendation Agent imports prisma; let Next leave it as a real
  // server-side module instead of bundling.
  serverExternalPackages: ['@prisma/client', '.prisma/client', 'pino', 'pino-pretty'],
  experimental: {
    // Required because @smart-dining/core uses Prisma which doesn't bundle well.
    serverComponentsExternalPackages: ['@prisma/client', '.prisma/client'],
  },
  images: {
    remotePatterns: [
      // Cloudflare R2 (prod menu images)
      { protocol: 'https', hostname: '*.r2.dev' },
      // Custom R2 domain
      { protocol: 'https', hostname: '*.smart-dining.app' },
      // localhost during dev
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
  // PWA-style headers — service worker + manifest are public; everything else
  // is HTML/JS that Next handles.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=3600' }],
      },
    ];
  },
};

export default nextConfig;
