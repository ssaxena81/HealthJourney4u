
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

// This component acts as a client-side redirect to resolve a routing conflict.
// If an authenticated user ever lands on the root path ('/'), which this file handles
// within the (app) route group, it will immediately redirect them to the dashboard.
export default function AuthenticatedRootRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  // Show a loading state while the redirect is happening.
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="ml-4 text-lg text-foreground">Redirecting...</p>
    </div>
  );
}
