
'use client'; // Add this because Suspense usage with client components often implies client-side rendering strategy for the part that suspends.

import React, { Suspense } from 'react'; // Import Suspense
import ResetPasswordForm from '@/components/auth/reset-password-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Loader2 } from 'lucide-react'; // For a loading fallback

// This page is for the final step of "Forgot Password" after code/token verification,
// OR for when a user is forced to reset their password due to expiry.
// It needs a way to know the context (e.g. a query param with a reset token, or if user is logged in for forced reset)

function ResetPasswordContent() {
  // The component using useSearchParams (ResetPasswordForm) is rendered here
  return <ResetPasswordForm oobCode={null} />;
}

export default function ResetPasswordPage() {
  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Reset Your Password</CardTitle>
        <CardDescription>
          Enter your new password below.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={
          <div className="flex flex-col items-center justify-center space-y-2 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading form...</p>
          </div>
        }>
          <ResetPasswordContent />
        </Suspense>
        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="font-medium text-primary hover:underline">
            Back to Login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
