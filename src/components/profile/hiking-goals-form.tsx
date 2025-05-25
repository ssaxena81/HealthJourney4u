
'use client';

import React, { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import type { UserProfile, HikingRadarGoals } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { updateHikingRadarGoals } from '@/app/actions/userProfileActions';
import { Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

const optionalNonNegativeNumberWithEmptyAsUndefined = z.preprocess(
  (val) => (val === "" || val === null || val === undefined ? undefined : Number(val)),
  z.number().nonnegative("Must be a non-negative number (0 or more).").optional().nullable()
);

const hikingGoalsFormSchema = z.object({
  maxDailyDistanceMeters: optionalNonNegativeNumberWithEmptyAsUndefined,
  maxDailyDurationMinutes: optionalNonNegativeNumberWithEmptyAsUndefined,
  maxDailySessions: optionalNonNegativeNumberWithEmptyAsUndefined,
  maxDailyElevationGainMeters: optionalNonNegativeNumberWithEmptyAsUndefined,
  minDailyDistanceMeters: optionalNonNegativeNumberWithEmptyAsUndefined,
  minDailyDurationMinutes: optionalNonNegativeNumberWithEmptyAsUndefined,
  minDailySessions: optionalNonNegativeNumberWithEmptyAsUndefined,
  minDailyElevationGainMeters: optionalNonNegativeNumberWithEmptyAsUndefined,
}).superRefine((data, ctx) => {
  const checkMinMax = (minVal?: number | null, maxVal?: number | null, fieldNamePrefix?: string, minPath?: keyof typeof data, maxPath?: keyof typeof data) => {
    if (minVal !== undefined && minVal !== null && maxVal !== undefined && maxVal !== null && minVal > maxVal) {
      const msg = `Min ${fieldNamePrefix ? fieldNamePrefix.toLowerCase() : ''} cannot be greater than Max ${fieldNamePrefix ? fieldNamePrefix.toLowerCase() : ''}.`;
      if (minPath) ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg, path: [minPath] });
      if (maxPath) ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg, path: [maxPath] });
    }
  };
  checkMinMax(data.minDailyDistanceMeters, data.maxDailyDistanceMeters, "DailyDistanceMeters", "minDailyDistanceMeters", "maxDailyDistanceMeters");
  checkMinMax(data.minDailyDurationMinutes, data.maxDailyDurationMinutes, "DailyDurationMinutes", "minDailyDurationMinutes", "maxDailyDurationMinutes");
  checkMinMax(data.minDailySessions, data.maxDailySessions, "DailySessions", "minDailySessions", "maxDailySessions");
  checkMinMax(data.minDailyElevationGainMeters, data.maxDailyElevationGainMeters, "DailyElevationGainMeters", "minDailyElevationGainMeters", "maxDailyElevationGainMeters");
});

type HikingGoalsFormValues = z.infer<typeof hikingGoalsFormSchema>;

interface HikingGoalsFormProps {
  userProfile: UserProfile;
  onProfileUpdate?: (updatedProfileData: Partial<UserProfile>) => void;
}

export default function HikingGoalsForm({ userProfile, onProfileUpdate }: HikingGoalsFormProps) {
  const { toast } from useToast();
  const [isPending, startTransition] = useTransition();

  const defaultGoals = userProfile.hikingRadarGoals || {};

  const form = useForm<HikingGoalsFormValues>({
    resolver: zodResolver(hikingGoalsFormSchema),
    defaultValues: {
      maxDailyDistanceMeters: defaultGoals.maxDailyDistanceMeters ?? undefined,
      maxDailyDurationMinutes: defaultGoals.maxDailyDurationSec !== undefined && defaultGoals.maxDailyDurationSec !== null ? defaultGoals.maxDailyDurationSec / 60 : undefined,
      maxDailySessions: defaultGoals.maxDailySessions ?? undefined,
      maxDailyElevationGainMeters: defaultGoals.maxDailyElevationGainMeters ?? undefined,
      minDailyDistanceMeters: defaultGoals.minDailyDistanceMeters ?? undefined,
      minDailyDurationMinutes: defaultGoals.minDailyDurationSec !== undefined && defaultGoals.minDailyDurationSec !== null ? defaultGoals.minDailyDurationSec / 60 : undefined,
      minDailySessions: defaultGoals.minDailySessions ?? undefined,
      minDailyElevationGainMeters: defaultGoals.minDailyElevationGainMeters ?? undefined,
    },
  });

  const onSubmit = (values: HikingGoalsFormValues) => {
    startTransition(async () => {
      const goalsToSave: HikingRadarGoals = {
        maxDailyDistanceMeters: values.maxDailyDistanceMeters === null ? undefined : values.maxDailyDistanceMeters,
        maxDailyDurationSec: values.maxDailyDurationMinutes === null ? undefined : (values.maxDailyDurationMinutes !== undefined ? values.maxDailyDurationMinutes * 60 : undefined),
        maxDailySessions: values.maxDailySessions === null ? undefined : values.maxDailySessions,
        maxDailyElevationGainMeters: values.maxDailyElevationGainMeters === null ? undefined : values.maxDailyElevationGainMeters,
        minDailyDistanceMeters: values.minDailyDistanceMeters === null ? undefined : values.minDailyDistanceMeters,
        minDailyDurationSec: values.minDailyDurationMinutes === null ? undefined : (values.minDailyDurationMinutes !== undefined ? values.minDailyDurationMinutes * 60 : undefined),
        minDailySessions: values.minDailySessions === null ? undefined : values.minDailySessions,
        minDailyElevationGainMeters: values.minDailyElevationGainMeters === null ? undefined : values.minDailyElevationGainMeters,
      };
      
      const result = await updateHikingRadarGoals(goalsToSave);

      if (result.success) {
        toast({ title: 'Hiking Goals Updated', description: 'Your hiking radar chart goals have been saved.' });
        if (onProfileUpdate && result.data) {
          onProfileUpdate({ hikingRadarGoals: result.data });
        }
      } else {
        toast({ title: 'Update Failed', description: result.error || 'Could not save hiking goals.', variant: 'destructive' });
        if (result.details?.fieldErrors) {
          Object.entries(result.details.fieldErrors).forEach(([field, messages]) => {
            if (field in form.getValues()) {
                form.setError(field as keyof HikingGoalsFormValues, {
                type: 'server',
                message: (messages as string[])?.join(', '),
                });
            } else {
                form.setError("root.serverError" as any, { 
                    type: "server",
                    message: (messages as string[])?.join(', ') || result.error
                });
            }
          });
        } else if (result.error) {
            form.setError("root.serverError" as any, {type: "server", message: result.error});
        }
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hiking Activity Goals</CardTitle>
        <CardDescription>
          Set your minimum and maximum daily goals for hiking. These will be used to normalize your performance on the hiking radar chart and provide feedback.
          Leave fields blank if you prefer to use app defaults (min: 0, max: varies by metric).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {form.formState.errors.root?.serverError && (
            <p className="text-sm text-destructive mt-1">{(form.formState.errors.root.serverError as any).message}</p>
          )}
          
          {/* DISTANCE */}
          <div>
            <h3 className="text-lg font-medium mb-2">Daily Distance (meters)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-2">
                <Label htmlFor="minDailyDistanceMetersHiking">Min Daily Distance (m)</Label>
                <Input id="minDailyDistanceMetersHiking" type="number" placeholder="e.g., 0" {...form.register('minDailyDistanceMeters')} disabled={isPending} />
                {form.formState.errors.minDailyDistanceMeters && <p className="text-sm text-destructive mt-1">{form.formState.errors.minDailyDistanceMeters.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxDailyDistanceMetersHiking">Max Daily Distance (m)</Label>
                <Input id="maxDailyDistanceMetersHiking" type="number" placeholder="e.g., 10000 (for 10km)" {...form.register('maxDailyDistanceMeters')} disabled={isPending} />
                {form.formState.errors.maxDailyDistanceMeters && <p className="text-sm text-destructive mt-1">{form.formState.errors.maxDailyDistanceMeters.message}</p>}
              </div>
            </div>
          </div>
          <Separator />

          {/* DURATION */}
          <div>
            <h3 className="text-lg font-medium mb-2">Daily Duration (minutes)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-2">
                <Label htmlFor="minDailyDurationMinutesHiking">Min Daily Duration (min)</Label>
                <Input id="minDailyDurationMinutesHiking" type="number" placeholder="e.g., 0" {...form.register('minDailyDurationMinutes')} disabled={isPending} />
                {form.formState.errors.minDailyDurationMinutes && <p className="text-sm text-destructive mt-1">{form.formState.errors.minDailyDurationMinutes.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxDailyDurationMinutesHiking">Max Daily Duration (min)</Label>
                <Input id="maxDailyDurationMinutesHiking" type="number" placeholder="e.g., 120 (for 2 hours)" {...form.register('maxDailyDurationMinutes')} disabled={isPending} />
                {form.formState.errors.maxDailyDurationMinutes && <p className="text-sm text-destructive mt-1">{form.formState.errors.maxDailyDurationMinutes.message}</p>}
              </div>
            </div>
          </div>
          <Separator />

          {/* SESSIONS */}
          <div>
            <h3 className="text-lg font-medium mb-2">Daily Sessions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-2">
                <Label htmlFor="minDailySessionsHiking">Min Daily Sessions</Label>
                <Input id="minDailySessionsHiking" type="number" placeholder="e.g., 0" {...form.register('minDailySessions')} disabled={isPending} />
                {form.formState.errors.minDailySessions && <p className="text-sm text-destructive mt-1">{form.formState.errors.minDailySessions.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxDailySessionsHiking">Max Daily Sessions</Label>
                <Input id="maxDailySessionsHiking" type="number" placeholder="e.g., 1" {...form.register('maxDailySessions')} disabled={isPending} />
                {form.formState.errors.maxDailySessions && <p className="text-sm text-destructive mt-1">{form.formState.errors.maxDailySessions.message}</p>}
              </div>
            </div>
          </div>
          <Separator />

          {/* ELEVATION GAIN */}
          <div>
            <h3 className="text-lg font-medium mb-2">Daily Elevation Gain (meters)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-2">
                <Label htmlFor="minDailyElevationGainMetersHiking">Min Daily Elevation Gain (m)</Label>
                <Input id="minDailyElevationGainMetersHiking" type="number" placeholder="e.g., 0" {...form.register('minDailyElevationGainMeters')} disabled={isPending} />
                {form.formState.errors.minDailyElevationGainMeters && <p className="text-sm text-destructive mt-1">{form.formState.errors.minDailyElevationGainMeters.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxDailyElevationGainMetersHiking">Max Daily Elevation Gain (m)</Label>
                <Input id="maxDailyElevationGainMetersHiking" type="number" placeholder="e.g., 500" {...form.register('maxDailyElevationGainMeters')} disabled={isPending} />
                {form.formState.errors.maxDailyElevationGainMeters && <p className="text-sm text-destructive mt-1">{form.formState.errors.maxDailyElevationGainMeters.message}</p>}
              </div>
            </div>
          </div>


          <CardFooter className="px-0 pt-8">
            <Button type="submit" disabled={isPending} className="ml-auto">
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Save Hiking Goals'}
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
}
