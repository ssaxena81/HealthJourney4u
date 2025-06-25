
'use client';

import React, { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { passwordSchema } from '@/types';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { updatePassword as firebaseUpdatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { resetPassword as recordPasswordChange } from '@/app/actions/auth';

const changePasswordFormSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: passwordSchema,
  confirmNewPassword: passwordSchema,
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: "New passwords don't match.",
  path: ['confirmNewPassword'],
});

type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;

export default function ChangePasswordForm() {
  const { toast } = useToast();
  const { user, setUserProfile } = useAuth();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const form = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    },
  });

  const onSubmit = (values: ChangePasswordFormValues) => {
    setError(null);
    if (!user || !user.email) {
      setError("User session not found. Please log in again.");
      return;
    }

    startTransition(async () => {
      try {
        // Step 1: Re-authenticate the user
        const credential = EmailAuthProvider.credential(user.email!, values.currentPassword);
        await reauthenticateWithCredential(user, credential);

        // Step 2: Update the password in Firebase Auth
        await firebaseUpdatePassword(user, values.newPassword);
        
        // Step 3: Record the password change in Firestore via a server action
        await recordPasswordChange(user.uid, { 
            newPassword: values.newPassword, 
            confirmNewPassword: values.confirmNewPassword 
        });
        
        // Step 4: Update local state and show success
        if (setUserProfile) {
            setUserProfile(prev => prev ? ({...prev, lastPasswordChangeDate: new Date().toISOString()}) : null);
        }
        toast({ title: 'Password Changed Successfully!' });
        form.reset();
        
      } catch (authError: any) {
        let errorMessage = "An unexpected error occurred.";
        if (authError.code === 'auth/wrong-password') {
          errorMessage = "The current password you entered is incorrect.";
          form.setError("currentPassword", { type: "manual", message: errorMessage });
        } else if (authError.code) {
           errorMessage = authError.message;
        }
        setError(errorMessage);
        toast({ title: 'Password Change Failed', description: errorMessage, variant: 'destructive' });
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
        <CardDescription>Set a new password for your account. You must provide your current password.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {error && !form.formState.errors.currentPassword && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current Password</Label>
             <div className="relative">
                <Input
                id="currentPassword"
                type={showCurrentPassword ? 'text' : 'password'}
                placeholder="••••••••"
                {...form.register('currentPassword')}
                disabled={isPending}
                autoComplete="current-password"
                />
                <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowCurrentPassword(!showCurrentPassword)} disabled={isPending}>
                 {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
            </div>
            {form.formState.errors.currentPassword && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.currentPassword.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPasswordProfile">New Password</Label>
             <div className="relative">
                <Input
                id="newPasswordProfile"
                type={showNewPassword ? 'text' : 'password'}
                placeholder="••••••••"
                {...form.register('newPassword')}
                disabled={isPending}
                autoComplete="new-password"
                />
                <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowNewPassword(!showNewPassword)} disabled={isPending}>
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
            </div>
            {form.formState.errors.newPassword && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.newPassword.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmNewPasswordProfile">Confirm New Password</Label>
            <div className="relative">
                <Input
                id="confirmNewPasswordProfile"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="••••••••"
                {...form.register('confirmNewPassword')}
                disabled={isPending}
                autoComplete="new-password"
                />
                <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowConfirmPassword(!showConfirmPassword)} disabled={isPending}>
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
            </div>
            {form.formState.errors.confirmNewPassword && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.confirmNewPassword.message}</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Password must be at least 8 characters, include one uppercase letter, one number, and one special character.
          </p>

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Update Password'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
