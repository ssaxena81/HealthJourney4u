
'use client';

import { Button } from '@/components/ui/button';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Log the error to the console for more details during development
  React.useEffect(() => {
    console.error("Authenticated section error boundary caught:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background p-4 text-center">
      <h2 className="mb-4 text-2xl font-bold text-destructive">Something Went Wrong</h2>
      <p className="mb-2 text-muted-foreground">
        We ran into an issue while loading this part of the application.
      </p>
      {error?.message && (
          <pre className="mt-2 mb-4 max-w-full overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-left text-sm text-muted-foreground">
              Error: {error.message}
          </pre>
      )}
      <Button
        onClick={
          // Attempt to recover by trying to re-render the segment
          () => reset()
        }
      >
        Try again
      </Button>
    </div>
  );
}
