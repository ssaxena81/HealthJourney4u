
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// This page is deprecated and redirects to the new authenticated root page.
export default function DeprecatedDashboardPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/'); // Redirect to the new authenticated root page
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <p>Redirecting to dashboard...</p>
    </div>
  );
}
