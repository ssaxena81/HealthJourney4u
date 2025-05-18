
import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
// import { Toaster } from "@/components/ui/toaster"; // Simplified
// import { AuthProvider } from '@/hooks/useAuth'; // Simplified

export const metadata: Metadata = {
  title: 'Health Timeline (Simplified)',
  description: 'Track your health history with Health Timeline.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className={`font-sans antialiased bg-background text-foreground`}>
        {/* <AuthProvider> */}
            {children}
            {/* <Toaster /> */}
        {/* </AuthProvider> */}
      </body>
    </html>
  );
}
