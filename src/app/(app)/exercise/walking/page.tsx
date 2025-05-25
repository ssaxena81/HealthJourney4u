
'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker'; // Single date picker
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { useToast } from '@/hooks/use-toast';
import { fetchAndStoreFitbitDailyActivity, getFitbitActivitySummariesForDateRange } from '@/app/actions/fitbitActions';
import type { FitbitActivitySummaryFirestore } from '@/types';
import { format, startOfDay, endOfDay, parseISO } from 'date-fns';
import { Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function WalkingExercisePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSyncing, startSyncTransition] = useTransition();
  const [isLoadingData, startDataFetchTransition] = useTransition();

  const [syncDate, setSyncDate] = useState<Date | undefined>(new Date());
  const [viewDateRange, setViewDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: startOfDay(new Date()),
    to: endOfDay(new Date()),
  });
  const [walkingData, setWalkingData] = useState<FitbitActivitySummaryFirestore[]>([]);

  const handleSyncFitbitData = async () => {
    if (!syncDate) {
      toast({ title: 'Select Date', description: 'Please select a date to sync.', variant: 'destructive' });
      return;
    }
    if (!user) {
      toast({ title: 'Not Authenticated', description: 'Please log in to sync data.', variant: 'destructive' });
      return;
    }

    startSyncTransition(async () => {
      try {
        const formattedDate = format(syncDate, 'yyyy-MM-dd');
        const result = await fetchAndStoreFitbitDailyActivity(formattedDate);
        if (result.success) {
          toast({ title: 'Sync Successful', description: `Fitbit data for ${formattedDate} synced.` });
          // If the synced date is within the current view range, refresh the displayed data
          if (viewDateRange.from && viewDateRange.to && syncDate >= viewDateRange.from && syncDate <= viewDateRange.to) {
            fetchDataForRange();
          }
        } else {
          toast({ title: 'Sync Failed', description: result.message || 'Could not sync Fitbit data.', variant: 'destructive' });
        }
      } catch (error) {
        console.error("Error syncing Fitbit data:", error);
        toast({ title: 'Sync Error', description: 'An unexpected error occurred during sync.', variant: 'destructive' });
      }
    });
  };

  const fetchDataForRange = async () => {
    if (!viewDateRange.from || !viewDateRange.to || !user) {
      setWalkingData([]);
      return;
    }
    startDataFetchTransition(async () => {
      try {
        const result = await getFitbitActivitySummariesForDateRange({
          from: format(viewDateRange.from!, 'yyyy-MM-dd'),
          to: format(viewDateRange.to!, 'yyyy-MM-dd'),
        });
        if (result.success && result.data) {
          setWalkingData(result.data);
          if(result.data.length === 0) {
            toast({ title: 'No Data', description: 'No walking data found in Firestore for the selected range.', variant: 'default' });
          }
        } else {
          setWalkingData([]);
          toast({ title: 'Error Fetching Data', description: result.error || 'Could not fetch walking data from Firestore.', variant: 'destructive' });
        }
      } catch (error) {
        setWalkingData([]);
        console.error("Error fetching walking data from Firestore:", error);
        toast({ title: 'Fetch Error', description: 'An unexpected error occurred while fetching data.', variant: 'destructive' });
      }
    });
  };

  useEffect(() => {
    if (user) { // Only fetch data if user is authenticated
        fetchDataForRange();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDateRange, user]); // Depend on user to refetch if user logs in/out

  return (
    <div className="container mx-auto py-6 px-4 md:px-6 space-y-8">
      <Card className="shadow-lg rounded-xl">
        <CardHeader>
          <CardTitle className="text-3xl font-bold tracking-tight">Walking Activity</CardTitle>
          <CardDescription className="text-muted-foreground">
            Track your daily steps and walking patterns. Sync with Fitbit to update your records.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-4 border rounded-lg bg-card/50 shadow-sm">
            <h3 className="text-lg font-semibold mb-3">Sync Fitbit Data</h3>
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
              <div className="flex-grow">
                <label htmlFor="sync-date" className="block text-sm font-medium mb-1">Select Date to Sync:</label>
                <DatePicker id="sync-date" date={syncDate} setDate={setSyncDate} />
              </div>
              <Button onClick={handleSyncFitbitData} disabled={isSyncing || !syncDate}>
                {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Sync Steps for Selected Date
              </Button>
            </div>
             <p className="text-xs text-muted-foreground mt-2">
              Syncing will fetch your daily activity summary from Fitbit for the chosen date and store it.
            </p>
          </div>

          <div className="p-4 border rounded-lg bg-card/50 shadow-sm">
            <h3 className="text-lg font-semibold mb-3">View Activity</h3>
             <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                <div className="flex-grow">
                    <label htmlFor="view-range" className="block text-sm font-medium mb-1">Select Date Range to View:</label>
                    <DatePickerWithRange
                        id="view-range"
                        value={viewDateRange}
                        onValueChange={(range) => setViewDateRange({ from: range.from ? startOfDay(range.from) : undefined, to: range.to ? endOfDay(range.to) : undefined })}
                        className="w-full"
                    />
                </div>
                <Button onClick={fetchDataForRange} disabled={isLoadingData || !viewDateRange.from || !viewDateRange.to}>
                  {isLoadingData ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Load Data"}
                </Button>
             </div>
          </div>
        </CardContent>
      </Card>

      {isLoadingData && (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-4 text-lg">Loading walking data...</p>
        </div>
      )}

      {!isLoadingData && walkingData.length === 0 && (
        <Card className="shadow-md rounded-lg">
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">
              No walking data found for the selected date range. Try syncing with Fitbit or adjusting the date range.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoadingData && walkingData.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Activity Logs ({format(viewDateRange.from!, 'MMM d, yyyy')} - {format(viewDateRange.to!, 'MMM d, yyyy')})</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {walkingData.sort((a,b) => parseISO(b.date).getTime() - parseISO(a.date).getTime()).map((activity) => (
              <Card key={activity.date} className="shadow-sm hover:shadow-md transition-shadow rounded-lg">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{format(parseISO(activity.date), 'EEEE, MMMM d, yyyy')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p><strong>Steps:</strong> {activity.steps.toLocaleString()}</p>
                  <p><strong>Distance:</strong> {activity.distance} km</p>
                  <p><strong>Calories Out:</strong> {activity.caloriesOut.toLocaleString()}</p>
                  <p><strong>Active Minutes:</strong> {activity.activeMinutes}</p>
                </CardContent>
                <CardFooter className="text-xs text-muted-foreground">
                  Data Source: {activity.dataSource} (Last fetched: {format(parseISO(activity.lastFetched), 'PPpp')})
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
