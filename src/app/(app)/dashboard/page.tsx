
'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Button } from '@/components/ui/button';
// Import your chart component when ready, e.g., import SpiderChart from '@/components/charts/spider-chart';

// Placeholder for the Spider Graph / Radar Chart
const SpiderGraphPlaceholder = () => (
  <div className="w-full h-96 bg-muted rounded-lg flex items-center justify-center shadow-inner">
    <p className="text-muted-foreground">Spider Graph / Radar Chart Area</p>
  </div>
);

// Placeholder for the Horizontal Timeline
const HorizontalTimelinePlaceholder = () => (
  <Card className="mt-6 shadow-sm">
    <CardHeader>
      <CardTitle className="text-lg">Blood Work Timeline</CardTitle>
      <CardDescription>Scroll horizontally to view blood test history.</CardDescription>
    </CardHeader>
    <CardContent className="flex items-center space-x-4 p-4 overflow-x-auto">
      {/* This div will contain the actual timeline visualization */}
      <div className="h-20 w-full bg-muted/50 rounded flex items-center justify-between px-4 whitespace-nowrap">
        <span className="text-sm text-muted-foreground">Earliest Test ...</span>
        {/* Example dots - these would be dynamically generated */}
        <div className="flex space-x-8">
          <div className="h-3 w-3 bg-primary rounded-full" title="Test: YYYY-MM-DD"></div>
          {/* Add more dots as needed */}
        </div>
        <span className="text-sm text-muted-foreground">... Latest Test</span>
      </div>
      <Button variant="outline" size="sm">Refresh</Button>
    </CardContent>
  </Card>
);


export default function DashboardPage() {
  const [dateRange, setDateRange] = React.useState<{ from: Date | undefined; to: Date | undefined }>({
    from: new Date(), // Default to current date
    to: new Date(),   // Default to current date
  });

  // TODO: Add validation: End date cannot be prior to Start date
  // TODO: When dateRange changes, fetch data for the spider graph and update it

  return (
    <div className="container mx-auto py-6 px-4 md:px-6 space-y-6">
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-2xl">My Health Overview</CardTitle>
          <CardDescription>Visualize your key health metrics.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <DatePickerWithRange
              value={dateRange}
              onValueChange={setDateRange}
            />
            {/* TODO: Add error message display for invalid date range */}
          </div>
          {/* <SpiderChart data={chartData} /> */}
          <SpiderGraphPlaceholder />
        </CardContent>
      </Card>

      <HorizontalTimelinePlaceholder />
    </div>
  );
}
