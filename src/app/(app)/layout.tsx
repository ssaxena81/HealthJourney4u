
'use client';

import React from 'react';
import { usePathname } from 'next/navigation'; // For logging the path

export default function AuthenticatedAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  console.log(`[AuthenticatedAppLayout MINIMAL DEBUG] Rendering for pathname: ${pathname}. Timestamp: ${new Date().toISOString()}`);

  // Directly render children without any auth checks for this temporary debug step
  return (
    <div style={{ border: '2px solid red', padding: '10px' }}>
      <p style={{ color: 'red', fontWeight: 'bold' }}>DEBUG: AuthenticatedAppLayout Wrapper (Minimal)</p>
      <p style={{ color: 'red' }}>Current Pathname (from usePathname): {pathname}</p>
      {children}
    </div>
  );
}
