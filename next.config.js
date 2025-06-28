

/** @type {import('next').NextConfig} */
const nextConfig = {
  // [2024-08-06] COMMENT: The rewrites function is no longer necessary as the generated Fitbit callback URL now directly matches the application's file structure. This is being commented out to prevent conflicts.
  /*
  // [2024-08-05] COMMENT: Added async rewrites to handle the Fitbit callback URL mismatch.
  // [2024-08-05] COMMENT: This internally maps the URL Fitbit expects to the actual file path in the application.
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
