
'use client';

import ChangePasswordForm from '@/components/profile/change-password-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

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
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // A forced password reset for a logged-in user is effectively just changing their password.
  // We can re-use the ChangePasswordForm component for this.
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="text-center">
            <CardTitle className="text-2xl">Password Update Required</CardTitle>
            <CardDescription>
              For your security, your password needs to be updated. Please create a new one.
            </CardDescription>
        </CardHeader>
        <CardContent>
            <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
