
'use client';

import React, { useState, useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { updateDemographics } from '@/app/actions/auth'; // Assuming this action will be created/updated

const demographicsSchema = z.object({
  firstName: z.string()
    .min(3, "First name must be at least 3 characters.")
    .max(50, "First name cannot exceed 50 characters.")
    .regex(/^[a-zA-Z\s'-]+$/, "First name contains invalid characters.")
    .trim(),
  middleInitial: z.string().max(1, "Middle initial can be at most 1 character.").optional().trim(),
  lastName: z.string()
    .min(3, "Last name must be at least 3 characters.")
    .max(50, "Last name cannot exceed 50 characters.")
    .regex(/^[a-zA-Z\s'-]+$/, "Last name contains invalid characters.")
    .trim(),
  dateOfBirth: z.date({ required_error: "Date of birth is required."}),
  email: z.string().email(), // Usually read-only from auth
  cellPhone: z.string()
    .regex(/^$|^\d{3}-\d{3}-\d{4}$/, "Invalid phone format (e.g., 999-999-9999).")
    .optional(),
}).refine(data => data.email || data.cellPhone, {
    message: "At least one contact method (Email or Cell Phone) is required for Multi-Factor Authentication.",
    path: ["cellPhone"], // Show error near cellphone or a general form error
});

type DemographicsFormValues = z.infer<typeof demographicsSchema>;

interface DemographicsFormProps {
  userProfile: UserProfile;
  onProfileUpdate?: (updatedProfile: UserProfile | null) => void; // For optimistic updates or re-fetching
}

export default function DemographicsForm({ userProfile, onProfileUpdate }: DemographicsFormProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const form = useForm<DemographicsFormValues>({
    resolver: zodResolver(demographicsSchema),
    defaultValues: {
      firstName: userProfile.firstName || '',
      middleInitial: userProfile.middleInitial || '',
      lastName: userProfile.lastName || '',
      dateOfBirth: userProfile.dateOfBirth ? parseISO(userProfile.dateOfBirth) : undefined,
      email: userProfile.email, // Should be from auth, read-only
      cellPhone: userProfile.cellPhone || '',
    },
  });

  const onSubmit = (values: DemographicsFormValues) => {
    startTransition(async () => {
      // TODO: Implement server action to update demographics in Firestore
      const result = await updateDemographics(userProfile.id, {
        ...values,
        dateOfBirth: values.dateOfBirth.toISOString(), // Ensure ISO string for server
      });
      
      if (result.success) {
        toast({ title: "Demographics Updated", description: "Your information has been saved." });
        if (onProfileUpdate && result.data) {
          // onProfileUpdate(result.data); // If action returns updated profile
        }
      } else {
        toast({ title: "Update Failed", description: result.error || "Could not save demographics.", variant: "destructive" });
        // Handle specific field errors from result.details if provided by server action
        if (result.details?.fieldErrors) {
            Object.entries(result.details.fieldErrors).forEach(([field, messages]) => {
                form.setError(field as keyof DemographicsFormValues, { type: 'server', message: (messages as string[]).join(', ') });
            });
        }
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Demographic Information</CardTitle>
        <CardDescription>Please provide your personal details. Fields marked with * are required.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input id="firstName" {...form.register('firstName')} disabled={isPending} />
              {form.formState.errors.firstName && <p className="text-sm text-destructive">{form.formState.errors.firstName.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="middleInitial">Middle Initial</Label>
              <Input id="middleInitial" {...form.register('middleInitial')} disabled={isPending} />
              {form.formState.errors.middleInitial && <p className="text-sm text-destructive">{form.formState.errors.middleInitial.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input id="lastName" {...form.register('lastName')} disabled={isPending} />
              {form.formState.errors.lastName && <p className="text-sm text-destructive">{form.formState.errors.lastName.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateOfBirth">Date of Birth *</Label>
              <Controller
                name="dateOfBirth"
                control={form.control}
                render={({ field }) => (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant={"outline"}
                        className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}
                        disabled={isPending}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => date > new Date() || date < new Date("1900-01-01") || isPending}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                )}
              />
              {form.formState.errors.dateOfBirth && <p className="text-sm text-destructive">{form.formState.errors.dateOfBirth.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email (Login ID)</Label>
              <Input id="email" type="email" {...form.register('email')} readOnly disabled className="bg-muted/50" />
              {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cellPhone">Cell Phone (e.g., 123-456-7890)</Label>
              <Input id="cellPhone" {...form.register('cellPhone')} placeholder="___-___-____" disabled={isPending} />
              {form.formState.errors.cellPhone && <p className="text-sm text-destructive">{form.formState.errors.cellPhone.message}</p>}
            </div>
          </div>
           {form.formState.errors.root && <p className="text-sm text-destructive mt-2">{form.formState.errors.root.message}</p>}
           {(!form.getValues("email") && !form.getValues("cellPhone")) && <p className="text-sm text-destructive mt-2">At least Email or Cell Phone is required for MFA.</p>}

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Save Demographics'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
