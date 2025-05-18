
import type { Metadata } from 'next';
import '../globals.css';
// import { Toaster } from "@/components/ui/toaster"; // Simplified

export const metadata: Metadata = {
  title: 'Authentication - Health Timeline (Simplified)',
  description: 'Sign up or log in to your Health Timeline account.',
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {/* <div
        className="fixed inset-0 z-[-1] bg-cover bg-center"
        style={{ backgroundImage: "url('/images/your-actual-login-background.jpg')" }}
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-background/70 backdrop-blur-sm"></div>
      </div> */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center p-4">
        <h2>Auth Layout Placeholder</h2>
        {children}
      </div>
      {/* <Toaster /> */}
    </>
  );
}
