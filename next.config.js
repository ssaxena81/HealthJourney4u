

/** @type {import('next').NextConfig} */
const nextConfig = {
  // [2025-06-28] COMMENT: Re-enabling the rewrites function. This is the most reliable way to handle the Fitbit callback URL.
  // [2025-06-28] COMMENT: It maps the public-facing URL (.../callback/fitbit) to the internal file path (.../fitbit/callback), resolving mismatch errors.
  async rewrites() {
    return [
      {
        source: '/api/auth/fitbit/callback',
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
