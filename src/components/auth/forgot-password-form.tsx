
'use client';

import React, { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { sendPasswordResetCode, verifyPasswordResetCode } from '@/app/actions/auth'; // Assuming these actions
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation'; // To redirect to reset password form

const emailSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
});
type EmailFormValues = z.infer<typeof emailSchema>;

const codeSchema = z.object({
  code: z.string().length(8, { message: 'Code must be 8 digits.' }),
});
type CodeFormValues = z.infer<typeof codeSchema>;

export default function ForgotPasswordForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [step, setStep] = useState<'enterEmail' | 'enterCode'>('enterEmail');
  const [emailForReset, setEmailForReset] = useState('');

  const emailForm = useForm<EmailFormValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' },
  });

  const codeForm = useForm<CodeFormValues>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: '' },
  });

  const handleEmailSubmit = (values: EmailFormValues) => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await sendPasswordResetCode({ email: values.email });
      if (result.success) {
        setEmailForReset(values.email);
        setMessage(result.message || 'Verification code sent.');
        toast({ title: 'Code Sent', description: result.message });
        setStep('enterCode');
      } else {
        setError(result.error || 'Failed to send reset code.');
        toast({ title: 'Error', description: result.error, variant: 'destructive' });
      }
    });
  };

  const handleCodeSubmit = (values: CodeFormValues) => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      // TODO: The verifyPasswordResetCode needs a robust implementation.
      // It might need to issue a temporary token upon success that the ResetPasswordForm can use.
      const result = await verifyPasswordResetCode({ email: emailForReset, code: values.code });
      if (result.success) {
        toast({ title: 'Code Verified', description: 'You can now reset your password.' });
        // Redirect to the actual reset password form, possibly with a secure token.
        // For now, just redirecting. A token would be passed as a query parameter typically.
        router.push(`/reset-password?email=${encodeURIComponent(emailForReset)}`); // Add token if available
      } else {
        setError(result.error || 'Invalid or expired code.');
        codeForm.setError('code', { type: 'manual', message: result.error || 'Invalid or expired code.'});
        toast({ title: 'Verification Failed', description: result.error, variant: 'destructive' });
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
        <div className="rounded-md border border-green-500 bg-green-500/10 p-3 text-sm text-green-700">
          {message}
        </div>
      )}

      {step === 'enterEmail' && (
        <form onSubmit={emailForm.handleSubmit(handleEmailSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="email-forgot">Email Address</Label>
            <Input
              id="email-forgot"
              type="email"
              placeholder="you@example.com"
              {...emailForm.register('email')}
              disabled={isPending}
            />
            {emailForm.formState.errors.email && (
              <p className="text-sm text-destructive mt-1">{emailForm.formState.errors.email.message}</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Send Reset Code'}
          </Button>
        </form>
      )}

      {step === 'enterCode' && (
        <form onSubmit={codeForm.handleSubmit(handleCodeSubmit)} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            An 8-digit code was sent to <strong>{emailForReset}</strong>. Please enter it below.
          </p>
          <div>
            <Label htmlFor="reset-code">Verification Code (8 digits)</Label>
            <Input
              id="reset-code"
              type="text"
              placeholder="Enter code"
              {...codeForm.register('code')}
              disabled={isPending}
              maxLength={8}
            />
            {codeForm.formState.errors.code && (
              <p className="text-sm text-destructive mt-1">{codeForm.formState.errors.code.message}</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Verify Code'}
          </Button>
           <Button variant="link" size="sm" onClick={() => {setStep('enterEmail'); setError(null); setMessage(null);}} className="w-full mt-2">
            Resend code or use different email
          </Button>
        </form>
      )}
    </div>
  );
}
