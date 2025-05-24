
'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default function HikingExercisePage() {
  return (
    <div className="container mx-auto py-6 px-4 md:px-6 space-y-6">
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-2xl">Hiking Tracking</CardTitle>
          <CardDescription>
            Log and visualize your hiking activity. This page is under construction.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-60 w-full bg-muted rounded-lg flex items-center justify-center">
            <p className="text-muted-foreground">Hiking data and charts will be displayed here.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
