
'use client';

import React, { useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import type { UserProfile, WalkingRadarGoals } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { updateWalkingRadarGoals } from '@/app/actions/userProfileActions';
import { Loader2 } from 'lucide-react';

const walkingGoalsSchema = z.object({
  maxDailySteps: z.preprocess(
    (val) => (val === "" || val === null ? undefined : Number(val)),
    z.number().positive("Must be a positive number").optional().nullable()
  ),
  maxDailyDistanceMeters: z.preprocess(
    (val) => (val === "" || val === null ? undefined : Number(val)),
    z.number().positive("Must be a positive number (meters)").optional().nullable()
  ),
  maxDailyDurationMinutes: z.preprocess( // Input in minutes
    (val) => (val === "" || val === null ? undefined : Number(val)),
    z.number().positive("Must be a positive number (minutes)").optional().nullable()
  ),
  maxDailySessions: z.preprocess(
    (val) => (val === "" || val === null ? undefined : Number(val)),
    z.number().positive("Must be a positive number").optional().nullable()
  ),
});

type WalkingGoalsFormValues = z.infer<typeof walkingGoalsSchema>;

interface WalkingGoalsFormProps {
  userProfile: UserProfile;
  onProfileUpdate?: (updatedProfileData: Partial<UserProfile>) => void;
}

export default function WalkingGoalsForm({ userProfile, onProfileUpdate }: WalkingGoalsFormProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const defaultGoals = userProfile.walkingRadarGoals || {};

  const form = useForm<WalkingGoalsFormValues>({
    resolver: zodResolver(walkingGoalsSchema),
    defaultValues: {
      maxDailySteps: defaultGoals.maxDailySteps || undefined,
      maxDailyDistanceMeters: defaultGoals.maxDailyDistanceMeters || undefined,
      maxDailyDurationMinutes: defaultGoals.maxDailyDurationSec ? defaultGoals.maxDailyDurationSec / 60 : undefined,
      maxDailySessions: defaultGoals.maxDailySessions || undefined,
    },
  });

  const onSubmit = (values: WalkingGoalsFormValues) => {
    startTransition(async () => {
      const goalsToSave: WalkingRadarGoals = {
        maxDailySteps: values.maxDailySteps === null ? undefined : values.maxDailySteps,
        maxDailyDistanceMeters: values.maxDailyDistanceMeters === null ? undefined : values.maxDailyDistanceMeters,
        maxDailyDurationSec: values.maxDailyDurationMinutes === null ? undefined : (values.maxDailyDurationMinutes ? values.maxDailyDurationMinutes * 60 : undefined),
        maxDailySessions: values.maxDailySessions === null ? undefined : values.maxDailySessions,
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
            form.setError(field as keyof WalkingGoalsFormValues, {
              type: 'server',
              message: (messages as string[])?.join(', '),
            });
          });
        }
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Walking Activity Goals</CardTitle>
        <CardDescription>
          Set your maximum daily goals for walking. These will be used to normalize your performance on the walking radar chart.
          Leave fields blank if you prefer to use app defaults.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="maxDailySteps">Max Daily Steps</Label>
              <Input
                id="maxDailySteps"
                type="number"
                placeholder="e.g., 10000"
                {...form.register('maxDailySteps')}
                disabled={isPending}
              />
              {form.formState.errors.maxDailySteps && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.maxDailySteps.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxDailyDistanceMeters">Max Daily Distance (meters)</Label>
              <Input
                id="maxDailyDistanceMeters"
                type="number"
                placeholder="e.g., 8000 (for 8km)"
                {...form.register('maxDailyDistanceMeters')}
                disabled={isPending}
              />
              {form.formState.errors.maxDailyDistanceMeters && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.maxDailyDistanceMeters.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxDailyDurationMinutes">Max Daily Duration (minutes)</Label>
              <Input
                id="maxDailyDurationMinutes"
                type="number"
                placeholder="e.g., 90 (for 1.5 hours)"
                {...form.register('maxDailyDurationMinutes')}
                disabled={isPending}
              />
              {form.formState.errors.maxDailyDurationMinutes && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.maxDailyDurationMinutes.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxDailySessions">Max Daily Sessions</Label>
              <Input
                id="maxDailySessions"
                type="number"
                placeholder="e.g., 2"
                {...form.register('maxDailySessions')}
                disabled={isPending}
              />
              {form.formState.errors.maxDailySessions && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.maxDailySessions.message}</p>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Save Walking Goals'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

    