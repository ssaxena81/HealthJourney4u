
'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default function SleepPage() {
  return (
    <div className="container mx-auto py-6 px-4 md:px-6 space-y-6">
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-2xl">Sleep Patterns</CardTitle>
          <CardDescription>
            Monitor and analyze your sleep quality. This page is under construction.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-60 w-full bg-muted rounded-lg flex items-center justify-center">
            <p className="text-muted-foreground">Sleep data, graphs, and insights will be displayed here.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
