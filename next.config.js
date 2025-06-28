

/** @type {import('next').NextConfig} */
const nextConfig = {
  // [2025-06-28] COMMENT: Re-enabling the rewrites function. This is the most robust way to solve the redirect_uri mismatch by explicitly mapping the public-facing callback URL (`/api/auth/callback/fitbit`) that Fitbit expects to the application's internal file path.
  async rewrites() {
    return [
      {
        source: '/api/auth/callback/fitbit',
        destination: '/api/auth/fitbit/callback',
      },
    ]
  },
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
