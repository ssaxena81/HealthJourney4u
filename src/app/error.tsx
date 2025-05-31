'use client';

// Absolute Minimal Global Error Boundary
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // It's generally recommended to log the error
  // console.error("GlobalError rendering. Error:", error);
  return (
    <div>
      <h1>Application Error</h1>
      <p>We encountered an unexpected issue.</p>
      <p>Details: {error?.message || 'An unknown error occurred.'}</p>
      <button
        onClick={() => reset()}
        style={{ padding: '8px 16px', marginTop: '10px' }}
      >
        Try again
      </button>
    </div>
  );
}
