
'use client';

import React, { useState, useEffect } from 'react';

export default function RootPage() {
  const [clientTimestamp, setClientTimestamp] = useState<string | null>(null);

  useEffect(() => {
    // This effect runs only on the client, after initial hydration
    setClientTimestamp(new Date().toISOString());
  }, []); // Empty dependency array ensures this runs once on mount

  console.log('[RootPage MINIMAL DEBUG] Rendering minimal root page.');
  return (
    <div style={{ padding: '20px', border: '2px solid blue', margin: '20px' }}>
      <h1>Minimal Root Page</h1>
      <p>If you see this, the basic page component is rendering and building correctly.</p>
      <p>
        Timestamp: {clientTimestamp !== null ? clientTimestamp : 'Loading timestamp...'}
      </p>
    </div>
  );
}
