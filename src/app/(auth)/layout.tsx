
import type { Metadata } from 'next';
// Removed GeistSans and GeistMono imports as they are handled in the root layout
import '../globals.css';
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: 'Authentication - Health Timeline',
  description: 'Sign up or log in to your Health Timeline account.',
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The <html> and <body> tags are removed from here.
  // The root layout (src/app/layout.tsx) handles these.
  return (
    <>
      <div
        className="fixed inset-0 z-[-1] bg-cover bg-center"
        style={{ backgroundImage: "url('/images/your-actual-login-background.jpg')" }} /* YOU WILL NEED TO CHANGE THIS PATH */
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-background/70 backdrop-blur-sm"></div> {/* Overlay for readability */}
      </div>
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center p-4">
        {children}
      </div>
      <Toaster />
    </>
  );
}
