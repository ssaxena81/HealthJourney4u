
'use client';

import React, { useState, useEffect, useTransition, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { useToast } from '@/hooks/use-toast';
import { getNormalizedActivitiesForDateRangeAndType } from '@/app/actions/activityActions';
import type { NormalizedActivityFirestore, WalkingRadarGoals } from '@/types';
import { NormalizedActivityType } from '@/types';
import { format, parseISO, startOfDay, endOfDay, differenceInDays } from 'date-fns';
import { Loader2, Footprints } from 'lucide-react';
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

// Default maximums for normalization IF user has not configured them
const DEFAULT_MAX_AVG_DAILY_STEPS = 15000;
const DEFAULT_MAX_AVG_DAILY_DISTANCE_METERS = 10000; // 10km
const DEFAULT_MAX_AVG_DAILY_DURATION_SEC = 7200; // 2 hours
const DEFAULT_MAX_AVG_DAILY_SESSIONS = 3;

interface RadarChartDataPoint {
  metric: string;
  value: number; // Normalized value (0-100)
  actualValue: string; // Formatted actual value for tooltip
  fullMark: number; // Max value for the axis (always 100 for normalized)
  isOverGoal?: boolean;
}

export default function WalkingExercisePage() {
  const { user, userProfile } = useAuth(); // Get userProfile for radar goals
  const { toast } = useToast();
  const [isLoadingData, startDataFetchTransition] = useTransition();

  const [viewDateRange, setViewDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: startOfDay(new Date()),
    to: endOfDay(new Date()),
  });
  const [walkingActivities, setWalkingActivities] = useState<NormalizedActivityFirestore[]>([]);

  const userGoals: WalkingRadarGoals = userProfile?.walkingRadarGoals || {};

  const MAX_AVG_DAILY_STEPS = userGoals.maxDailySteps || DEFAULT_MAX_AVG_DAILY_STEPS;
  const MAX_AVG_DAILY_DISTANCE_METERS = userGoals.maxDailyDistanceMeters || DEFAULT_MAX_AVG_DAILY_DISTANCE_METERS;
  const MAX_AVG_DAILY_DURATION_SEC = userGoals.maxDailyDurationSec || DEFAULT_MAX_AVG_DAILY_DURATION_SEC;
  const MAX_AVG_DAILY_SESSIONS = userGoals.maxDailySessions || DEFAULT_MAX_AVG_DAILY_SESSIONS;


  const fetchDataForRange = async () => {
    if (!viewDateRange.from || !viewDateRange.to || !user) {
      setWalkingActivities([]);
      return;
    }
    startDataFetchTransition(async () => {
      try {
        const result = await getNormalizedActivitiesForDateRangeAndType(
          {
            from: format(viewDateRange.from!, 'yyyy-MM-dd'),
            to: format(viewDateRange.to!, 'yyyy-MM-dd'),
          },
          NormalizedActivityType.Walking
        );

        if (result.success && result.data) {
          setWalkingActivities(result.data.sort((a, b) => parseISO(b.startTimeUtc).getTime() - parseISO(a.startTimeUtc).getTime()));
          if (result.data.length === 0) {
            toast({ title: 'No Data', description: 'No walking activities found in Firestore for the selected range.', variant: 'default' });
          }
        } else {
          setWalkingActivities([]);
          toast({ title: 'Error Fetching Data', description: result.error || 'Could not fetch walking activities.', variant: 'destructive' });
        }
      } catch (error) {
        setWalkingActivities([]);
        console.error("Error fetching walking activities from Firestore:", error);
        toast({ title: 'Fetch Error', description: 'An unexpected error occurred while fetching data.', variant: 'destructive' });
      }
    });
  };

  useEffect(() => {
    if (user && viewDateRange.from && viewDateRange.to) {
      fetchDataForRange();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDateRange, user]);

  const formatDuration = (seconds?: number): string => {
    if (seconds === undefined || seconds === null || isNaN(seconds)) return 'N/A';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    let str = '';
    if (h > 0) str += `${h}h `;
    if (m > 0 || h > 0) str += `${m}m `;
    str += `${s}s`;
    return str.trim() || '0s';
  };

  const formatDistance = (meters?: number): string => {
    if (meters === undefined || meters === null || isNaN(meters)) return 'N/A';
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km`;
    }
    return `${meters.toFixed(0)} m`;
  };

  const radarChartData = useMemo((): RadarChartDataPoint[] => {
    if (!walkingActivities.length || !viewDateRange.from || !viewDateRange.to) return [];

    const numberOfDaysInRange = differenceInDays(endOfDay(viewDateRange.to), startOfDay(viewDateRange.from)) + 1;
    if (numberOfDaysInRange <= 0) return [];

    let totalSteps = 0;
    let totalDistanceMeters = 0;
    let totalDurationMovingSec = 0;
    
    const uniqueDaysWithSessions = new Set<string>();
    walkingActivities.forEach(activity => {
      totalSteps += activity.steps || 0;
      totalDistanceMeters += activity.distanceMeters || 0;
      totalDurationMovingSec += activity.durationMovingSec || 0;
      uniqueDaysWithSessions.add(activity.date); 
    });
    
    const totalSessions = walkingActivities.length;

    const avgDailySteps = totalSteps / numberOfDaysInRange;
    const avgDailyDistance = totalDistanceMeters / numberOfDaysInRange;
    const avgDailyDuration = totalDurationMovingSec / numberOfDaysInRange;
    const avgDailySessions = totalSessions / numberOfDaysInRange;

    const dataPoints: RadarChartDataPoint[] = [
      {
        metric: 'Avg Steps/Day',
        value: Math.min(100, (avgDailySteps / MAX_AVG_DAILY_STEPS) * 100),
        actualValue: `${Math.round(avgDailySteps).toLocaleString()} steps`,
        fullMark: 100,
        isOverGoal: avgDailySteps > MAX_AVG_DAILY_STEPS && !!userGoals.maxDailySteps,
      },
      {
        metric: 'Avg Distance/Day',
        value: Math.min(100, (avgDailyDistance / MAX_AVG_DAILY_DISTANCE_METERS) * 100),
        actualValue: formatDistance(avgDailyDistance),
        fullMark: 100,
        isOverGoal: avgDailyDistance > MAX_AVG_DAILY_DISTANCE_METERS && !!userGoals.maxDailyDistanceMeters,
      },
      {
        metric: 'Avg Duration/Day',
        value: Math.min(100, (avgDailyDuration / MAX_AVG_DAILY_DURATION_SEC) * 100),
        actualValue: formatDuration(avgDailyDuration),
        fullMark: 100,
        isOverGoal: avgDailyDuration > MAX_AVG_DAILY_DURATION_SEC && !!userGoals.maxDailyDurationSec,
      },
      {
        metric: 'Avg Sessions/Day',
        value: Math.min(100, (avgDailySessions / MAX_AVG_DAILY_SESSIONS) * 100),
        actualValue: `${avgDailySessions.toFixed(1)} sessions`,
        fullMark: 100,
        isOverGoal: avgDailySessions > MAX_AVG_DAILY_SESSIONS && !!userGoals.maxDailySessions,
      },
    ];
    
    dataPoints.forEach(point => {
        if (point.isOverGoal) {
            console.warn(`[WalkingPage] Metric "${point.metric}" (${point.actualValue}) exceeds configured goal. Consider updating goals in profile.`);
        }
    });


    return dataPoints;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkingActivities, viewDateRange.from, viewDateRange.to, userProfile]); // Depend on userProfile to re-calc if goals change

  const chartConfig = {
    performance: {
      label: 'Walking Performance',
      color: 'hsl(var(--chart-1))',
    },
  };

  const showGoalExceededToast = useMemo(() => {
    return radarChartData.some(point => point.isOverGoal);
  }, [radarChartData]);

  useEffect(() => {
    if (showGoalExceededToast && walkingActivities.length > 0) { // Only show if there's data
      toast({
        title: "Performance Update",
        description: "One or more walking metrics exceeded your set goals for the selected period. Consider adjusting your goals in Profile > Activity Goals.",
        variant: "default",
        duration: 10000,
      });
    }
  }, [showGoalExceededToast, toast, walkingActivities.length]);


  return (
    <div className="container mx-auto py-6 px-4 md:px-6 space-y-8">
      <Card className="shadow-lg rounded-xl">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <Footprints className="h-8 w-8 text-primary" />
            <div>
              <CardTitle className="text-3xl font-bold tracking-tight">Walking Activities</CardTitle>
              <CardDescription className="text-muted-foreground">
                View and analyze your logged walking sessions from connected sources.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-4 border rounded-lg bg-card/50 shadow-sm">
            <h3 className="text-lg font-semibold mb-3">View Activity</h3>
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
              <div className="flex-grow">
                <label htmlFor="view-range-walking" className="block text-sm font-medium mb-1">Select Date Range:</label>
                <DatePickerWithRange
                  id="view-range-walking"
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
              Data is fetched from your stored activities. Sync new activities from your Profile page.
            </p>
          </div>
        </CardContent>
      </Card>

      {isLoadingData && (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-4 text-lg">Loading walking activities...</p>
        </div>
      )}

      {!isLoadingData && walkingActivities.length > 0 && radarChartData.length > 0 && (
        <Card className="shadow-md rounded-lg">
          <CardHeader>
            <CardTitle>Walking Performance Overview</CardTitle>
            <CardDescription>
              Average daily metrics for the selected period ({viewDateRange.from ? format(viewDateRange.from, 'MMM d, yyyy') : ''} - {viewDateRange.to ? format(viewDateRange.to, 'MMM d, yyyy') : ''}). Values are normalized relative to your goals (or app defaults).
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-8">
            <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[400px]">
              <RadarChart data={radarChartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      indicator="line"
                      labelKey="actualValue" 
                      nameKey="metric"
                      formatter={(value, name, props) => (
                        <>
                          <div className="font-medium">{props.payload.metric}</div>
                          <div className="text-muted-foreground">
                            {props.payload.actualValue} (Normalized: {Math.round(props.payload.value as number)}/100)
                            {props.payload.isOverGoal && <span className="text-xs text-amber-600 ml-1">(Over Goal)</span>}
                          </div>
                        </>
                      )}
                    />
                  }
                />
                <PolarGrid />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  name="Performance"
                  dataKey="value"
                  stroke="var(--color-performance)"
                  fill="var(--color-performance)"
                  fillOpacity={0.6}
                />
                <Legend />
              </RadarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {!isLoadingData && walkingActivities.length === 0 && (
        <Card className="shadow-md rounded-lg">
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">
              No walking activities found for the selected date range. Try syncing new data or adjusting the date range.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoadingData && walkingActivities.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">
            Activity Logs ({viewDateRange.from ? format(viewDateRange.from, 'MMM d, yyyy') : ''} - {viewDateRange.to ? format(viewDateRange.to, 'MMM d, yyyy') : ''})
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {walkingActivities.map((activity) => (
              <Card key={activity.id} className="shadow-sm hover:shadow-md transition-shadow rounded-lg overflow-hidden">
                <CardHeader className="pb-2 bg-muted/30">
                  <CardTitle className="text-lg capitalize flex items-center gap-2">
                     <Footprints className="h-5 w-5 text-primary" />
                    {activity.name || `Walk on ${format(parseISO(activity.startTimeUtc), 'PP')}`}
                  </CardTitle>
                   <CardDescription className="text-xs">
                     {format(parseISO(activity.startTimeUtc), 'PPpp')} ({activity.timezone || 'UTC'})
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1 text-sm pt-4">
                  <p><strong>Distance:</strong> {formatDistance(activity.distanceMeters)}</p>
                  <p><strong>Duration (Moving):</strong> {formatDuration(activity.durationMovingSec)}</p>
                  {activity.durationElapsedSec !== activity.durationMovingSec && activity.durationElapsedSec && (
                     <p><strong>Duration (Total):</strong> {formatDuration(activity.durationElapsedSec)}</p>
                  )}
                  {activity.steps !== undefined && <p><strong>Steps:</strong> {activity.steps.toLocaleString()}</p>}
                  {activity.averageHeartRateBpm !== undefined && <p><strong>Avg. Heart Rate:</strong> {activity.averageHeartRateBpm.toFixed(0)} bpm</p>}
                  {activity.calories !== undefined && <p><strong>Calories:</strong> {activity.calories.toLocaleString()} kcal</p>}
                </CardContent>
                <CardFooter className="text-xs text-muted-foreground bg-muted/20 py-2 px-4 justify-between items-center">
                  <span>Source: <span className="capitalize font-medium">{activity.dataSource}</span></span>
                  <span>ID: {activity.originalId}</span>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

    