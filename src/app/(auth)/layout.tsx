
import type { Metadata } from 'next';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Authentication - Health Timeline',
  description: 'Sign up or log in to your Health Timeline account.',
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center p-4 bg-background">
        {children}
      </div>
    </>
  );
}
