
import ResetPasswordForm from '@/components/auth/reset-password-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

// This page is for the final step of "Forgot Password" after code/token verification,
// OR for when a user is forced to reset their password due to expiry.
// It needs a way to know the context (e.g. a query param with a reset token, or if user is logged in for forced reset)

export default function ResetPasswordPage() {
  // TODO: Handle oobCode from Firebase email link if that's the chosen method
  // const searchParams = useSearchParams();
  // const oobCode = searchParams.get('oobCode');

  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Reset Your Password</CardTitle>
        <CardDescription>
          Enter your new password below.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Pass oobCode or other context if needed */}
        <ResetPasswordForm oobCode={null} /> 
        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="font-medium text-primary hover:underline">
            Back to Login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
