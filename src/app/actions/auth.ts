
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
import { auth, db } from '@/lib/firebase/serverApp';


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

    await setDoc(doc(db, "users", userCredential.user.uid), initialProfile);
    
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
    const userProfileDocRef = doc(db, "users", userId);
    
    await updateDoc(userProfileDocRef, { lastLoggedInDate: new Date().toISOString() });

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

// This server action is for a LOGGED-IN user changing their password.
// A forgot password flow would be different and require an oobCode.
export async function resetPassword(userId: string, values: Omit<z.infer<typeof FinalResetPasswordSchema>, 'email'>): Promise<ResetPasswordResult> {
  try {
    // Validate just the passwords
    const { newPassword } = FinalResetPasswordSchema.pick({ newPassword: true, confirmNewPassword: true }).parse(values);
    
    const userProfileDoc = await getDoc(doc(db, "users", userId));
    if (!userProfileDoc.exists()) {
        return { success: false, error: "User not found.", errorCode: "USER_NOT_FOUND"};
    }
    // Note: We can't use serverAuth.currentUser here. This action must be called with a validated user ID.
    // The actual password update needs to happen on the client with a re-authenticated user.
    // This server action will just update the Firestore timestamp.
    // The component logic should handle the Firebase client-side password update.

    await updateDoc(doc(db, "users", userId), { lastPasswordChangeDate: new Date().toISOString() });
    
    return { success: true, message: "Password change has been recorded." };

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
