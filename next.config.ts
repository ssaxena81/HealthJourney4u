
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
   typescript: {
     ignoreBuildErrors: true,
   },
   eslint: {
     ignoreDuringBuilds: true,
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
          'http://localhost:9003', // Changed port to match package.json
      ],
  },
};

export default nextConfig;
