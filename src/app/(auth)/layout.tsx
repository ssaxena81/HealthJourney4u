
import type { Metadata } from 'next';
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
  return (
    <>
      <div
        className="fixed inset-0 z-[-1] bg-cover bg-center"
        // IMPORTANT: Replace with your actual image path or keep the placeholder
        style={{ backgroundImage: "url('https://placehold.co/1920x1080.png')" }}
        data-ai-hint="health collage" 
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-background/70 backdrop-blur-sm"></div>
      </div>
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center p-4">
        {children}
      </div>
      <Toaster />
    </>
  );
}
