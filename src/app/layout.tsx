
import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"; // Restored
import { AuthProvider } from '@/hooks/useAuth'; // Restored
// import { SidebarProvider } from "@/components/ui/sidebar"; // Still commented out

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
        <AuthProvider>
          {/* <SidebarProvider> */}
            {children}
            <Toaster />
          {/* </SidebarProvider> */}
        </AuthProvider>
      </body>
    </html>
  );
}
