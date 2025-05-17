
'use client';

import ResetPasswordForm from '@/components/auth/reset-password-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ResetPasswordRequiredPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      // If somehow user is not logged in but reaches here, redirect to login
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
            <CardTitle className="text-2xl">Password Expired</CardTitle>
            <CardDescription>
            For your security, your password has expired. Please create a new one.
            </CardDescription>
        </CardHeader>
        <CardContent>
            {/* This form assumes the user is logged in for a forced reset */}
            <ResetPasswordForm isForcedReset={true} />
        </CardContent>
        </Card>
    </div>
  );
}
