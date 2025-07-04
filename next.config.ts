import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Performance optimizations
  experimental: {
    optimizePackageImports: [
      'react-icons/lu',
      'react-icons/si', 
      'react-icons/fa',
      'react-icons/md',
      'react-icons/hi',
      'lucide-react',
      '@radix-ui/react-*'
    ],
    webpackBuildWorker: true,
    parallelServerBuildTraces: true
  },
  webpack: (config, { dev, isServer }) => {
    // Optimize bundle for production
    if (!dev && !isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        // Optimize react-icons to only import what's needed
        'react-icons/lu': 'react-icons/lu/index.esm.js',
        'react-icons/si': 'react-icons/si/index.esm.js',
        'react-icons/fa': 'react-icons/fa/index.esm.js'
      };
    }

    // Bundle analyzer (when ANALYZE=true)
    if (process.env.ANALYZE === 'true') {
      const BundleAnalyzerPlugin = require('@next/bundle-analyzer')({
        enabled: true
      });
      config.plugins.push(BundleAnalyzerPlugin);
    }

    return config;
  },
  // Enable static optimization
  trailingSlash: false,
  // Image optimization
  images: {
    domains: [],
    formats: ['image/webp', 'image/avif'],
  },
  // Compression
  compress: true,
  // Headers for better caching
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ];
  },
};

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
});

export default withSerwist(nextConfig);
