
import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { AuthProvider } from '@/hooks/useAuth';
import { Toaster } from "@/components/ui/toaster";
import CookieConsentBanner from '@/components/ui/cookie-consent-banner'; // Added import

export const metadata: Metadata = {
  title: 'Health Timeline',
  description: 'Track your health history with Health Timeline.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className={`font-sans antialiased bg-background text-foreground min-h-screen flex flex-col`}>
        <AuthProvider>
          {children}
          <Toaster />
          <CookieConsentBanner /> {/* Added Banner */}
        </AuthProvider>
      </body>
    </html>
  );
}
