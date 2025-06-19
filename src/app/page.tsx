// Removed 'use client'; to test as a Server Component

// Absolute Minimal Page
export default function RootPage() {
  return (
    <div style={{ padding: "20px", border: "2px solid green" }}>
      <h1>Ultra Minimal Root Page (Server Component)</h1>
      <p>If this page loads, the basic build for the root path is working.</p>
    </div>
  );
}
