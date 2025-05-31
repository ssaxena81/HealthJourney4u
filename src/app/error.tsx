'use client' // Error components must be Client Components

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Global Error Boundary Caught:", error)
  }, [error])

  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center space-y-6 bg-background p-4 text-center">
          <h1 className="text-4xl font-bold text-destructive">Application Error</h1>
          <p className="text-lg text-muted-foreground">
            We're sorry, but something went wrong.
          </p>
          <pre className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-4 text-sm text-muted-foreground">
            {error.message || "An unexpected error occurred."}
            {error.digest && <><br />Digest: {error.digest}</>}
          </pre>
          <div className="flex gap-4">
            <Button
              onClick={
                // Attempt to recover by trying to re-render the segment
                () => reset()
              }
              variant="default"
              size="lg"
            >
              Try again
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/">Go to Homepage</Link>
            </Button>
          </div>
        </div>
      </body>
    </html>
  )
}
