
import LoginForm from '@/components/auth/login-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function LoginPage() {
  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Welcome Back!</CardTitle>
        <CardDescription>
          Log in to your Health Timeline account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
        <div className="mt-6 flex justify-between text-sm">
          <Link href="/forgot-password" passHref legacyBehavior>
            <a className="font-medium text-primary hover:underline">Forgot my password</a>
          </Link>
          <Link href="/signup" passHref legacyBehavior>
            <a className="font-medium text-primary hover:underline">Register: New User</a>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
