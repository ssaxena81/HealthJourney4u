
'use client';

import React from 'react';

export default function RootPage() {
  console.log('[RootPage MINIMAL DEBUG] Rendering minimal root page.');
  return (
    <div style={{ padding: '20px', border: '2px solid blue', margin: '20px' }}>
      <h1>Minimal Root Page</h1>
      <p>If you see this, the basic page component is rendering and building correctly.</p>
      <p>Timestamp: {new Date().toISOString()}</p>
    </div>
  );
}
