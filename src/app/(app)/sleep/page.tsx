
'use client';

import React, { useState, useEffect, useTransition, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { useToast } from '@/hooks/use-toast';
import { getFitbitSleepLogsForDateRange } from '@/app/actions/fitbitActions'; // Action to fetch sleep logs
import type { FitbitSleepLogFirestore, SleepRadarGoals, UserProfile } from '@/types';
import { format, parseISO, startOfDay, endOfDay, differenceInDays, differenceInMinutes } from 'date-fns';
import { Loader2, Bed } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

// Default target/min goals if not set by user
const DEFAULT_TARGET_SLEEP_DURATION_HOURS = 8;
const DEFAULT_MIN_SLEEP_EFFICIENCY_PERCENT = 85;
const DEFAULT_MIN_TIME_IN_DEEP_SLEEP_MINUTES = 75; // Approx 15-20% of 8 hours
const DEFAULT_MIN_TIME_IN_REM_SLEEP_MINUTES = 90;  // Approx 20-25% of 8 hours

// For radar chart axis scaling (fullMark)
const MAX_POSSIBLE_SLEEP_DURATION_HOURS = 12;
const MAX_POSSIBLE_SLEEP_EFFICIENCY_PERCENT = 100;
const MAX_POSSIBLE_TIME_IN_STAGE_MINUTES = 240; // 4 hours, a generous upper limit for a stage

interface SleepRadarDataPoint {
  metric: string;
  actual: number;
  goal?: number;
  fullMark: number; // Defines the max for this axis
  actualFormatted: string;
  goalFormatted?: string;
}

export default function SleepPage() {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const [isLoadingData, startDataFetchTransition] = useTransition();

  const [viewDateRange, setViewDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: startOfDay(new Date()), // Default to today
    to: endOfDay(new Date()),
  });
  const [sleepLogs, setSleepLogs] = useState<FitbitSleepLogFirestore[]>([]);

  const userGoals: SleepRadarGoals = userProfile?.sleepRadarGoals || {};

  const fetchDataForRange = async () => {
    if (!viewDateRange.from || !viewDateRange.to || !user) {
      setSleepLogs([]);
      return;
    }
    startDataFetchTransition(async () => {
      try {
        const result = await getFitbitSleepLogsForDateRange(user.uid, {
          from: format(viewDateRange.from!, 'yyyy-MM-dd'),
          to: format(viewDateRange.to!, 'yyyy-MM-dd'),
        });

        if (result.success && result.data) {
          setSleepLogs(result.data.sort((a, b) => parseISO(b.startTime).getTime() - parseISO(a.startTime).getTime()));
          if (result.data.length === 0) {
            toast({ title: 'No Sleep Data', description: 'No sleep logs found from Fitbit for the selected range.', variant: 'default' });
          }
        } else {
          setSleepLogs([]);
          toast({ title: 'Error Fetching Sleep Data', description: result.error || 'Could not fetch sleep logs.', variant: 'destructive' });
        }
      } catch (error) {
        setSleepLogs([]);
        console.error("Error fetching sleep logs from Firestore:", error);
        toast({ title: 'Fetch Error', description: 'An unexpected error occurred while fetching sleep data.', variant: 'destructive' });
      }
    });
  };

  useEffect(() => {
    if (user && viewDateRange.from && viewDateRange.to) {
      fetchDataForRange();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDateRange, user]);

  const formatDurationFromMs = (ms?: number): string => {
    if (ms === undefined || ms === null || isNaN(ms)) return 'N/A';
    const totalMinutes = Math.floor(ms / (1000 * 60));
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}h ${m}m`;
  };
  
  const formatDurationFromMins = (totalMinutes?: number): string => {
    if (totalMinutes === undefined || totalMinutes === null || isNaN(totalMinutes)) return 'N/A';
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}h ${m}m`;
  };


  const radarChartData = useMemo((): SleepRadarDataPoint[] => {
    if (!sleepLogs.length || !viewDateRange.from || !viewDateRange.to) return [];

    const numberOfDays = differenceInDays(endOfDay(viewDateRange.to), startOfDay(viewDateRange.from)) + 1;
    if (numberOfDays <= 0) return [];

    // Consider only main sleep logs for averages if available, or all logs.
    // For simplicity, averaging all logs for now.
    const relevantLogs = sleepLogs; // .filter(log => log.isMainSleep); // Or further filter by date range if needed

    if (relevantLogs.length === 0) return [];

    let totalDurationMs = 0;
    let totalEfficiencySum = 0;
    let totalDeepSleepMinutes = 0;
    let totalRemSleepMinutes = 0;
    
    relevantLogs.forEach(log => {
      totalDurationMs += log.duration || 0; // duration is in ms
      totalEfficiencySum += log.efficiency || 0; // efficiency is %
      totalDeepSleepMinutes += log.levels?.summary?.deep?.minutes || 0;
      totalRemSleepMinutes += log.levels?.summary?.rem?.minutes || 0;
    });

    const avgDurationHours = (totalDurationMs / relevantLogs.length) / (1000 * 60 * 60);
    const avgEfficiencyPercent = totalEfficiencySum / relevantLogs.length;
    const avgDeepSleepMinutes = totalDeepSleepMinutes / relevantLogs.length;
    const avgRemSleepMinutes = totalRemSleepMinutes / relevantLogs.length;

    const goalDuration = userGoals.targetSleepDurationHours ?? DEFAULT_TARGET_SLEEP_DURATION_HOURS;
    const goalEfficiency = userGoals.minSleepEfficiencyPercent ?? DEFAULT_MIN_SLEEP_EFFICIENCY_PERCENT;
    const goalDeep = userGoals.minTimeInDeepSleepMinutes ?? DEFAULT_MIN_TIME_IN_DEEP_SLEEP_MINUTES;
    const goalREM = userGoals.minTimeInRemSleepMinutes ?? DEFAULT_MIN_TIME_IN_REM_SLEEP_MINUTES;

    const data: SleepRadarDataPoint[] = [
      {
        metric: 'Avg Duration',
        actual: isNaN(avgDurationHours) ? 0 : parseFloat(avgDurationHours.toFixed(1)),
        goal: goalDuration,
        fullMark: goalDuration * 1.25 || MAX_POSSIBLE_SLEEP_DURATION_HOURS,
        actualFormatted: `${isNaN(avgDurationHours) ? 'N/A' : avgDurationHours.toFixed(1)} h`,
        goalFormatted: `${goalDuration} h`
      },
      {
        metric: 'Avg Efficiency',
        actual: isNaN(avgEfficiencyPercent) ? 0 : parseFloat(avgEfficiencyPercent.toFixed(0)),
        goal: goalEfficiency,
        fullMark: MAX_POSSIBLE_SLEEP_EFFICIENCY_PERCENT,
        actualFormatted: `${isNaN(avgEfficiencyPercent) ? 'N/A' : avgEfficiencyPercent.toFixed(0)}%`,
        goalFormatted: `${goalEfficiency}%`
      },
      {
        metric: 'Avg Deep Sleep',
        actual: isNaN(avgDeepSleepMinutes) ? 0 : parseFloat(avgDeepSleepMinutes.toFixed(0)),
        goal: goalDeep,
        fullMark: goalDeep * 1.25 || MAX_POSSIBLE_TIME_IN_STAGE_MINUTES,
        actualFormatted: `${isNaN(avgDeepSleepMinutes) ? 'N/A' : avgDeepSleepMinutes.toFixed(0)} min`,
        goalFormatted: `${goalDeep} min`
      },
      {
        metric: 'Avg REM Sleep',
        actual: isNaN(avgRemSleepMinutes) ? 0 : parseFloat(avgRemSleepMinutes.toFixed(0)),
        goal: goalREM,
        fullMark: goalREM * 1.25 || MAX_POSSIBLE_TIME_IN_STAGE_MINUTES,
        actualFormatted: `${isNaN(avgRemSleepMinutes) ? 'N/A' : avgRemSleepMinutes.toFixed(0)} min`,
        goalFormatted: `${goalREM} min`
      },
    ];
    return data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleepLogs, viewDateRange.from, viewDateRange.to, userProfile]);

  const chartConfig = {
    actual: { label: 'Actual Average', color: 'hsl(var(--chart-1))' },
    goal: { label: 'Goal', color: 'hsl(var(--chart-2))' },
  };

  return (
    <div className="container mx-auto py-6 px-4 md:px-6 space-y-8">
      <Card className="shadow-lg rounded-xl">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <Bed className="h-8 w-8 text-primary" />
            <div>
              <CardTitle className="text-3xl font-bold tracking-tight">Sleep Analysis</CardTitle>
              <CardDescription className="text-muted-foreground">
                View and analyze your sleep patterns from Fitbit. Set your goals in Profile &gt; Sleep Goals.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-4 border rounded-lg bg-card/50 shadow-sm">
            <h3 className="text-lg font-semibold mb-3">View Sleep Logs</h3>
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
              <div className="flex-grow">
                <label htmlFor="view-range-sleep" className="block text-sm font-medium mb-1">Select Date Range:</label>
                <DatePickerWithRange
                  id="view-range-sleep"
                  value={viewDateRange}
                  onValueChange={(range) => setViewDateRange({ from: range.from ? startOfDay(range.from) : undefined, to: range.to ? endOfDay(range.to) : undefined })}
                  className="w-full"
                />
              </div>
              <Button onClick={fetchDataForRange} disabled={isLoadingData || !viewDateRange.from || !viewDateRange.to || !user}>
                {isLoadingData ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Load Data"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Data is fetched from your stored Fitbit sleep logs. Sync new logs from your Profile page.
            </p>
          </div>
        </CardContent>
      </Card>

      {isLoadingData && (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-4 text-lg">Loading sleep data...</p>
        </div>
      )}

      {!isLoadingData && sleepLogs.length > 0 && radarChartData.length > 0 && (
        <Card className="shadow-md rounded-lg">
          <CardHeader>
            <CardTitle>Sleep Performance Overview</CardTitle>
            <CardDescription>
              Average daily sleep metrics for the period: {viewDateRange.from ? format(viewDateRange.from, 'MMM d, yyyy') : ''} - {viewDateRange.to ? format(viewDateRange.to, 'MMM d, yyyy') : ''}.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-8">
            <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[450px]">
              <RadarChart data={radarChartData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      indicator="line"
                      labelKey="metric"
                      formatter={(value, name, props) => (
                         <div className="flex flex-col">
                            <span className="font-medium">{props.payload.metric}</span>
                            {name === 'actual' && <span className="text-muted-foreground">Actual: {props.payload.actualFormatted}</span>}
                            {name === 'goal' && <span className="text-muted-foreground">Goal: {props.payload.goalFormatted}</span>}
                        </div>
                      )}
                    />
                  }
                />
                <PolarGrid />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
                <PolarRadiusAxis angle={90} domain={[0, 'dataMax']} tickFormatter={(value) => value} /> 
                <Radar
                  name="Actual"
                  dataKey="actual"
                  stroke="var(--color-actual)"
                  fill="var(--color-actual)"
                  fillOpacity={0.6}
                />
                <Radar
                  name="Goal"
                  dataKey="goal"
                  stroke="var(--color-goal)"
                  fill="var(--color-goal)"
                  fillOpacity={0.4}
                />
                <Legend />
              </RadarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {!isLoadingData && sleepLogs.length === 0 && (
         <Card className="shadow-md rounded-lg">
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">
              No sleep logs found for the selected date range.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoadingData && sleepLogs.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">
            Sleep Log Details ({viewDateRange.from ? format(viewDateRange.from, 'MMM d, yyyy') : ''} - {viewDateRange.to ? format(viewDateRange.to, 'MMM d, yyyy') : ''})
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sleepLogs.map((log) => (
              <Card key={log.logId} className="shadow-sm hover:shadow-md transition-shadow rounded-lg overflow-hidden">
                <CardHeader className="pb-2 bg-muted/30">
                  <CardTitle className="text-lg capitalize flex items-center gap-2">
                     <Bed className="h-5 w-5 text-primary" />
                    Sleep on {format(parseISO(log.dateOfSleep), 'PP')}
                  </CardTitle>
                   <CardDescription className="text-xs">
                     Started: {format(parseISO(log.startTime), 'PPpp')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1 text-sm pt-4">
                  <p><strong>Duration:</strong> {formatDurationFromMs(log.duration)}</p>
                  <p><strong>Time in Bed:</strong> {formatDurationFromMins(log.timeInBed)}</p>
                  <p><strong>Efficiency:</strong> {log.efficiency}%</p>
                  {log.levels?.summary?.deep && <p><strong>Deep Sleep:</strong> {formatDurationFromMins(log.levels.summary.deep.minutes)}</p>}
                  {log.levels?.summary?.light && <p><strong>Light Sleep:</strong> {formatDurationFromMins(log.levels.summary.light.minutes)}</p>}
                  {log.levels?.summary?.rem && <p><strong>REM Sleep:</strong> {formatDurationFromMins(log.levels.summary.rem.minutes)}</p>}
                  {log.levels?.summary?.wake && <p><strong>Awake:</strong> {formatDurationFromMins(log.levels.summary.wake.minutes)}</p>}
                   <p><strong>Type:</strong> <span className="capitalize">{log.type}</span> {log.isMainSleep && '(Main Sleep)'}</p>
                </CardContent>
                 <CardFooter className="text-xs text-muted-foreground bg-muted/20 py-2 px-4 justify-between items-center">
                    <span>Source: <span className="capitalize font-medium">{log.dataSource}</span></span>
                    <span>Log ID: {log.logId}</span>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
