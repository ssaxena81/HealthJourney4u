

'use client';

import React, { useState, useTransition, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { differenceInYears } from 'date-fns';
import { updateUserDemographics } from '@/lib/firebase/client-firestore';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';

// --- Date of Birth Helpers ---
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const monthMap: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const days = Array.from({ length: 31 }, (_, i) => String(i + 1));
const currentYear = new Date().getFullYear();
const years = Array.from({ length: currentYear - 1924 }, (_, i) => String(currentYear - i));

const calculateAgeFromParts = (year?: string, month?: string, day?: string): number => {
    if (!year || !month || !day) return 0;
    const birthDate = new Date(parseInt(year), monthMap[month], parseInt(day));
    if (isNaN(birthDate.getTime())) return 0;
    return differenceInYears(new Date(), birthDate);
};


// --- Zod Validation Schema ---
const demographicsSchemaClient = z.object({
  firstName: z.string()
    .min(2, "First name must be at least 2 characters.")
    .max(50, "First name cannot exceed 50 characters.")
    .regex(/^[a-zA-Z\s'-]+$/, "First name contains invalid characters.")
    .trim(),
  middleInitial: z.string().max(1, "Middle initial can be at most 1 character.").trim().optional(),
  lastName: z.string()
    .min(2, "Last name must be at least 2 characters.")
    .max(50, "Last name cannot exceed 50 characters.")
    .regex(/^[a-zA-Z\s'-]+$/, "Last name contains invalid characters.")
    .trim(),
  birthMonth: z.enum(months, { required_error: "Month is required." }),
  birthDay: z.string({ required_error: "Day is required." }).nonempty("Day is required."),
  birthYear: z.string({ required_error: "Year is required." }).nonempty("Year is required."),
  email: z.string().email(),
  cellPhone: z.string()
    .regex(/^$|^\d{3}-\d{3}-\d{4}$/, "Invalid phone format (e.g., 999-999-9999).")
    .optional(),
  ageCertification: z.boolean().optional(),
}).refine(data => data.email || data.cellPhone, {
    message: "At least one contact method (Email or Cell Phone) is required.",
    path: ["cellPhone"],
}).superRefine((data, ctx) => {
    const { birthYear, birthMonth, birthDay } = data;
    if (!birthYear || !birthMonth || !birthDay) {
      return; // Individual field validation will catch this.
    }
    const year = parseInt(birthYear, 10);
    const day = parseInt(birthDay, 10);
    const monthIndex = monthMap[birthMonth];
    
    // Check if the constructed date is valid (e.g., handles Feb 30th)
    const testDate = new Date(year, monthIndex, day);
    if (testDate.getFullYear() !== year || testDate.getMonth() !== monthIndex || testDate.getDate() !== day) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid date. ${birthMonth} does not have ${day} days in ${year}.`,
        path: ["birthDay"],
      });
      return;
    }

    // Check age requirement
    const age = calculateAgeFromParts(birthYear, birthMonth, birthDay);
    if (age < 18) {
       ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "You must be 18 or older to use this application.",
        path: ["birthYear"],
      });
    } else if (!data.ageCertification) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "You must certify that you are 18 or older.",
            path: ["ageCertification"],
        });
    }
});

type DemographicsFormValues = z.infer<typeof demographicsSchemaClient>;

interface DemographicsFormProps {
  userProfile: UserProfile;
  onProfileUpdate?: (updatedProfileData: Partial<UserProfile>) => void;
}

export default function DemographicsForm({ userProfile, onProfileUpdate }: DemographicsFormProps) {
  const { toast } = useToast();
  const { logout, setUserProfile } = useAuth();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAgeRestrictionDialog, setShowAgeRestrictionDialog] = useState(false);
  
  const dob = userProfile.dateOfBirth ? new Date(userProfile.dateOfBirth) : null;

  const form = useForm<DemographicsFormValues>({
    resolver: zodResolver(demographicsSchemaClient),
    defaultValues: {
      firstName: userProfile.firstName || '',
      middleInitial: userProfile.middleInitial || '',
      lastName: userProfile.lastName || '',
      birthMonth: dob ? months[dob.getUTCMonth()] : undefined,
      birthDay: dob ? String(dob.getUTCDate()) : undefined,
      birthYear: dob ? String(dob.getUTCFullYear()) : undefined,
      email: userProfile.email,
      cellPhone: userProfile.cellPhone || '',
      ageCertification: userProfile.isAgeCertified || false,
    },
  });
  
  const watchedDobParts = form.watch(['birthYear', 'birthMonth', 'birthDay']);
  const isUserOver18 = calculateAgeFromParts(...watchedDobParts) >= 18;

  useEffect(() => {
      const age = calculateAgeFromParts(...watchedDobParts);
      if (watchedDobParts.every(part => part) && age < 18) {
          setShowAgeRestrictionDialog(true);
      }
  }, [watchedDobParts]);


  const handleAgeDialogOk = async () => {
    setShowAgeRestrictionDialog(false);
    await logout();
    router.push('/login');
    toast({
      title: "Registration Halted",
      description: "You must be 18 or older to use this application.",
      variant: "destructive",
    });
  };

  const onSubmit = (values: DemographicsFormValues) => {
    if (calculateAgeFromParts(values.birthYear, values.birthMonth, values.birthDay) < 18) {
      setShowAgeRestrictionDialog(true);
      return; 
    }

    startTransition(async () => {
      const monthIndex = monthMap[values.birthMonth];
      const constructedDate = new Date(Date.UTC(parseInt(values.birthYear), monthIndex, parseInt(values.birthDay)));
    
      const profileUpdateData: Partial<UserProfile> = {
        firstName: values.firstName,
        middleInitial: values.middleInitial,
        lastName: values.lastName,
        dateOfBirth: constructedDate.toISOString(),
        cellPhone: values.cellPhone,
        isAgeCertified: values.ageCertification,
        isProfileCreated: true,
        // [06-23-2025 6:30pm] Combine the profile setup completion flag into this single update.
        // [06-23-2025 6:30pm] This avoids a separate, failing server action call.
        profileSetupComplete: true,
      };
      
      const result = await updateUserDemographics(userProfile.id, profileUpdateData);
      
      if (result.success) {
        toast({ title: "Demographics Updated", description: "Your information has been saved and your profile is now complete." });
        
        if (onProfileUpdate) {
           onProfileUpdate(profileUpdateData);
        }
        if (setUserProfile) {
            setUserProfile(prev => prev ? ({ ...prev, ...profileUpdateData }) : null);
        }

      } else {
        toast({ title: "Update Failed", description: result.error || "Could not save demographics.", variant: "destructive" });
        form.setError("root", { type: "server", message: result.error });
      }
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Demographic Information</CardTitle>
          <CardDescription>Please provide your personal details. Fields marked with * are required. Completing this form marks your profile setup as complete.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input id="firstName" {...form.register('firstName')} disabled={isPending || showAgeRestrictionDialog} />
                {form.formState.errors.firstName && <p className="text-sm text-destructive">{form.formState.errors.firstName.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="middleInitial">Middle Initial</Label>
                <Input id="middleInitial" {...form.register('middleInitial')} disabled={isPending || showAgeRestrictionDialog} />
                {form.formState.errors.middleInitial && <p className="text-sm text-destructive">{form.formState.errors.middleInitial.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input id="lastName" {...form.register('lastName')} disabled={isPending || showAgeRestrictionDialog} />
                {form.formState.errors.lastName && <p className="text-sm text-destructive">{form.formState.errors.lastName.message}</p>}
              </div>
              <div className="space-y-2">
                 <Label>Date of Birth *</Label>
                 <div className="grid grid-cols-3 gap-2">
                    <Controller name="birthMonth" control={form.control} render={({ field }) => (
                        <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isPending || showAgeRestrictionDialog}>
                            <SelectTrigger aria-label="Month"><SelectValue placeholder="Month" /></SelectTrigger>
                            <SelectContent>{months.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                        </Select>
                    )} />
                     <Controller name="birthDay" control={form.control} render={({ field }) => (
                        <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isPending || showAgeRestrictionDialog}>
                            <SelectTrigger aria-label="Day"><SelectValue placeholder="Day" /></SelectTrigger>
                            <SelectContent>{days.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                        </Select>
                    )} />
                     <Controller name="birthYear" control={form.control} render={({ field }) => (
                        <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isPending || showAgeRestrictionDialog}>
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
                {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="cellPhone">Cell Phone (e.g., 123-456-7890)</Label>
                <Input id="cellPhone" {...form.register('cellPhone')} placeholder="___-___-____" disabled={isPending || showAgeRestrictionDialog} />
                {form.formState.errors.cellPhone && <p className="text-sm text-destructive">{form.formState.errors.cellPhone.message}</p>}
              </div>
            </div>
            
            {isUserOver18 && (
              <div className="items-top flex space-x-2 pt-2">
                <Controller
                    name="ageCertification"
                    control={form.control}
                    render={({ field }) => (
                        <Checkbox
                            id="ageCertification"
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={isPending || showAgeRestrictionDialog}
                        />
                    )}
                />
                <div className="grid gap-1.5 leading-none">
                  <Label
                    htmlFor="ageCertification"
                    className="font-medium cursor-pointer"
                  >
                    I certify that I am 18 years or older *
                  </Label>
                </div>
              </div>
            )}
            {form.formState.errors.ageCertification && <p className="text-sm text-destructive">{form.formState.errors.ageCertification.message}</p>}

            <div className="flex justify-end">
              <Button type="submit" disabled={isPending || showAgeRestrictionDialog || !isUserOver18 || (isUserOver18 && !form.watch('ageCertification'))}>
                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Save Demographics'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <AlertDialog open={showAgeRestrictionDialog} onOpenChange={setShowAgeRestrictionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Age Restriction</AlertDialogTitle>
            <AlertDialogDescription>
              You must be 18 or older to use this application. Your session will be terminated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleAgeDialogOk}>Ok</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
