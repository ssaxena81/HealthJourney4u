
import type { Metadata } from 'next';
// import { GeistSans } from 'geist/font/sans'; // Temporarily commented out
// import { GeistMono } from 'geist/font/mono'; // Temporarily commented out
// import './globals.css'; // Temporarily commented out

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
    // <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
    <html lang="en">
      {/* <body className={`font-sans antialiased bg-background text-foreground`}> */}
      <body>
        {children}
      </body>
    </html>
  );
}
