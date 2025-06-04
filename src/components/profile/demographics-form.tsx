
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format, parseISO, differenceInYears } from 'date-fns';
import { cn } from '@/lib/utils';
import { updateDemographics } from '@/app/actions/auth';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';

const calculateAge = (birthDate: Date): number => {
  if (!birthDate) return 0;
  return differenceInYears(new Date(), birthDate);
};

const demographicsSchemaClient = z.object({
  firstName: z.string()
    .min(3, "First name must be at least 3 characters.")
    .max(50, "First name cannot exceed 50 characters.")
    .regex(/^[a-zA-Z\s'-]+$/, "First name contains invalid characters.")
    .trim(),
  middleInitial: z.string().max(1, "Middle initial can be at most 1 character.").trim().optional(),
  lastName: z.string()
    .min(3, "Last name must be at least 3 characters.")
    .max(50, "Last name cannot exceed 50 characters.")
    .regex(/^[a-zA-Z\s'-]+$/, "Last name contains invalid characters.")
    .trim(),
  dateOfBirth: z.date({ required_error: "Date of birth is required."}),
  email: z.string().email(),
  cellPhone: z.string()
    .regex(/^$|^\d{3}-\d{3}-\d{4}$/, "Invalid phone format (e.g., 999-999-9999).")
    .optional(),
  ageCertification: z.boolean().optional(),
}).refine(data => data.email || data.cellPhone, {
    message: "At least one contact method (Email or Cell Phone) is required for account recovery and communication.", // Rephrased
    path: ["cellPhone"],
}).refine(data => {
    if (data.dateOfBirth && calculateAge(data.dateOfBirth) >= 18) {
        return data.ageCertification === true;
    }
    return true; 
}, {
    message: "You must certify that you are 18 or older.",
    path: ["ageCertification"],
});

type DemographicsFormValues = z.infer<typeof demographicsSchemaClient>;

interface DemographicsFormProps {
  userProfile: UserProfile;
  onProfileUpdate?: (updatedProfileData: Partial<UserProfile>) => void;
}

export default function DemographicsForm({ userProfile, onProfileUpdate }: DemographicsFormProps) {
  const { toast } = useToast();
  const { logout } = useAuth();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAgeRestrictionDialog, setShowAgeRestrictionDialog] = useState(false);
  const [isUserOver18, setIsUserOver18] = useState<boolean | null>(null);

  const form = useForm<DemographicsFormValues>({
    resolver: zodResolver(demographicsSchemaClient),
    defaultValues: {
      firstName: userProfile.firstName || '',
      middleInitial: userProfile.middleInitial || '',
      lastName: userProfile.lastName || '',
      dateOfBirth: userProfile.dateOfBirth ? parseISO(userProfile.dateOfBirth) : undefined,
      email: userProfile.email,
      cellPhone: userProfile.cellPhone || '',
      ageCertification: userProfile.isAgeCertified || false,
    },
  });

  const dobValue = form.watch('dateOfBirth');

  useEffect(() => {
    if (dobValue) {
      const age = calculateAge(dobValue);
      if (age < 18) {
        setIsUserOver18(false);
        setShowAgeRestrictionDialog(true);
        form.setValue('ageCertification', false); 
      } else {
        setIsUserOver18(true);
        setShowAgeRestrictionDialog(false); 
      }
    } else {
      setIsUserOver18(null); 
      form.setValue('ageCertification', false);
    }
  }, [dobValue, form]);

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
    if (dobValue && calculateAge(dobValue) < 18) {
      setShowAgeRestrictionDialog(true);
      return; 
    }

    startTransition(async () => {
      const result = await updateDemographics(userProfile.id, {
        ...values,
        dateOfBirth: values.dateOfBirth.toISOString(),
        isAgeCertified: values.ageCertification,
      });
      
      if (result.success) {
        toast({ title: "Demographics Updated", description: "Your information has been saved." });
        if (onProfileUpdate && result.data) {
           onProfileUpdate(result.data);
        }
      } else {
        toast({ title: "Update Failed", description: result.error || "Could not save demographics.", variant: "destructive" });
        if (result.details?.fieldErrors) {
            Object.entries(result.details.fieldErrors).forEach(([field, messages]) => {
                form.setError(field as keyof DemographicsFormValues, { type: 'server', message: (messages as string[]).join(', ') });
            });
        }
      }
    });
  };

  return (
    <>
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
                          disabled={isPending || showAgeRestrictionDialog}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(date) => {
                            field.onChange(date);
                          }}
                          disabled={(date) => date > new Date() || date < new Date("1900-01-01") || isPending || showAgeRestrictionDialog}
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

            {form.formState.errors.root && <p className="text-sm text-destructive mt-2">{form.formState.errors.root.message}</p>}
            {(!form.getValues("email") && !form.getValues("cellPhone")) && <p className="text-sm text-destructive mt-2">At least Email or Cell Phone is required for contact.</p>}

            <div className="flex justify-end">
              <Button type="submit" disabled={isPending || showAgeRestrictionDialog || (isUserOver18 === false) || (isUserOver18 === true && !form.watch('ageCertification'))}>
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
              You must be 18 or older to use the app.
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
