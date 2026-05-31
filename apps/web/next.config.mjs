/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages ship as TS source; Next must transpile them.
  transpilePackages: ['@smart-dining/core', '@smart-dining/shared'],
  // Resolve ESM-correct `.js` imports inside our TS workspace packages back
  // to their `.ts` source. TypeScript with `moduleResolution: "Bundler"` does
  // this natively; webpack doesn't, hence the explicit alias.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };
    return config;
  },
  experimental: {
    // Prisma + pino don't bundle cleanly; treat as Node externals on the
    // server side. (Top-level `serverExternalPackages` is Next 15 only —
    // we're on 14.2 which exposes this only under `experimental`.)
    serverComponentsExternalPackages: ['@prisma/client', '.prisma/client', 'pino', 'pino-pretty'],
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

  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
  transpilePackages: ["@smart-dining/core"],
  // 2. Tell the Next.js bundler to strictly include the Prisma engine binaries
  serverExternalPackages: ["@prisma/client", "prisma"],
  experimental: {
    // Fallback just in case you are on an older Next.js 13 version
    serverComponentsExternalPackages: ["@prisma/client", "prisma"],
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
