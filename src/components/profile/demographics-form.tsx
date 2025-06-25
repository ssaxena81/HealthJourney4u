
'use client';

import React, { useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { updateUserDemographics } from '@/lib/firebase/client-firestore';


// --- Date of Birth Helpers ---
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const monthMap: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const days = Array.from({ length: 31 }, (_, i) => String(i + 1));
const currentYear = new Date().getFullYear();
const years = Array.from({ length: 100 }, (_, i) => String(currentYear - i));


const demographicsSchema = z.object({
  firstName: z.string().min(2, "First name is required."),
  lastName: z.string().min(2, "Last name is required."),
  birthMonth: z.enum(months, { required_error: "Month is required." }),
  birthDay: z.string({ required_error: "Day is required." }).nonempty("Day is required."),
  birthYear: z.string({ required_error: "Year is required." }).nonempty("Year is required."),
  email: z.string().email(),
});

type DemographicsFormValues = z.infer<typeof demographicsSchema>;

interface DemographicsFormProps {
  userProfile: UserProfile;
}

export default function DemographicsForm({ userProfile }: DemographicsFormProps) {
  const { toast } = useToast();
  const { user, setUserProfile } = useAuth();
  const [isPending, startTransition] = useTransition();
  
  const dob = userProfile.dateOfBirth ? new Date(userProfile.dateOfBirth) : null;

  const form = useForm<DemographicsFormValues>({
    resolver: zodResolver(demographicsSchema),
    defaultValues: {
      firstName: userProfile.firstName || '',
      lastName: userProfile.lastName || '',
      birthMonth: dob ? months[dob.getUTCMonth()] : undefined,
      birthDay: dob ? String(dob.getUTCDate()) : undefined,
      birthYear: dob ? String(dob.getUTCFullYear()) : undefined,
      email: userProfile.email,
    },
  });

  const onSubmit = (values: DemographicsFormValues) => {
    startTransition(async () => {
      if (!user) {
        toast({ title: "Error", description: "Not authenticated", variant: "destructive" });
        return;
      }
      const monthIndex = monthMap[values.birthMonth];
      const constructedDate = new Date(Date.UTC(parseInt(values.birthYear), monthIndex, parseInt(values.birthDay)));
    
      const profileUpdateData: Partial<UserProfile> = {
        firstName: values.firstName,
        lastName: values.lastName,
        dateOfBirth: constructedDate.toISOString(),
        profileSetupComplete: true, // Mark profile as setup
      };
      
      const result = await updateUserDemographics(user.uid, profileUpdateData);
      
      if (result.success) {
        toast({ title: "Profile Updated", description: "Your information has been saved." });
        setUserProfile(prev => prev ? ({ ...prev, ...profileUpdateData }) : null);
      } else {
        toast({ title: "Update Failed", description: result.error || "Could not save profile.", variant: "destructive" });
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
                <Label htmlFor="lastName">Last Name *</Label>
                <Input id="lastName" {...form.register('lastName')} disabled={isPending} />
                {form.formState.errors.lastName && <p className="text-sm text-destructive">{form.formState.errors.lastName.message}</p>}
              </div>
              <div className="space-y-2">
                 <Label>Date of Birth *</Label>
                 <div className="grid grid-cols-3 gap-2">
                    <Controller name="birthMonth" control={form.control} render={({ field }) => (
                        <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isPending}>
                            <SelectTrigger aria-label="Month"><SelectValue placeholder="Month" /></SelectTrigger>
                            <SelectContent>{months.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                        </Select>
                    )} />
                     <Controller name="birthDay" control={form.control} render={({ field }) => (
                        <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isPending}>
                            <SelectTrigger aria-label="Day"><SelectValue placeholder="Day" /></SelectTrigger>
                            <SelectContent>{days.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                        </Select>
                    )} />
                     <Controller name="birthYear" control={form.control} render={({ field }) => (
                        <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isPending}>
                            <SelectTrigger aria-label="Year"><SelectValue placeholder="Year" /></SelectTrigger>
                            <SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                        </Select>
                    )} />
                 </div>
                 {form.formState.errors.birthMonth && <p className="text-sm text-destructive">{form.formState.errors.birthMonth.message}</p>}
                 {form.formState.errors.birthDay && <p className="text-sm text-destructive">{form.formState.errors.birthDay.message}</p>}
                 {form.formState.errors.birthYear && <p className="text-sm text-destructive">{form.formState.errors.birthYear.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email (Login ID)</Label>
                <Input id="email" type="email" {...form.register('email')} readOnly disabled className="bg-muted/50" />
              </div>
            </div>
            <CardFooter className="px-0 pt-4">
                <Button type="submit" disabled={isPending} className="ml-auto">
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Save Demographics'}
                </Button>
            </CardFooter>
          </form>
        </CardContent>
      </Card>
  );
}
