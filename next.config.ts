
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
  serverExternalPackages: ['@grpc/grpc-js'], // Keep gRPC external
  transpilePackages: ['firebase'], // Transpile only the main firebase package
  experimental: {
    allowedDevOrigins: ['http://9004-firebase-studio-1747406301563.cluster-f4iwdviaqvc2ct6pgytzw4xqy4.cloudworkstations.dev'],
  },
};

export default nextConfig;
