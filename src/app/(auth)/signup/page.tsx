
// import SignUpFlow from '@/components/auth/signup-flow';
// import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
// import Link from 'next/link';

export default function SignUpPage() {
  return (
    <div>
      <h1>Sign Up Page (Minimal)</h1>
      <p>If you see this, the basic page chunk loaded.</p>
      {/*
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Create an Account</CardTitle>
          <CardDescription>
            Start your journey with Health Timeline.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignUpFlow />
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
      */}
    </div>
  );
}
