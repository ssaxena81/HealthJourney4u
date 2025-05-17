
'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Button } from '@/components/ui/button';

// Placeholder for SpiderGraph/RadarChart
const SpiderGraphPlaceholder = () => (
  <div className="w-full h-96 bg-muted rounded-lg flex items-center justify-center shadow-inner">
    <p className="text-muted-foreground">Spider Graph / Radar Chart Area</p>
  </div>
);

// Placeholder for Horizontal Timeline
const HorizontalTimelinePlaceholder = () => (
  <Card className="mt-6 shadow-sm">
    <CardHeader>
      <CardTitle className="text-lg">Blood Work Timeline</CardTitle>
      <CardDescription>Scroll horizontally to view blood test history.</CardDescription>
    </CardHeader>
    <CardContent className="flex items-center space-x-4 p-4 overflow-x-auto">
      <div className="h-20 w-full bg-muted/50 rounded flex items-center justify-between px-4 whitespace-nowrap">
        <span className="text-sm text-muted-foreground">Earliest Test ...</span>
        {/* Placeholder dots */}
        <div className="flex space-x-8">
          <div className="h-3 w-3 bg-primary rounded-full" title="Test: YYYY-MM-DD"></div>
          <div className="h-3 w-3 bg-primary rounded-full" title="Test: YYYY-MM-DD"></div>
          <div className="h-3 w-3 bg-primary rounded-full" title="Test: YYYY-MM-DD"></div>
          <div className="h-3 w-3 bg-primary rounded-full" title="Test: YYYY-MM-DD"></div>
        </div>
        <span className="text-sm text-muted-foreground">... Latest Test</span>
      </div>
      <Button variant="outline" size="sm">Refresh</Button>
    </CardContent>
  </Card>
);

// Note: VerticalTimelinePlaceholder is part of AppLayoutClient, not directly rendered here.

export default function DashboardPage() {
  const [dateRange, setDateRange] = React.useState<{ from: Date | undefined; to: Date | undefined }>({
    from: new Date(), // Default to today
    to: new Date(),   // Default to today
  });

  // TODO: Fetch data for spider graph based on dateRange
  // TODO: Implement validation for date range (end >= from)

  return (
    <div className="flex flex-col h-full">
      <Card className="mb-6 shadow">
        <CardHeader>
          <CardTitle className="text-2xl md:text-3xl">My Health Dashboard</CardTitle>
          <CardDescription>Overview of your health metrics.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="mb-6">
              <p className="text-sm text-muted-foreground mb-2">Select Date Range for Graph:</p>
              <DatePickerWithRange
                value={{ from: dateRange.from, to: dateRange.to }}
                onValueChange={setDateRange}
                className="max-w-sm"
              />
            </div>
            <SpiderGraphPlaceholder />
        </CardContent>
      </Card>

      <div className="flex-grow overflow-hidden"> {/* This will contain the bottom horizontal timeline */}
         <HorizontalTimelinePlaceholder />
      </div>
    </div>
  );
}
