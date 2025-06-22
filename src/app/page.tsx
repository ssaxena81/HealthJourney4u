'use client';

// Added on 2024-07-26 18:31:00 to handle intelligent routing from the root page.
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function RootPage() {
  // Added on 2024-07-26 18:31:00: Get user and loading state from the authentication context.
  const { user, loading } = useAuth();
  const router = useRouter();

  // Added on 2024-07-26 18:31:00: This effect redirects logged-in users to the dashboard.
  useEffect(() => {
    // If auth state is resolved and we have a user, redirect to dashboard.
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  // Added on 2024-07-26 18:31:00: Show a loader while checking auth state or if redirect is pending.
  if (loading || user) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-foreground">Loading...</p>
      </div>
    );
  }
  
  // Added on 2024-07-26 18:31:00: Render the public landing page only if the user is confirmed to be logged out.
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-8 text-center">
        <h1 className="text-4xl font-bold text-primary mb-4">Welcome to Health Timeline</h1>
        <p className="text-lg text-muted-foreground mb-8">
            Your personal health journey, visualized.
        </p>
        <div className="flex gap-4">
            <Button asChild>
                <Link href="/login">Log In</Link>
            </Button>
            <Button variant="outline" asChild>
                <Link href="/signup">Sign Up</Link>
            </Button>
        </div>
    </div>
  );
}
