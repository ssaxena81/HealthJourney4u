
'use server';

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  confirmPasswordReset,
  verifyPasswordResetCode,
  type AuthError,
} from 'firebase/auth';
import { z } from 'zod';
import type {
    UserProfile,
    LoginResult,
} from '@/types';
import { passwordSchema } from '@/types';
import { auth, adminDb } from '@/lib/firebase/serverApp';


// --- Sign Up Schema ---
const SignUpDetailsInputSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  confirmPassword: passwordSchema,
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match.",
  path: ['confirmPassword'],
});

interface SignUpResult {
  success: boolean;
  userId?: string;
  error?: string;
  errorCode?: string;
}

export async function signUpUser(values: z.infer<typeof SignUpDetailsInputSchema>): Promise<SignUpResult> {
  try {
    const validatedValues = SignUpDetailsInputSchema.parse(values);

    const userCredential = await createUserWithEmailAndPassword(
      auth,
      validatedValues.email,
      validatedValues.password
    );

    const nowIso = new Date().toISOString();
    // Create a simplified, stable UserProfile
    const initialProfile: UserProfile = {
      id: userCredential.user.uid,
      email: userCredential.user.email!,
      createdAt: nowIso,
      subscriptionTier: 'free', // Default to free tier
      profileSetupComplete: false,
      acceptedLatestTerms: false,
    };

    await adminDb.collection("users").doc(userCredential.user.uid).set(initialProfile);
    
    return { success: true, userId: userCredential.user.uid };

  } catch (error: any) {
    let errorMessage = "An unexpected error occurred during account creation.";
    let errorCode = "UNKNOWN_SIGNUP_ERROR";

    if (error instanceof z.ZodError) {
      errorMessage = "Invalid input data for sign-up.";
      errorCode = "VALIDATION_ERROR";
    } else if ((error as AuthError).code) {
      errorCode = (error as AuthError).code;
      if (errorCode === 'auth/email-already-in-use') {
        errorMessage = 'This email address is already in use.';
      }
    }
    
    return { success: false, error: errorMessage, errorCode };
  }
}

// --- Login Schema ---
const LoginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, { message: "Password is required." }),
});

export async function loginUser(values: z.infer<typeof LoginInputSchema>): Promise<LoginResult> {
  try {
    const validatedValues = LoginInputSchema.parse(values);

    const userCredential = await signInWithEmailAndPassword(
      auth,
      validatedValues.email,
      validatedValues.password
    );
    
    const userId = userCredential.user.uid;
    const userProfileDocRef = adminDb.collection("users").doc(userId);
    
    await userProfileDocRef.update({ lastLoggedInDate: new Date().toISOString() });

    return { success: true, userId };

  } catch (error: any) {
    let errorMessage = "An unknown error occurred during login.";
    let errorCode = "UNKNOWN_LOGIN_ERROR";

    if (error instanceof z.ZodError) {
      errorMessage = "Invalid login input.";
      errorCode = "VALIDATION_ERROR";
    } else if ((error as AuthError).code) {
      errorCode = (error as AuthError).code;
      if (errorCode === 'auth/user-not-found' || errorCode === 'auth/wrong-password' || errorCode === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password.';
      } else {
        errorMessage = (error as AuthError).message;
      }
    }
    
    return { success: false, error: errorMessage, errorCode };
  }
}

interface ActionResult {
    success: boolean;
    message?: string;
    error?: string;
    errorCode?: string;
}

// --- Forgot Password Flow (sends email link) ---
const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

export async function sendPasswordResetEmailAction(values: z.infer<typeof ForgotPasswordSchema>): Promise<ActionResult> {
  try {
    const validatedValues = ForgotPasswordSchema.parse(values);
    await sendPasswordResetEmail(auth, validatedValues.email);
    return { success: true, message: "If an account with that email exists, a password reset link has been sent." };
  } catch (error: any) {
    console.error(`[AuthAction] Error sending password reset email for ${values.email}:`, error);
    // For security, don't reveal if an email is registered or not. Always return a generic success message.
    return { success: true, message: "If an account with that email exists, a password reset link has been sent." };
  }
}

// --- Reset Password using oobCode from email link ---
export async function resetPasswordWithOobCode(oobCode: string, newPassword: string): Promise<ActionResult> {
  if (!oobCode) {
    return { success: false, error: 'Invalid or missing reset code.' };
  }
  try {
    // Validate the password first
    passwordSchema.parse(newPassword);

    // Verify the code to ensure it's valid before attempting to reset
    await verifyPasswordResetCode(auth, oobCode);
    
    // If verification succeeds, reset the password
    await confirmPasswordReset(auth, oobCode, newPassword);

    return { success: true, message: 'Password has been reset successfully. You can now log in.' };
  } catch (error: any) {
     let errorMessage = "Password reset failed. The link may be invalid or expired.";
     let errorCode = 'UNEXPECTED_ERROR';
     if (error instanceof z.ZodError) {
        errorMessage = error.errors.map(e => e.message).join(' ');
     } else if ((error as AuthError).code) {
        errorCode = (error as AuthError).code;
        if (errorCode === 'auth/invalid-action-code') {
          errorMessage = 'The password reset link is invalid or has expired. Please request a new one.';
        }
     }
    return { success: false, error: errorMessage, errorCode };
  }
}

// --- Record Password Change in DB (for logged-in user) ---
export async function recordPasswordChangeInDb(userId: string): Promise<ActionResult> {
  try {
    if (!userId) {
        return { success: false, error: "User not identified.", errorCode: "USER_NOT_FOUND"};
    }
    await adminDb.collection("users").doc(userId).update({ lastPasswordChangeDate: new Date().toISOString() });
    return { success: true, message: "Password change has been recorded." };
  } catch (error: any) {
    return { success: false, error: "Failed to record password change." };
  }
}
