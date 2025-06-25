
'use server';

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updatePassword as firebaseUpdatePassword,
  type AuthError,
} from 'firebase/auth';
import { z } from 'zod';
import type {
    UserProfile,
    LoginResult,
} from '@/types';
import { passwordSchema } from '@/types';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { auth as serverAuth, db as serverDb } from '@/lib/firebase/serverApp';


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
      serverAuth,
      validatedValues.email,
      validatedValues.password
    );

    const nowIso = new Date().toISOString();
    const initialProfile: UserProfile = {
      id: userCredential.user.uid,
      email: userCredential.user.email!,
      createdAt: nowIso,
    };

    await setDoc(doc(serverDb, "users", userCredential.user.uid), initialProfile);
    
    return { success: true, userId: userCredential.user.uid };

  } catch (error: any) {
    let errorMessage = "An unexpected error occurred during account creation.";
    let errorCode = "UNKNOWN_SIGNUP_ERROR";

    if (error instanceof z.ZodError) {
      errorMessage = "Invalid input data for sign-up.";
      errorCode = "VALIDATION_ERROR";
      return { success: false, error: errorMessage, errorCode };
    } 
    
    if ((error as AuthError).code) {
      errorMessage = (error as AuthError).message;
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
      serverAuth,
      validatedValues.email,
      validatedValues.password
    );
    
    const userId = userCredential.user.uid;
    const userProfileDocRef = doc(serverDb, "users", userId);
    
    await updateDoc(userProfileDocRef, { lastLoggedInDate: new Date().toISOString() });

    // The profile will be fetched client-side by the useAuth hook
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

// --- Reset Password ---
const FinalResetPasswordSchema = z.object({
  email: z.string().email(),
  newPassword: passwordSchema,
  confirmNewPassword: passwordSchema,
}).refine(data => data.newPassword === data.confirmNewPassword, {
  message: "Passwords don't match.",
  path: ['confirmNewPassword'],
});

interface ResetPasswordResult {
  success: boolean;
  error?: string;
  message?: string;
  errorCode?: string;
}

export async function resetPassword(values: z.infer<typeof FinalResetPasswordSchema>): Promise<ResetPasswordResult> {
  // This function is simplified. It assumes a logged-in user is changing their own password.
  // A full "forgot password" flow is more complex.
  try {
    const validatedValues = FinalResetPasswordSchema.parse(values);
    const currentUser = serverAuth.currentUser;

    if (currentUser && currentUser.email === validatedValues.email) {
      await firebaseUpdatePassword(currentUser, validatedValues.newPassword);
      await updateDoc(doc(serverDb, "users", currentUser.uid), { lastPasswordChangeDate: new Date().toISOString() });
      return { success: true, message: "Password has been reset successfully." };
    } else {
        // This case would be for a non-logged-in user, which requires a different flow (e.g., oobCode)
        // For now, we return an error to keep it simple and fix the build.
        return { success: false, error: "User not authenticated for this action.", errorCode: "AUTH_REQUIRED" };
    }

  } catch (error: any) {
     let errorMessage = "Password reset failed due to an unexpected error.";
     let errorCode = 'UNEXPECTED_ERROR';
     if (error instanceof z.ZodError) {
        return { success: false, error: "Invalid data.", errorCode: "VALIDATION_ERROR" };
     }
     if ((error as AuthError).code) {
        errorCode = (error as AuthError).code;
        errorMessage = (error as AuthError).message;
     }
    return { success: false, error: errorMessage, errorCode };
  }
}
