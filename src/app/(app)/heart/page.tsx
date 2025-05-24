
'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default function HeartPage() {
  return (
    <div className="container mx-auto py-6 px-4 md:px-6 space-y-6">
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-2xl">Heart Health</CardTitle>
          <CardDescription>
            Keep track of your heart-related metrics. This page is under construction.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-60 w-full bg-muted rounded-lg flex items-center justify-center">
            <p className="text-muted-foreground">Heart rate data, trends, and other cardiovascular information will be displayed here.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
