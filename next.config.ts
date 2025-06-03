
/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    // ignoreBuildErrors: true, // Temporarily removed to surface potential issues
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
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
  experimental: {
    // This is to allow the Next.js dev server to be accessed from a different origin,
    // which can happen in some development environments (like IDX/Project IDX).
    // allowedDevOrigins: [  // Commented out as it's causing a config error
    //     'http://localhost:9003', // Matches your package.json dev script port
    // ],
  },
};

export default nextConfig;
