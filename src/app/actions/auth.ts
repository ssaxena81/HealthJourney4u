
'use server';

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  updatePassword as firebaseUpdatePassword,
  type AuthError,
} from 'firebase/auth';
import { auth as firebaseAuth, db } from '@/lib/firebase/clientApp'; // Import db
import { z } from 'zod';
import type { UserProfile, SubscriptionTier } from '@/types';
import { passwordSchema } from '@/types';
import { doc, setDoc } from 'firebase/firestore'; // For Firestore operations

// --- Sign Up Schemas ---
const CheckEmailInputSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
});

const SignUpDetailsInputSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  confirmPassword: passwordSchema,
  subscriptionTier: z.enum(['free', 'silver', 'gold', 'platinum']),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match.",
  path: ['confirmPassword'],
});

interface SignUpResult {
  success: boolean;
  userId?: string;
  error?: string;
  errorCode?: string;
  details?: z.ZodError<z.infer<typeof SignUpDetailsInputSchema>>;
}

export async function checkEmailAvailability(values: z.infer<typeof CheckEmailInputSchema>): Promise<{ available: boolean; error?: string }> {
  try {
    CheckEmailInputSchema.parse(values);
    // This is a Firebase specific way to check; ideally, you might have a users collection to check against too.
    // Firebase's signInWithEmailAndPassword with a dummy password throws 'auth/wrong-password' if user exists,
    // or 'auth/user-not-found' if user doesn't exist. This isn't the most elegant way.
    // A better way is to attempt to fetch user by email if using Admin SDK, or maintain a list of emails.
    // For client-side, `fetchSignInMethodsForEmail` was an option but can be slow.
    // For now, we'll assume a simple check.
    // TODO: Implement a more robust email availability check, possibly using Firebase Admin SDK if this action is run in a secure environment or a users collection.
    // This is a simplified check. In a real app, you might try to fetch user data.
    // For now, let's simulate by saying it's available if no direct Firebase error.
    // await firebaseAuth.fetchSignInMethodsForEmail(validatedValues.email) is client-side.
    // This is a placeholder for a proper check.
    return { available: true }; // Placeholder
  } catch (error: any) {
     if (error.code === 'auth/user-not-found') {
      return { available: true };
    }
    // Firebase often throws if email is malformed before even checking existence.
    // For simplicity, assume other errors mean it's 'unavailable' or problematic.
    return { available: false, error: "Could not verify email availability." };
  }
}


export async function signUpUser(values: z.infer<typeof SignUpDetailsInputSchema>): Promise<SignUpResult> {
  try {
    const validatedValues = SignUpDetailsInputSchema.parse(values);

    if (!firebaseAuth || typeof firebaseAuth.createUserWithEmailAndPassword !== 'function') {
      console.error("Firebase Auth is not initialized correctly.");
      return { success: false, error: "Authentication service is not available. Please configure Firebase." };
    }

    const userCredential = await createUserWithEmailAndPassword(
      firebaseAuth,
      validatedValues.email,
      validatedValues.password
    );

    // Create user profile in Firestore
    const initialProfile: UserProfile = {
      id: userCredential.user.uid,
      email: userCredential.user.email!, // email will exist as it's used for signup
      subscriptionTier: validatedValues.subscriptionTier,
      lastPasswordChangeDate: new Date().toISOString(), // Set to current date on signup
      acceptedLatestTerms: false, // User needs to accept T&C post-signup
      termsVersionAccepted: undefined, // No version accepted yet
      // Initialize other profile fields as empty/default
      firstName: undefined,
      middleInitial: undefined,
      lastName: undefined,
      dateOfBirth: undefined,
      cellPhone: undefined,
      mfaMethod: undefined, // User will set this up in profile
      paymentDetails: undefined, // To be handled by payment integration
      connectedFitnessApps: [],
      connectedDiagnosticsServices: [],
      connectedInsuranceProviders: [],
    };

    // Save to Firestore
    if (!db || typeof doc !== 'function' || typeof setDoc !== 'function') { 
        console.error("Firestore (db, doc, or setDoc) is not initialized correctly for profile creation.");
        // Optionally, you might want to delete the Firebase Auth user here if profile creation fails
        // await userCredential.user.delete(); // Requires careful error handling and re-authentication if user session expired
        return { success: false, error: "Profile creation failed: Database service unavailable." };
    }
    
    try {
      await setDoc(doc(db, "users", userCredential.user.uid), initialProfile);
    } catch (firestoreError: any) {
      console.error("Error creating user profile in Firestore:", firestoreError);
      // Critical decision: If profile creation fails, should the auth user be deleted?
      // This prevents orphaned auth accounts but makes the signup non-atomic if deletion also fails.
      // Consider a cleanup mechanism (e.g., Firebase Function) if this becomes a recurring issue.
      // For now, just return an error. Deleting the user is risky if their session expired.
      return { success: false, error: `Account created but profile setup failed: ${firestoreError.message}. Please contact support.` };
    }
    

    return { success: true, userId: userCredential.user.uid };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input data.', details: error };
    }
    // Handle Firebase Auth errors (e.g., email-already-in-use)
    return { success: false, error: (error as AuthError).message || 'Sign up failed.', errorCode: (error as AuthError).code };
  }
}

// --- Login Schema ---
const LoginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, { message: "Password is required." }),
  mfaCode: z.string().optional(), 
});

interface LoginResult {
  success: boolean;
  userId?: string;
  error?: string;
  errorCode?: string;
  requiresMfa?: boolean;
  passwordExpired?: boolean;
  termsNotAccepted?: boolean;
  userProfile?: UserProfile; // Return full profile on login
}

export async function loginUser(values: z.infer<typeof LoginInputSchema>): Promise<LoginResult> {
  try {
    const validatedValues = LoginInputSchema.parse(values);

    if (!firebaseAuth || typeof firebaseAuth.signInWithEmailAndPassword !== 'function') {
      return { success: false, error: "Authentication service is not available." };
    }
    
    const userCredential = await signInWithEmailAndPassword(
      firebaseAuth,
      validatedValues.email,
      validatedValues.password
    );
    const userId = userCredential.user.uid;

    // TODO: Implement actual MFA check
    // For now, assume MFA is not strictly enforced by this action, but profile might indicate preference
    // if (!validatedValues.mfaCode) {
    //   // Check userProfile.mfaMethod if MFA is required
    // } else {
    //   // TODO: Verify MFA code if provided.
    // }

    // --- Fetch user profile from Firestore ---
    if (!db || typeof doc !== 'function') { // Basic check
        console.error("Firestore is not initialized correctly for profile fetching.");
        return { success: false, error: "Login failed: Could not retrieve user profile." };
    }
    // const userProfileDocRef = doc(db, "users", userId);
    // const userProfileSnap = await getDoc(userProfileDocRef); // Make sure to import getDoc

    // if (!userProfileSnap.exists()) {
    //   // This case should ideally not happen if signup always creates a profile.
    //   // Could be an old user or an error during signup.
    //   console.error(`User profile not found for UID: ${userId}.`);
    //   return { success: false, error: "User profile not found. Please complete sign up or contact support." };
    // }
    // const userProfile = userProfileSnap.data() as UserProfile;
     const userProfile: UserProfile = { // This is MOCK data until getDoc is used
      id: userId,
      email: validatedValues.email,
      subscriptionTier: 'free',
      lastPasswordChangeDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(), 
      acceptedLatestTerms: false, 
      termsVersionAccepted: '1.0', 
      connectedFitnessApps: [],
      connectedDiagnosticsServices: [],
      connectedInsuranceProviders: [],
      firstName: "Mock",
      lastName: "User",
      dateOfBirth: new Date(1990,0,1).toISOString(),
    };
    // --- End Placeholder for profile fetch ---


    // Check password expiry
    const lastPasswordChange = new Date(userProfile.lastPasswordChangeDate);
    const now = new Date();
    const daysSinceLastChange = (now.getTime() - lastPasswordChange.getTime()) / (1000 * 3600 * 24);
    if (daysSinceLastChange >= 90) {
      return { success: true, userId, passwordExpired: true, userProfile };
    }

    // Check T&C acceptance (assuming '2.0' is the latest version string)
    // TODO: Make '2.0' a configurable constant
    if (!userProfile.acceptedLatestTerms || userProfile.termsVersionAccepted !== '2.0') {
      return { success: true, userId, termsNotAccepted: true, userProfile };
    }
    
    return { success: true, userId, userProfile };

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid login input.' };
    }
    return { success: false, error: (error as AuthError).message || 'Login failed.', errorCode: (error as AuthError).code };
  }
}


// --- Forgot Password Schemas ---
const ForgotPasswordEmailSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
});

const VerifyResetCodeSchema = z.object({
  email: z.string().email(),
  code: z.string().length(8, { message: "Code must be 8 digits." }),
});

const FinalResetPasswordSchema = z.object({
  email: z.string().email(), 
  newPassword: passwordSchema,
  confirmNewPassword: passwordSchema,
  // oobCode: z.string().optional(), // For Firebase's own reset links
}).refine(data => data.newPassword === data.confirmNewPassword, {
  message: "Passwords don't match.",
  path: ['confirmNewPassword'],
});


interface ForgotPasswordResult {
  success: boolean;
  error?: string;
  message?: string;
}

export async function sendPasswordResetCode(values: z.infer<typeof ForgotPasswordEmailSchema>): Promise<ForgotPasswordResult> {
  try {
    ForgotPasswordEmailSchema.parse(values);
    // TODO: Implement custom 8-digit code sending (e.g., via Firebase Functions + SendGrid/Twilio)
    // For now, simulate success.
    // console.log(`Simulating sending 8-digit code to ${validatedValues.email}`);
    return { success: true, message: "If your email is registered, an 8-digit code has been sent." };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input.'};
    }
    return { success: true, message: "If your email is registered, an 8-digit code has been sent." }; 
  }
}

export async function verifyPasswordResetCode(values: z.infer<typeof VerifyResetCodeSchema>): Promise<ForgotPasswordResult> {
  try {
    const validatedValues = VerifyResetCodeSchema.parse(values);
    // TODO: Implement custom 8-digit code verification against temporarily stored code.
    // console.log(`Simulating verification of code ${validatedValues.code} for ${validatedValues.email}`);
    if (validatedValues.code === "12345678") { // Placeholder
        return { success: true };
    } else {
        return { success: false, error: "Invalid or expired verification code."};
    }
  } catch (error: any) {
     if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input.'};
    }
    return { success: false, error: "Code verification failed."};
  }
}

export async function resetPassword(values: z.infer<typeof FinalResetPasswordSchema>): Promise<ForgotPasswordResult> {
  try {
    const validatedValues = FinalResetPasswordSchema.parse(values);
    const currentUser = firebaseAuth.currentUser;

    if (currentUser && currentUser.email === validatedValues.email) {
      await firebaseUpdatePassword(currentUser, validatedValues.newPassword);
      // Update lastPasswordChangeDate in Firestore
      if (db && typeof doc === 'function' && typeof setDoc === 'function') {
        await setDoc(doc(db, "users", currentUser.uid), { lastPasswordChangeDate: new Date().toISOString() }, { merge: true });
      } else {
         console.warn("DB not available to update lastPasswordChangeDate");
      }
      return { success: true, message: "Password has been reset successfully." };
    }
    
    // TODO: Handle oobCode flow for password reset if Firebase default email links are used.
    // if (validatedValues.oobCode) { ... }

    if (!currentUser) {
      console.warn("resetPassword action called for forgot password flow without oobCode or temporary auth.");
      return { success: false, error: "Password reset for unauthenticated users requires further setup." };
    }

    return { success: false, error: "Could not reset password. User context mismatch." };

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input.'};
    }
    return { success: false, error: (error as AuthError).message || 'Password reset failed.', errorCode: (error as AuthError).code };
  }
}

// --- Update Profile Actions ---

const DemographicsSchema = z.object({
  firstName: z.string().min(3, "First name must be at least 3 characters.").max(50).regex(/^[a-zA-Z\s'-]+$/, "First name can only contain letters.").trim(),
  middleInitial: z.string().max(1, "Middle initial can be at most 1 character.").trim().optional(),
  lastName: z.string().min(3, "Last name must be at least 3 characters.").max(50).regex(/^[a-zA-Z\s'-]+$/, "Last name can only contain letters.").trim(),
  dateOfBirth: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid date of birth" }),
  email: z.string().email(), 
  cellPhone: z.string().regex(/^$|^\d{3}-\d{3}-\d{4}$/, "Invalid phone format (e.g., 999-999-9999)").optional(),
}).refine(data => data.email || data.cellPhone, { 
    message: "Either email or cell phone must be provided.",
    path: ["cellPhone"], 
});


export async function updateDemographics(userId: string, values: z.infer<typeof DemographicsSchema>): Promise<{success: boolean, error?: string, data?: Partial<UserProfile>, details?: any}> {
    try {
        const validatedValues = DemographicsSchema.parse(values);
        // TODO: Update user profile in Firestore for userId with validatedValues
        // console.log("Updating demographics for user:", userId, validatedValues);
        // Example: await setDoc(doc(db, "users", userId), validatedValues, { merge: true });
        return { success: true, data: validatedValues }; // Return parsed values for optimistic update
    } catch (error: any) {
        if (error instanceof z.ZodError) {
          return { success: false, error: 'Invalid input.', details: error.flatten() };
        }
        return { success: false, error: "Failed to update profile." };
    }
}

export async function updateUserTermsAcceptance(userId: string, accepted: boolean, version: string): Promise<{success: boolean, error?: string}> {
    try {
        // Update user profile in Firestore
        if (db && typeof doc === 'function' && typeof setDoc === 'function') {
            await setDoc(doc(db, "users", userId), { acceptedLatestTerms: accepted, termsVersionAccepted: version }, { merge: true });
            return { success: true };
        } else {
            console.error("Firestore not available to update terms acceptance.");
            return { success: false, error: "Database service unavailable."};
        }
    } catch (error: any) {
        console.error("Error updating terms acceptance in Firestore:", error);
        return { success: false, error: "Failed to update terms acceptance."};
    }
}
