
'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import AppLayoutClient from '@/components/layout/app-layout-client';
import { SidebarProvider } from '@/components/ui/sidebar';

export default function AuthenticatedAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, userProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (authLoading) {
      return; // Wait until authentication state is determined
    }

    if (!user) {
      // If not loading and no user, redirect to login
      router.replace('/login');
      return;
    }

    // If user is authenticated but profile is still loading, we can show a loader
    // This case is handled by the page-level check below for simplicity now.
    
    // If user is authenticated and on an auth page, redirect to dashboard
    if (pathname === '/login' || pathname === '/signup') {
        router.replace('/dashboard');
    }

  }, [user, authLoading, router, pathname]);

  if (authLoading || !user) {
    // Show a global loader while auth state is being confirmed or if there's no user yet (and redirect is pending)
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-foreground">Loading session...</p>
      </div>
    );
  }

  if (!userProfile) {
    // If the user is logged in but the profile hasn't loaded yet
     return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-foreground">Loading profile details...</p>
      </div>
    );
  }

  // If we have a user and their profile, render the main app layout
  return (
    <SidebarProvider>
      <AppLayoutClient>
        {children}
      </AppLayoutClient>
    </SidebarProvider>
  );
}
