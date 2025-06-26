
'use client';

import React, { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { sendPasswordResetEmailAction } from '@/app/actions/auth';
import { Loader2 } from 'lucide-react';

const emailSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
});
type EmailFormValues = z.infer<typeof emailSchema>;

export default function ForgotPasswordForm() {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  
  const form = useForm<EmailFormValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' },
  });

  const handleEmailSubmit = (values: EmailFormValues) => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await sendPasswordResetEmailAction({ email: values.email });
      if (result.success) {
        setMessage(result.message || 'If an account with that email exists, a password reset link has been sent.');
        toast({ title: 'Request Sent', description: result.message });
        form.reset(); // Clear the form
      } else {
        // This part might not be reached if we always return success for security
        setError(result.error || 'Failed to send reset link.');
        toast({ title: 'Error', description: result.error, variant: 'destructive' });
      }
    });
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-md border border-primary/50 bg-primary/10 p-3 text-sm text-primary">
          {message}
        </div>
      )}

      <form onSubmit={form.handleSubmit(handleEmailSubmit)} className="space-y-4">
        <div>
          <Label htmlFor="email-forgot">Email Address</Label>
          <Input
            id="email-forgot"
            type="email"
            placeholder="you@example.com"
            {...form.register('email')}
            disabled={isPending}
            autoComplete="email"
          />
          {form.formState.errors.email && (
            <p className="text-sm text-destructive mt-1">{form.formState.errors.email.message}</p>
          )}
        </div>
         <p className="text-xs text-muted-foreground">
            You will receive an email with a secure link to reset your password. This link is valid for a limited time.
        </p>
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Send Reset Link'}
        </Button>
      </form>
    </div>
  );
}
