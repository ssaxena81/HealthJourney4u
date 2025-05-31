'use client' // Error components must be Client Components

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';


export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Auth Route Error Boundary Caught:', error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-md shadow-xl text-center">
            <CardHeader>
                <CardTitle className="text-2xl text-destructive">Authentication Error</CardTitle>
                <CardDescription>
                An error occurred that prevented the page from loading correctly.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Details: {error.message || "An unexpected error occurred in the authentication module."}
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button
                        onClick={
                        // Attempt to recover by trying to re-render the segment
                        () => reset()
                        }
                    >
                        Try again
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href="/login">Back to Login</Link>
                    </Button>
                </div>
            </CardContent>
        </Card>
    </div>
  )
}
