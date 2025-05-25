
'use client';

import React, { useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import type { UserProfile, DashboardMetricIdValue } from '@/types';
import { AVAILABLE_DASHBOARD_METRICS, DashboardMetricId } from '@/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { updateDashboardRadarMetrics } from '@/app/actions/userProfileActions';
import { Loader2 } from 'lucide-react';

const allMetricIds = AVAILABLE_DASHBOARD_METRICS.map(m => m.id) as [DashboardMetricIdValue, ...DashboardMetricIdValue[]];

const dashboardMetricsFormSchema = z.object({
  selectedMetrics: z.array(z.enum(allMetricIds))
    .min(3, "Please select at least 3 metrics.")
    .max(5, "Please select no more than 5 metrics."),
});

type DashboardMetricsFormValues = z.infer<typeof dashboardMetricsFormSchema>;

interface DashboardMetricsFormProps {
  userProfile: UserProfile;
  onProfileUpdate?: (updatedProfileData: Partial<UserProfile>) => void;
}

const defaultSelectedMetrics: DashboardMetricIdValue[] = [
  DashboardMetricId.AVG_DAILY_STEPS,
  DashboardMetricId.AVG_SLEEP_DURATION,
  DashboardMetricId.AVG_ACTIVE_MINUTES,
  DashboardMetricId.RESTING_HEART_RATE,
];

export default function DashboardMetricsForm({ userProfile, onProfileUpdate }: DashboardMetricsFormProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const currentSelectedMetrics = userProfile.dashboardRadarMetrics || defaultSelectedMetrics;

  const form = useForm<DashboardMetricsFormValues>({
    resolver: zodResolver(dashboardMetricsFormSchema),
    defaultValues: {
      selectedMetrics: currentSelectedMetrics,
    },
  });

  const onSubmit = (values: DashboardMetricsFormValues) => {
    startTransition(async () => {
      const result = await updateDashboardRadarMetrics(values.selectedMetrics);

      if (result.success && result.data) {
        toast({ title: 'Dashboard Metrics Updated', description: 'Your dashboard radar chart preferences have been saved.' });
        if (onProfileUpdate) {
          onProfileUpdate({ dashboardRadarMetrics: result.data });
        }
      } else {
        toast({ title: 'Update Failed', description: result.error || 'Could not save dashboard metric preferences.', variant: 'destructive' });
        if (result.details?.fieldErrors?.selectedMetrics) {
          form.setError('selectedMetrics', {
            type: 'server',
            message: (result.details.fieldErrors.selectedMetrics as unknown as string[]).join(', '),
          });
        } else if (result.error) {
            form.setError("root.serverError" as any, {type: "server", message: result.error});
        }
      }
    });
  };
  
  const selectedCount = form.watch('selectedMetrics')?.length || 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dashboard Radar Chart Metrics</CardTitle>
        <CardDescription>
          Choose 3 to 5 key metrics you want to see on your main dashboard radar chart.
          Four common metrics are selected by default.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-3">
            <Label>Select metrics (current: {selectedCount}, min 3, max 5):</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {AVAILABLE_DASHBOARD_METRICS.map((metric) => (
                <Controller
                  key={metric.id}
                  name="selectedMetrics"
                  control={form.control}
                  render={({ field }) => {
                    const isChecked = field.value?.includes(metric.id);
                    return (
                      <div className="flex items-center space-x-2 p-2 border rounded-md hover:bg-muted/50 transition-colors">
                        <Checkbox
                          id={`metric-${metric.id}`}
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            const currentSelection = field.value || [];
                            if (checked) {
                              if (currentSelection.length < 5) {
                                field.onChange([...currentSelection, metric.id]);
                              } else {
                                toast({
                                  title: "Selection Limit Reached",
                                  description: "You can select a maximum of 5 metrics.",
                                  variant: "default",
                                });
                                // Revert the checkbox state visually if limit is exceeded
                                // This requires a bit more to force a re-render or prevent the optimistic update
                                // For now, we rely on the toast and Zod validation on submit.
                                return false; // To prevent visual check if over limit (might not work perfectly with Shadcn Checkbox internal state)
                              }
                            } else {
                              field.onChange(currentSelection.filter((id) => id !== metric.id));
                            }
                          }}
                        />
                        <Label htmlFor={`metric-${metric.id}`} className="cursor-pointer flex-1">
                          {metric.label} {metric.unit && `(${metric.unit})`}
                        </Label>
                      </div>
                    );
                  }}
                />
              ))}
            </div>
            {form.formState.errors.selectedMetrics && (
              <p className="text-sm text-destructive mt-2">{form.formState.errors.selectedMetrics.message}</p>
            )}
             {form.formState.errors.root?.serverError && (
                <p className="text-sm text-destructive mt-1">{(form.formState.errors.root.serverError as any).message}</p>
             )}
          </div>
          <CardFooter className="px-0 pt-6">
            <Button type="submit" disabled={isPending} className="ml-auto">
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Save Dashboard Preferences'}
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
}
