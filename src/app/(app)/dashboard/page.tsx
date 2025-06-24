
'use client';

import React, { useState, useEffect, useMemo, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { getDashboardRadarData } from '@/app/actions/dashboardActions';
import type { RadarDataPoint, UserProfile } from '@/types'; // Assuming RadarDataPoint is defined in dashboardActions or types
import { format, startOfDay, endOfDay } from 'date-fns';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { useToast } from '@/hooks/use-toast';

// Placeholder for the Horizontal Timeline (if it's still part of this page)
const HorizontalTimelinePlaceholder = () => (
  <Card className="mt-6 shadow-sm">
    <CardHeader>
      <CardTitle className="text-lg">Blood Work Timeline</CardTitle>
      <CardDescription>Scroll horizontally to view blood test history.</CardDescription>
    </CardHeader>
    <CardContent className="flex items-center space-x-4 p-4 overflow-x-auto">
      <div className="h-20 w-full bg-muted/50 rounded flex items-center justify-between px-4 whitespace-nowrap">
        <span className="text-sm text-muted-foreground">Earliest Test ...</span>
        <div className="flex space-x-8">
          <div className="h-3 w-3 bg-primary rounded-full" title="Test: YYYY-MM-DD"></div>
        </div>
        <span className="text-sm text-muted-foreground">... Latest Test</span>
      </div>
      <Button variant="outline" size="sm">Refresh</Button>
    </CardContent>
  </Card>
);


export default function DashboardPage() {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const [isFetchingChartData, startChartDataFetch] = useTransition();
  
  const defaultDateRange = {
    from: startOfDay(new Date(new Date().setDate(new Date().getDate() - 6))), // Default to last 7 days
    to: endOfDay(new Date()),
  };

  const [viewDateRange, setViewDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>(defaultDateRange);
  const [radarData, setRadarData] = useState<RadarDataPoint[]>([]);
  const [chartConfig, setChartConfig] = useState<ChartConfig>({});

  const hasConfiguredMetrics = userProfile?.dashboardRadarMetrics && userProfile.dashboardRadarMetrics.length > 0;

  useEffect(() => {
    if (user && hasConfiguredMetrics && viewDateRange.from && viewDateRange.to) {
      startChartDataFetch(async () => {
        try {
          const result = await getDashboardRadarData(user.uid, {
            from: format(viewDateRange.from!, 'yyyy-MM-dd'),
            to: format(viewDateRange.to!, 'yyyy-MM-dd'),
          });

          if (result.success && result.data) {
            setRadarData(result.data);
            
            // Dynamically build chartConfig
            const newChartConfig: ChartConfig = {};
            result.data.forEach((point, index) => {
                // Use a rotating set of chart colors or a more sophisticated color assignment
                const colorKey = `chart-${(index % 5) + 1}` as keyof ChartConfig; 
                newChartConfig[point.metric] = {
                  label: point.metric,
                  // @ts-ignore - this is a valid chart color variable
                  color: `hsl(var(--${colorKey}))`,
                };
            });
            setChartConfig(newChartConfig);

          } else {
            setRadarData([]);
            setChartConfig({});
            toast({
              title: 'Error Fetching Dashboard Data',
              description: result.error || 'Could not load radar chart data.',
              variant: 'destructive',
            });
          }
        } catch (error) {
          setRadarData([]);
          setChartConfig({});
          console.error("Failed to fetch dashboard radar data:", error);
          toast({
            title: 'Dashboard Error',
            description: 'An unexpected error occurred while loading dashboard data.',
            variant: 'destructive',
          });
        }
      });
    } else if (user && !hasConfiguredMetrics) {
      setRadarData([]); // Clear data if metrics are not configured
      setChartConfig({});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDateRange, user, userProfile?.dashboardRadarMetrics, hasConfiguredMetrics]); // Rerun if userProfile.dashboardRadarMetrics changes


  if (!userProfile) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3">Loading user profile...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 md:px-6 space-y-8">
      <Card className="shadow-lg rounded-xl">
        <CardHeader>
          <CardTitle className="text-3xl font-bold tracking-tight">My Health Overview</CardTitle>
          <CardDescription className="text-muted-foreground">
            Visualize your key health metrics for the selected period. Configure metrics in your <Link href="/profile" className="underline text-primary hover:text-primary/80">Profile</Link>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <label htmlFor="dashboard-date-range" className="block text-sm font-medium mb-1">Select Date Range:</label>
            <DatePickerWithRange
              id="dashboard-date-range"
              value={viewDateRange}
              onValueChange={(range) => setViewDateRange({ from: range.from ? startOfDay(range.from) : undefined, to: range.to ? endOfDay(range.to) : undefined })}
            />
          </div>

          {isFetchingChartData && (
            <div className="flex justify-center items-center h-80 w-full bg-muted/30 rounded-lg shadow-inner">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="ml-3">Loading chart data...</p>
            </div>
          )}

          {!isFetchingChartData && !hasConfiguredMetrics && (
            <div className="flex flex-col items-center justify-center h-80 w-full bg-muted/30 rounded-lg shadow-inner p-6 text-center">
              <p className="text-lg font-medium text-muted-foreground mb-2">No Dashboard Metrics Configured</p>
              <p className="text-sm text-muted-foreground mb-4">
                Please go to your <Link href="/profile" className="underline text-primary hover:text-primary/80">Profile</Link> page, under the "Dashboard" tab, to select the metrics you want to see here.
              </p>
              <Button asChild>
                <Link href="/profile">Go to Profile</Link>
              </Button>
            </div>
          )}

          {!isFetchingChartData && hasConfiguredMetrics && radarData.length > 0 && (
            <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[500px]">
              <RadarChart data={radarData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      indicator="line"
                      labelKey="metric" // Main label for the tooltip section
                      formatter={(value, name, props) => {
                        // 'name' will be the metric name here, 'value' is the normalized value
                        // 'props.payload' contains the full data point: { metric, value, actualFormattedValue, fullMark }
                        const dataPoint = props.payload as RadarDataPoint;
                        return (
                          <>
                            <div className="font-medium">{dataPoint.metric}</div>
                            <div className="text-muted-foreground">
                              {dataPoint.actualFormattedValue} (Normalized: {Math.round(dataPoint.value)}/100)
                            </div>
                          </>
                        );
                      }}
                    />
                  }
                />
                <PolarGrid />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  name="Performance" // This name appears in default legend if ChartLegendContent wasn't used
                  dataKey="value"
                  stroke="hsl(var(--chart-1))" // Default stroke, can be overridden by chartConfig
                  fill="hsl(var(--chart-1))"   // Default fill
                  fillOpacity={0.6}
                />
                {/* Custom legend can be added here if needed, or use default if ChartContainer handles it based on config */}
              </RadarChart>
            </ChartContainer>
          )}

          {!isFetchingChartData && hasConfiguredMetrics && radarData.length === 0 && (
             <div className="flex justify-center items-center h-80 w-full bg-muted/30 rounded-lg shadow-inner">
              <p className="text-muted-foreground">No data available for the selected metrics and date range.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <HorizontalTimelinePlaceholder />
    </div>
  );
}
