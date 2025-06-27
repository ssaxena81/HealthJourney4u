
// [2024-08-01] COMMENT: This file has been converted to a server component to provide a more robust redirect mechanism.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
// [2024-08-01] COMMENT: This utility is used to verify the user's session cookie on the server.
import { getFirebaseUserFromCookie } from '@/lib/firebase/serverApp';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default async function RootPage() {
  // [2024-08-01] COMMENT: Check for the user's session cookie on the server.
  const user = await getFirebaseUserFromCookie(cookies());

  if (user) {
    // [2024-08-01] COMMENT: If a user session is found, redirect immediately to the dashboard. This server-side redirect is faster and more reliable than the previous client-side approach.
    redirect('/dashboard');
  }

  // [2024-08-01] COMMENT: The original client-side logic with useEffect and useRouter has been removed.
  /*
  'use client';

  import { useEffect } from 'react';
  import { useRouter } from 'next/navigation';
  import { useAuth } from '@/hooks/useAuth';
  import { Button } from '@/components/ui/button';
  import Link from 'next/link';

  export default function RootPage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (loading) {
        return; // Wait until loading is false
      }
      if (user) {
        router.replace('/dashboard');
      }
    }, [user, loading, router]);
    // This part is now handled server-side
    if (loading || user) {
      return (
        <div className="flex min-h-screen w-full items-center justify-center">
          <p>Loading...</p>
        </div>
      );
    }
  */

  // [2024-08-01] COMMENT: If no user session is found, render the public landing page for logged-out users.
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
