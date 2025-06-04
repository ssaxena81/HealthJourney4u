
'use client';

import React, { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { resetPassword } from '@/app/actions/auth';
import { passwordSchema } from '@/types';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';


const changePasswordFormSchema = z.object({
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
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const form = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: {
      newPassword: '',
      confirmNewPassword: '',
    },
  });

  const onSubmit = (values: ChangePasswordFormValues) => {
    setError(null);
    if (!user || !user.email) { // Ensure user and user.email are not null
        setError("User session not found or email is missing. Please log in again.");
        toast({ title: "Error", description: "User session not found or email is missing. Please log in again.", variant: "destructive" });
        return;
    }
    
    const userEmail: string = user.email; // user.email is now confirmed to be a string

    startTransition(async () => {
      const result = await resetPassword({
        email: userEmail, 
        newPassword: values.newPassword,
        confirmNewPassword: values.confirmNewPassword,
      });

      if (result.success) {
        toast({
          title: 'Password Changed Successfully!',
          description: result.message || 'Your password has been updated.',
        });
        if (setUserProfile) {
            setUserProfile(prev => prev ? ({...prev, lastPasswordChangeDate: new Date().toISOString()}) : null);
        }
        form.reset();
      } else {
        setError(result.error || 'An unknown error occurred.');
        toast({
          title: 'Password Change Failed',
          description: result.error || 'Please try again.',
          variant: 'destructive',
        });
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
        <CardDescription>Set a new password for your account. Ensure it meets the complexity requirements.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {error && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          
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
                <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowNewPassword(!showNewPassword)} disabled={isPending} aria-label={showNewPassword ? "Hide new password" : "Show new password"}>
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
                <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowConfirmPassword(!showConfirmPassword)} disabled={isPending} aria-label={showConfirmPassword ? "Hide confirm new password" : "Show confirm new password"}>
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
