
'use client';

import React, { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import type { UserProfile, SleepRadarGoals } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { updateSleepRadarGoals } from '@/app/actions/userProfileActions';
import { Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

const optionalNonNegativeNumberWithEmptyAsUndefined = z.preprocess(
  (val) => (val === "" || val === null || val === undefined ? undefined : Number(val)),
  z.number().nonnegative("Must be a non-negative number (0 or more).").optional().nullable()
);

const sleepGoalsFormSchema = z.object({
  targetSleepDurationHours: optionalNonNegativeNumberWithEmptyAsUndefined,
  minSleepEfficiencyPercent: optionalNonNegativeNumberWithEmptyAsUndefined.refine(val => val === undefined || val === null || (val >= 0 && val <= 100), {
    message: "Efficiency must be between 0 and 100.",
  }),
  minTimeInDeepSleepMinutes: optionalNonNegativeNumberWithEmptyAsUndefined,
  minTimeInRemSleepMinutes: optionalNonNegativeNumberWithEmptyAsUndefined,
});

type SleepGoalsFormValues = z.infer<typeof sleepGoalsFormSchema>;

interface SleepGoalsFormProps {
  userProfile: UserProfile;
  onProfileUpdate?: (updatedProfileData: Partial<UserProfile>) => void;
}

export default function SleepGoalsForm({ userProfile, onProfileUpdate }: SleepGoalsFormProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const defaultGoals = userProfile.sleepRadarGoals || {};

  const form = useForm<SleepGoalsFormValues>({
    resolver: zodResolver(sleepGoalsFormSchema),
    defaultValues: {
      targetSleepDurationHours: defaultGoals.targetSleepDurationHours ?? undefined,
      minSleepEfficiencyPercent: defaultGoals.minSleepEfficiencyPercent ?? undefined,
      minTimeInDeepSleepMinutes: defaultGoals.minTimeInDeepSleepMinutes ?? undefined,
      minTimeInRemSleepMinutes: defaultGoals.minTimeInRemSleepMinutes ?? undefined,
    },
  });

  const onSubmit = (values: SleepGoalsFormValues) => {
    startTransition(async () => {
      const goalsToSave: SleepRadarGoals = {
        targetSleepDurationHours: values.targetSleepDurationHours === null ? undefined : values.targetSleepDurationHours,
        minSleepEfficiencyPercent: values.minSleepEfficiencyPercent === null ? undefined : values.minSleepEfficiencyPercent,
        minTimeInDeepSleepMinutes: values.minTimeInDeepSleepMinutes === null ? undefined : values.minTimeInDeepSleepMinutes,
        minTimeInRemSleepMinutes: values.minTimeInRemSleepMinutes === null ? undefined : values.minTimeInRemSleepMinutes,
      };
      
      const result = await updateSleepRadarGoals(goalsToSave);

      if (result.success) {
        toast({ title: 'Sleep Goals Updated', description: 'Your sleep radar chart goals have been saved.' });
        if (onProfileUpdate && result.data) {
          onProfileUpdate({ sleepRadarGoals: result.data });
        }
      } else {
        toast({ title: 'Update Failed', description: result.error || 'Could not save sleep goals.', variant: 'destructive' });
        if (result.details?.fieldErrors) {
          Object.entries(result.details.fieldErrors).forEach(([field, messages]) => {
            if (field in form.getValues()) {
                form.setError(field as keyof SleepGoalsFormValues, {
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
        <CardTitle>Sleep Goals</CardTitle>
        <CardDescription>
          Set your target or minimum daily goals for sleep. These will be used to visualize your performance on the sleep radar chart.
          Leave fields blank if you prefer to use app defaults.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {form.formState.errors.root?.serverError && (
            <p className="text-sm text-destructive mt-1">{(form.formState.errors.root.serverError as any).message}</p>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <div className="space-y-2">
              <Label htmlFor="targetSleepDurationHours">Target Sleep Duration (hours)</Label>
              <Input id="targetSleepDurationHours" type="number" step="0.1" placeholder="e.g., 8" {...form.register('targetSleepDurationHours')} disabled={isPending} />
              {form.formState.errors.targetSleepDurationHours && <p className="text-sm text-destructive mt-1">{form.formState.errors.targetSleepDurationHours.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="minSleepEfficiencyPercent">Min Sleep Efficiency (%)</Label>
              <Input id="minSleepEfficiencyPercent" type="number" placeholder="e.g., 85" {...form.register('minSleepEfficiencyPercent')} disabled={isPending} />
              {form.formState.errors.minSleepEfficiencyPercent && <p className="text-sm text-destructive mt-1">{form.formState.errors.minSleepEfficiencyPercent.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="minTimeInDeepSleepMinutes">Min Time in Deep Sleep (minutes)</Label>
              <Input id="minTimeInDeepSleepMinutes" type="number" placeholder="e.g., 90" {...form.register('minTimeInDeepSleepMinutes')} disabled={isPending} />
              {form.formState.errors.minTimeInDeepSleepMinutes && <p className="text-sm text-destructive mt-1">{form.formState.errors.minTimeInDeepSleepMinutes.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="minTimeInRemSleepMinutes">Min Time in REM Sleep (minutes)</Label>
              <Input id="minTimeInRemSleepMinutes" type="number" placeholder="e.g., 90" {...form.register('minTimeInRemSleepMinutes')} disabled={isPending} />
              {form.formState.errors.minTimeInRemSleepMinutes && <p className="text-sm text-destructive mt-1">{form.formState.errors.minTimeInRemSleepMinutes.message}</p>}
            </div>
          </div>

          <CardFooter className="px-0 pt-8">
            <Button type="submit" disabled={isPending} className="ml-auto">
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Save Sleep Goals'}
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
}
