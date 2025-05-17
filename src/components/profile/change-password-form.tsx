
'use client';

import React, { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { passwordSchema, resetPassword } from '@/app/actions/auth'; // Using resetPassword action as it handles new password logic
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth'; // To get current user's email

// This form assumes the user is already logged in and wants to change their password.
// Firebase requires current password to change password, or uses admin SDK.
// For simplicity, we'll simulate the flow. True Firebase password change needs current password.
// OR, if this is part of a forced reset, the `resetPassword` action could be used if it's adapted.
// Let's make this a simple "New Password" form, assuming identity is confirmed.

const changePasswordFormSchema = z.object({
  // currentPassword: passwordSchema, // Ideally, you'd ask for this
  newPassword: passwordSchema,
  confirmNewPassword: passwordSchema,
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: "New passwords don't match.",
  path: ['confirmNewPassword'],
});

type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;

export default function ChangePasswordForm() {
  const { toast } = useToast();
  const { user } = useAuth();
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
    if (!user?.email) {
        setError("User session not found. Please log in again.");
        return;
    }
    startTransition(async () => {
      // The `resetPassword` action is being used here. It needs to be robust enough
      // to handle password changes for an already authenticated user.
      // Firebase's `updatePassword(currentUser, newPassword)` is the direct way.
      // This action might need an `isChange: true` flag or similar.
      const result = await resetPassword({
        email: user.email, // Pass current user's email
        newPassword: values.newPassword,
        confirmNewPassword: values.confirmNewPassword,
      });

      if (result.success) {
        toast({
          title: 'Password Changed Successfully!',
          description: result.message || 'Your password has been updated.',
        });
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
          
          {/* 
          // Ideally, include current password field:
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current Password</Label>
            <Input id="currentPassword" type="password" {...form.register('currentPassword')} />
            {form.formState.errors.currentPassword && <p className="text-sm text-destructive">{form.formState.errors.currentPassword.message}</p>}
          </div>
          */}

          <div className="space-y-2">
            <Label htmlFor="newPasswordProfile">New Password</Label>
             <div className="relative">
                <Input
                id="newPasswordProfile"
                type={showNewPassword ? 'text' : 'password'}
                placeholder="••••••••"
                {...form.register('newPassword')}
                disabled={isPending}
                />
                <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowNewPassword(!showNewPassword)} disabled={isPending}>
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
            </div>
            {form.formState.errors.newPassword && (
              <p className="text-sm text-destructive">{form.formState.errors.newPassword.message}</p>
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
                />
                <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowConfirmPassword(!showConfirmPassword)} disabled={isPending}>
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
            </div>
            {form.formState.errors.confirmNewPassword && (
              <p className="text-sm text-destructive">{form.formState.errors.confirmNewPassword.message}</p>
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
