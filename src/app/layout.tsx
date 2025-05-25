
import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from '@/hooks/useAuth';
import { SidebarProvider } from "@/components/ui/sidebar";


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
      <body className={`font-sans antialiased bg-background text-foreground`}>
        {/* Reordered SidebarProvider and AuthProvider - this is a speculative change. */}
        <SidebarProvider defaultOpen={true}>
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        </SidebarProvider>
      </body>
    </html>
  );
}
