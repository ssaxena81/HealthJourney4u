
'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { useToast } from '@/hooks/use-toast';
import { getNormalizedActivitiesForDateRangeAndType } from '@/app/actions/activityActions';
import type { NormalizedActivityFirestore } from '@/types';
import { NormalizedActivityType } from '@/types';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import { Loader2, Footprints } from 'lucide-react'; // Using Footprints for walking
import { useAuth } from '@/hooks/useAuth';

export default function WalkingExercisePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoadingData, startDataFetchTransition] = useTransition();

  const [viewDateRange, setViewDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: startOfDay(new Date()),
    to: endOfDay(new Date()),
  });
  const [walkingActivities, setWalkingActivities] = useState<NormalizedActivityFirestore[]>([]);

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
          setWalkingActivities(result.data);
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
    if (seconds === undefined || seconds === null) return 'N/A';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    let str = '';
    if (h > 0) str += `${h}h `;
    if (m > 0 || h > 0) str += `${m}m `; // Show minutes if hours are present or minutes > 0
    str += `${s}s`;
    return str.trim() || '0s'; // Ensure "0s" if all are zero
  };

  const formatDistance = (meters?: number): string => {
    if (meters === undefined || meters === null) return 'N/A';
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km`;
    }
    return `${meters.toFixed(0)} m`;
  };

  return (
    <div className="container mx-auto py-6 px-4 md:px-6 space-y-8">
      <Card className="shadow-lg rounded-xl">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <Footprints className="h-8 w-8 text-primary" />
            <div>
              <CardTitle className="text-3xl font-bold tracking-tight">Walking Activities</CardTitle>
              <CardDescription className="text-muted-foreground">
                View your logged walking sessions from connected sources.
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
                    {activity.title || `Walk on ${format(parseISO(activity.startTimeUtc), 'PP')}`}
                  </CardTitle>
                   <CardDescription className="text-xs">
                     {format(parseISO(activity.startTimeUtc), 'PPpp')} ({activity.timezone || 'UTC'})
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1 text-sm pt-4">
                  <p><strong>Distance:</strong> {formatDistance(activity.distanceMeters)}</p>
                  <p><strong>Duration (Moving):</strong> {formatDuration(activity.durationMovingSec)}</p>
                  {activity.durationElapsedSec !== activity.durationMovingSec && (
                     <p><strong>Duration (Total):</strong> {formatDuration(activity.durationElapsedSec)}</p>
                  )}
                  {activity.steps !== undefined && <p><strong>Steps:</strong> {activity.steps.toLocaleString()}</p>}
                  {activity.averageHeartRateBpm !== undefined && <p><strong>Avg. Heart Rate:</strong> {activity.averageHeartRateBpm.toFixed(0)} bpm</p>}
                  {activity.calories !== undefined && <p><strong>Calories:</strong> {activity.calories.toLocaleString()}</p>}
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
