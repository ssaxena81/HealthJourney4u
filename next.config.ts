
/** @type {import('next').NextConfig} */
const nextConfig = {
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
  experimental: {
    // allowedDevOrigins removed
  },
  transpilePackages: ['firebase', '@firebase/auth', '@firebase/firestore', '@grpc/grpc-js'],
};

export default nextConfig;
