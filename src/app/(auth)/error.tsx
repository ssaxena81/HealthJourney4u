'use client';

// Absolute Minimal Auth Error Boundary
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // console.error("AuthError rendering. Error:", error);
  return (
    <div>
      <h2>Authentication Error</h2>
      <p>An error occurred during the authentication process.</p>
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
