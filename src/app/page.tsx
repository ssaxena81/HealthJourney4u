
// 'use client'; // Simplified - no client logic needed for placeholder

// import { useEffect } from 'react';
// import { useRouter } from 'next/navigation';
// import { useAuth } from '@/hooks/useAuth';
// import { Loader2 } from 'lucide-react';

export default function RootPage() {
  // const { user, loading: authLoading, userProfile, loading: profileLoading } = useAuth();
  // const router = useRouter();

  // const isLoading = authLoading || profileLoading;

  // useEffect(() => {
  //   if (!isLoading) {
  //     if (user && userProfile) {
  //       router.replace('/dashboard');
  //     } else if (user && !userProfile && !profileLoading) {
  //       router.replace('/dashboard');
  //     } else if (!user && !authLoading) {
  //       router.replace('/login');
  //     }
  //   }
  // }, [user, userProfile, isLoading, authLoading, profileLoading, router]);

  return (
    <div>
      <h1>Hello World - Root Page Placeholder</h1>
      <p>If you see this, the basic Next.js app is rendering.</p>
      <p><a href="/login">Go to Login Placeholder</a></p>
      <p><a href="/dashboard">Go to Dashboard Placeholder</a></p>
    </div>
  );
}
