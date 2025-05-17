
import ForgotPasswordForm from '@/components/auth/forgot-password-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Forgot Your Password?</CardTitle>
        <CardDescription>
          Enter your email and we'll help you reset it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm />
        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="font-medium text-primary hover:underline">
            Back to Login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
