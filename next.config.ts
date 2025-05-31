
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    // ignoreBuildErrors: true, // We removed this temporarily for debugging
  },
  eslint: {
    // ignoreDuringBuilds: true, // We removed this temporarily for debugging
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  experimental: {
     allowedDevOrigins: [
         'http://localhost:9003', // Example: A local mobile app simulator or another dev server
  //       'https://my-other-dev-app.com', // Example: A specific cloud-based dev tool
  //       // Add more origins as needed
     ],
 },
};

export default nextConfig;
