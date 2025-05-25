
'use client';

import React, { useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import type { UserProfile, WalkingRadarGoals } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { updateWalkingRadarGoals } from '@/app/actions/userProfileActions';
import { Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

// Schema for validating individual goal values in the form
const optionalNonNegativeNumberWithEmptyAsUndefined = z.preprocess(
  (val) => (val === "" || val === null || val === undefined ? undefined : Number(val)),
  z.number().nonnegative("Must be a non-negative number (0 or more).").optional().nullable()
);

const walkingGoalsFormSchema = z.object({
  // Maximums
  maxDailySteps: optionalNonNegativeNumberWithEmptyAsUndefined,
  maxDailyDistanceMeters: optionalNonNegativeNumberWithEmptyAsUndefined,
  maxDailyDurationMinutes: optionalNonNegativeNumberWithEmptyAsUndefined, // Input in minutes
  maxDailySessions: optionalNonNegativeNumberWithEmptyAsUndefined,
  // Minimums
  minDailySteps: optionalNonNegativeNumberWithEmptyAsUndefined,
  minDailyDistanceMeters: optionalNonNegativeNumberWithEmptyAsUndefined,
  minDailyDurationMinutes: optionalNonNegativeNumberWithEmptyAsUndefined, // Input in minutes
  minDailySessions: optionalNonNegativeNumberWithEmptyAsUndefined,
}).superRefine((data, ctx) => { // superRefine for cross-field validation
  const checkMinMax = (minVal?: number | null, maxVal?: number | null, fieldNamePrefix?: string) => {
    if (minVal !== undefined && minVal !== null && maxVal !== undefined && maxVal !== null && minVal > maxVal) {
      if (fieldNamePrefix) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Min ${fieldNamePrefix.toLowerCase()} cannot be greater than Max ${fieldNamePrefix.toLowerCase()}.`,
            path: [`min${fieldNamePrefix}`], // Report error on min field
          });
           ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Max ${fieldNamePrefix.toLowerCase()} cannot be less than Min ${fieldNamePrefix.toLowerCase()}.`,
            path: [`max${fieldNamePrefix}`], // Optionally report on max field too
          });
      } else {
         ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Minimum value cannot be greater than its corresponding maximum value.",
            path: ['minDailySteps'], // Generic path if no prefix
          });
      }
    }
  };

  checkMinMax(data.minDailySteps, data.maxDailySteps, "DailySteps");
  checkMinMax(data.minDailyDistanceMeters, data.maxDailyDistanceMeters, "DailyDistanceMeters");
  checkMinMax(data.minDailyDurationMinutes, data.maxDailyDurationMinutes, "DailyDurationMinutes");
  checkMinMax(data.minDailySessions, data.maxDailySessions, "DailySessions");
});


type WalkingGoalsFormValues = z.infer<typeof walkingGoalsFormSchema>;

interface WalkingGoalsFormProps {
  userProfile: UserProfile;
  onProfileUpdate?: (updatedProfileData: Partial<UserProfile>) => void;
}

export default function WalkingGoalsForm({ userProfile, onProfileUpdate }: WalkingGoalsFormProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const defaultGoals = userProfile.walkingRadarGoals || {};

  const form = useForm<WalkingGoalsFormValues>({
    resolver: zodResolver(walkingGoalsFormSchema),
    defaultValues: {
      maxDailySteps: defaultGoals.maxDailySteps ?? undefined,
      maxDailyDistanceMeters: defaultGoals.maxDailyDistanceMeters ?? undefined,
      maxDailyDurationMinutes: defaultGoals.maxDailyDurationSec !== undefined && defaultGoals.maxDailyDurationSec !== null ? defaultGoals.maxDailyDurationSec / 60 : undefined,
      maxDailySessions: defaultGoals.maxDailySessions ?? undefined,
      minDailySteps: defaultGoals.minDailySteps ?? undefined,
      minDailyDistanceMeters: defaultGoals.minDailyDistanceMeters ?? undefined,
      minDailyDurationMinutes: defaultGoals.minDailyDurationSec !== undefined && defaultGoals.minDailyDurationSec !== null ? defaultGoals.minDailyDurationSec / 60 : undefined,
      minDailySessions: defaultGoals.minDailySessions ?? undefined,
    },
  });

  const onSubmit = (values: WalkingGoalsFormValues) => {
    startTransition(async () => {
      const goalsToSave: WalkingRadarGoals = {
        maxDailySteps: values.maxDailySteps === null ? undefined : values.maxDailySteps,
        maxDailyDistanceMeters: values.maxDailyDistanceMeters === null ? undefined : values.maxDailyDistanceMeters,
        maxDailyDurationSec: values.maxDailyDurationMinutes === null ? undefined : (values.maxDailyDurationMinutes !== undefined ? values.maxDailyDurationMinutes * 60 : undefined),
        maxDailySessions: values.maxDailySessions === null ? undefined : values.maxDailySessions,
        minDailySteps: values.minDailySteps === null ? undefined : values.minDailySteps,
        minDailyDistanceMeters: values.minDailyDistanceMeters === null ? undefined : values.minDailyDistanceMeters,
        minDailyDurationSec: values.minDailyDurationMinutes === null ? undefined : (values.minDailyDurationMinutes !== undefined ? values.minDailyDurationMinutes * 60 : undefined),
        minDailySessions: values.minDailySessions === null ? undefined : values.minDailySessions,
      };
      
      const result = await updateWalkingRadarGoals(goalsToSave);

      if (result.success) {
        toast({ title: 'Walking Goals Updated', description: 'Your walking radar chart goals have been saved.' });
        if (onProfileUpdate && result.data) {
          onProfileUpdate({ walkingRadarGoals: result.data });
        }
      } else {
        toast({ title: 'Update Failed', description: result.error || 'Could not save walking goals.', variant: 'destructive' });
        if (result.details?.fieldErrors) {
          Object.entries(result.details.fieldErrors).forEach(([field, messages]) => {
            // Check if the field exists in WalkingGoalsFormValues before setting error
            if (field in form.getValues()) {
                form.setError(field as keyof WalkingGoalsFormValues, {
                type: 'server',
                message: (messages as string[])?.join(', '),
                });
            } else {
                // Handle form-level errors (from .refine or .superRefine without a specific path)
                form.setError("root.serverError" as any, { // Use a generic root error
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
        <CardTitle>Walking Activity Goals</CardTitle>
        <CardDescription>
          Set your minimum and maximum daily goals for walking. These will be used to normalize your performance on the walking radar chart and provide feedback.
          Leave fields blank if you prefer to use app defaults (min: 0, max: varies by metric).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {form.formState.errors.root?.serverError && (
            <p className="text-sm text-destructive mt-1">{(form.formState.errors.root.serverError as any).message}</p>
          )}
          {/* STEPS */}
          <div>
            <h3 className="text-lg font-medium mb-2">Daily Steps</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-2">
                <Label htmlFor="minDailySteps">Min Daily Steps</Label>
                <Input id="minDailySteps" type="number" placeholder="e.g., 0" {...form.register('minDailySteps')} disabled={isPending} />
                {form.formState.errors.minDailySteps && <p className="text-sm text-destructive mt-1">{form.formState.errors.minDailySteps.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxDailySteps">Max Daily Steps</Label>
                <Input id="maxDailySteps" type="number" placeholder="e.g., 10000" {...form.register('maxDailySteps')} disabled={isPending} />
                {form.formState.errors.maxDailySteps && <p className="text-sm text-destructive mt-1">{form.formState.errors.maxDailySteps.message}</p>}
              </div>
            </div>
          </div>
          <Separator />

          {/* DISTANCE */}
          <div>
            <h3 className="text-lg font-medium mb-2">Daily Distance (meters)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-2">
                <Label htmlFor="minDailyDistanceMeters">Min Daily Distance (m)</Label>
                <Input id="minDailyDistanceMeters" type="number" placeholder="e.g., 0" {...form.register('minDailyDistanceMeters')} disabled={isPending} />
                {form.formState.errors.minDailyDistanceMeters && <p className="text-sm text-destructive mt-1">{form.formState.errors.minDailyDistanceMeters.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxDailyDistanceMeters">Max Daily Distance (m)</Label>
                <Input id="maxDailyDistanceMeters" type="number" placeholder="e.g., 8000 (for 8km)" {...form.register('maxDailyDistanceMeters')} disabled={isPending} />
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
                <Label htmlFor="minDailyDurationMinutes">Min Daily Duration (min)</Label>
                <Input id="minDailyDurationMinutes" type="number" placeholder="e.g., 0" {...form.register('minDailyDurationMinutes')} disabled={isPending} />
                {form.formState.errors.minDailyDurationMinutes && <p className="text-sm text-destructive mt-1">{form.formState.errors.minDailyDurationMinutes.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxDailyDurationMinutes">Max Daily Duration (min)</Label>
                <Input id="maxDailyDurationMinutes" type="number" placeholder="e.g., 90 (for 1.5 hours)" {...form.register('maxDailyDurationMinutes')} disabled={isPending} />
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
                <Label htmlFor="minDailySessions">Min Daily Sessions</Label>
                <Input id="minDailySessions" type="number" placeholder="e.g., 0" {...form.register('minDailySessions')} disabled={isPending} />
                {form.formState.errors.minDailySessions && <p className="text-sm text-destructive mt-1">{form.formState.errors.minDailySessions.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxDailySessions">Max Daily Sessions</Label>
                <Input id="maxDailySessions" type="number" placeholder="e.g., 2" {...form.register('maxDailySessions')} disabled={isPending} />
                {form.formState.errors.maxDailySessions && <p className="text-sm text-destructive mt-1">{form.formState.errors.maxDailySessions.message}</p>}
              </div>
            </div>
          </div>

          <CardFooter className="px-0 pt-8">
            <Button type="submit" disabled={isPending} className="ml-auto">
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Save Walking Goals'}
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
}
```