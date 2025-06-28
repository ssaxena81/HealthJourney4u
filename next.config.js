

/** @type {import('next').NextConfig} */
const nextConfig = {
  // [2025-06-28] COMMENT: Reverting to hardcoded URLs. The rewrites function is being disabled as it was part of the dynamic URL strategy that caused issues.
  /*
  async rewrites() {
    return [
      {
        source: '/api/auth/callback/fitbit',
        destination: '/api/auth/fitbit/callback',
      },
    ]
  },
  */
  typescript: {
    // ignoreBuildErrors: true, // Temporarily removed to surface potential issues
  },
  eslint: {
    // ignoreDuringBuilds: true, // Temporarily removed to surface potential issues
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      // Add other image source hostnames here if needed
    ],
  },
};

module.exports = nextConfig;
