
'use client';

import React, { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import type { UserProfile, SwimmingRadarGoals } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { updateSwimmingRadarGoals } from '@/app/actions/userProfileActions';
import { Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

const optionalNonNegativeNumberWithEmptyAsUndefined = z.preprocess(
  (val) => (val === "" || val === null || val === undefined ? undefined : Number(val)),
  z.number().nonnegative("Must be a non-negative number (0 or more).").optional().nullable()
);

const swimmingGoalsFormSchema = z.object({
  maxDailyDistanceMeters: optionalNonNegativeNumberWithEmptyAsUndefined,
  maxDailyDurationMinutes: optionalNonNegativeNumberWithEmptyAsUndefined,
  maxDailySessions: optionalNonNegativeNumberWithEmptyAsUndefined,
  minDailyDistanceMeters: optionalNonNegativeNumberWithEmptyAsUndefined,
  minDailyDurationMinutes: optionalNonNegativeNumberWithEmptyAsUndefined,
  minDailySessions: optionalNonNegativeNumberWithEmptyAsUndefined,
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
});

type SwimmingGoalsFormValues = z.infer<typeof swimmingGoalsFormSchema>;

interface SwimmingGoalsFormProps {
  userProfile: UserProfile;
  onProfileUpdate?: (updatedProfileData: Partial<UserProfile>) => void;
}

export default function SwimmingGoalsForm({ userProfile, onProfileUpdate }: SwimmingGoalsFormProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const defaultGoals = userProfile.swimmingRadarGoals || {};

  const form = useForm<SwimmingGoalsFormValues>({
    resolver: zodResolver(swimmingGoalsFormSchema),
    defaultValues: {
      maxDailyDistanceMeters: defaultGoals.maxDailyDistanceMeters ?? undefined,
      maxDailyDurationMinutes: defaultGoals.maxDailyDurationSec !== undefined && defaultGoals.maxDailyDurationSec !== null ? defaultGoals.maxDailyDurationSec / 60 : undefined,
      maxDailySessions: defaultGoals.maxDailySessions ?? undefined,
      minDailyDistanceMeters: defaultGoals.minDailyDistanceMeters ?? undefined,
      minDailyDurationMinutes: defaultGoals.minDailyDurationSec !== undefined && defaultGoals.minDailyDurationSec !== null ? defaultGoals.minDailyDurationSec / 60 : undefined,
      minDailySessions: defaultGoals.minDailySessions ?? undefined,
    },
  });

  const onSubmit = (values: SwimmingGoalsFormValues) => {
    startTransition(async () => {
      const goalsToSave: SwimmingRadarGoals = {
        maxDailyDistanceMeters: values.maxDailyDistanceMeters === null ? undefined : values.maxDailyDistanceMeters,
        maxDailyDurationSec: values.maxDailyDurationMinutes === null ? undefined : (values.maxDailyDurationMinutes !== undefined ? values.maxDailyDurationMinutes * 60 : undefined),
        maxDailySessions: values.maxDailySessions === null ? undefined : values.maxDailySessions,
        minDailyDistanceMeters: values.minDailyDistanceMeters === null ? undefined : values.minDailyDistanceMeters,
        minDailyDurationSec: values.minDailyDurationMinutes === null ? undefined : (values.minDailyDurationMinutes !== undefined ? values.minDailyDurationMinutes * 60 : undefined),
        minDailySessions: values.minDailySessions === null ? undefined : values.minDailySessions,
      };
      
      const result = await updateSwimmingRadarGoals(goalsToSave);

      if (result.success) {
        toast({ title: 'Swimming Goals Updated', description: 'Your swimming radar chart goals have been saved.' });
        if (onProfileUpdate && result.data) {
          onProfileUpdate({ swimmingRadarGoals: result.data });
        }
      } else {
        toast({ title: 'Update Failed', description: result.error || 'Could not save swimming goals.', variant: 'destructive' });
        if (result.details?.fieldErrors) {
          Object.entries(result.details.fieldErrors).forEach(([field, messages]) => {
            if (field in form.getValues()) {
                form.setError(field as keyof SwimmingGoalsFormValues, {
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
        <CardTitle>Swimming Activity Goals</CardTitle>
        <CardDescription>
          Set your minimum and maximum daily goals for swimming. These will be used to normalize your performance on the swimming radar chart and provide feedback.
          Leave fields blank if you prefer to use app defaults (min: 0, max: varies by metric).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {form.formState.errors.root?.serverError && (
            <p className="text-sm text-destructive mt-1">{(form.formState.errors.root.serverError as any).message}</p>
          )}
          
          <div>
            <h3 className="text-lg font-medium mb-2">Daily Distance (meters)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-2">
                <Label htmlFor="minDailyDistanceMetersSwimming">Min Daily Distance (m)</Label>
                <Input id="minDailyDistanceMetersSwimming" type="number" placeholder="e.g., 0" {...form.register('minDailyDistanceMeters')} disabled={isPending} />
                {form.formState.errors.minDailyDistanceMeters && <p className="text-sm text-destructive mt-1">{form.formState.errors.minDailyDistanceMeters.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxDailyDistanceMetersSwimming">Max Daily Distance (m)</Label>
                <Input id="maxDailyDistanceMetersSwimming" type="number" placeholder="e.g., 1500 (for 1.5km)" {...form.register('maxDailyDistanceMeters')} disabled={isPending} />
                {form.formState.errors.maxDailyDistanceMeters && <p className="text-sm text-destructive mt-1">{form.formState.errors.maxDailyDistanceMeters.message}</p>}
              </div>
            </div>
          </div>
          <Separator />

          <div>
            <h3 className="text-lg font-medium mb-2">Daily Duration (minutes)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-2">
                <Label htmlFor="minDailyDurationMinutesSwimming">Min Daily Duration (min)</Label>
                <Input id="minDailyDurationMinutesSwimming" type="number" placeholder="e.g., 0" {...form.register('minDailyDurationMinutes')} disabled={isPending} />
                {form.formState.errors.minDailyDurationMinutes && <p className="text-sm text-destructive mt-1">{form.formState.errors.minDailyDurationMinutes.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxDailyDurationMinutesSwimming">Max Daily Duration (min)</Label>
                <Input id="maxDailyDurationMinutesSwimming" type="number" placeholder="e.g., 45" {...form.register('maxDailyDurationMinutes')} disabled={isPending} />
                {form.formState.errors.maxDailyDurationMinutes && <p className="text-sm text-destructive mt-1">{form.formState.errors.maxDailyDurationMinutes.message}</p>}
              </div>
            </div>
          </div>
          <Separator />

          <div>
            <h3 className="text-lg font-medium mb-2">Daily Sessions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-2">
                <Label htmlFor="minDailySessionsSwimming">Min Daily Sessions</Label>
                <Input id="minDailySessionsSwimming" type="number" placeholder="e.g., 0" {...form.register('minDailySessions')} disabled={isPending} />
                {form.formState.errors.minDailySessions && <p className="text-sm text-destructive mt-1">{form.formState.errors.minDailySessions.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxDailySessionsSwimming">Max Daily Sessions</Label>
                <Input id="maxDailySessionsSwimming" type="number" placeholder="e.g., 1" {...form.register('maxDailySessions')} disabled={isPending} />
                {form.formState.errors.maxDailySessions && <p className="text-sm text-destructive mt-1">{form.formState.errors.maxDailySessions.message}</p>}
              </div>
            </div>
          </div>

          <CardFooter className="px-0 pt-8">
            <Button type="submit" disabled={isPending} className="ml-auto">
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Save Swimming Goals'}
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
}
