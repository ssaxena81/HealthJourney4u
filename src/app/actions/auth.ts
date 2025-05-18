
'use server';

import {
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  signInWithEmailAndPassword,
  updatePassword as firebaseUpdatePassword,
  type AuthError,
} from 'firebase/auth';
import { auth as firebaseAuth, db } from '@/lib/firebase/clientApp';
import { z } from 'zod';
import type { UserProfile, SubscriptionTier } from '@/types';
import { passwordSchema } from '@/types';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { differenceInYears } from 'date-fns';


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
    const validatedValues = CheckEmailInputSchema.parse(values);

    // Refined check: A real Auth instance should have the 'fetchSignInMethodsForEmail' function.
    // If firebaseAuth was stubbed due to missing .env.local vars, this function won't exist.
    if (!firebaseAuth || typeof firebaseAuth.fetchSignInMethodsForEmail !== 'function') {
        console.warn("Firebase Auth not properly initialized in checkEmailAvailability or fetchSignInMethodsForEmail is not a function. Cannot verify email. Check .env.local configuration and restart the server.");
        // console.log("Current firebaseAuth object in checkEmailAvailability:", JSON.stringify(firebaseAuth)); // Log what it actually is
        return { available: false, error: "Email verification service is temporarily unavailable. Please ensure Firebase is configured correctly." };
    }

    const methods = await fetchSignInMethodsForEmail(firebaseAuth, validatedValues.email);
    if (methods.length > 0) {
      return { available: false, error: "This email is already registered. Please try logging in or use 'Forgot my password'." };
    }
    return { available: true };
  } catch (error: any) {
    if (error.code === 'auth/invalid-email') {
      return { available: false, error: "The email address is badly formatted." };
    }
    console.error("Error in checkEmailAvailability:", error);
    return { available: false, error: "Could not verify email availability due to an unexpected error." };
  }
}


export async function signUpUser(values: z.infer<typeof SignUpDetailsInputSchema>): Promise<SignUpResult> {
  try {
    const validatedValues = SignUpDetailsInputSchema.parse(values);

    if (!firebaseAuth || typeof firebaseAuth.createUserWithEmailAndPassword !== 'function') {
      console.error("Firebase Auth is not initialized correctly in signUpUser. Potential .env.local issue.");
      return { success: false, error: "Authentication service is not available. Please configure Firebase." };
    }

    const userCredential = await createUserWithEmailAndPassword(
      firebaseAuth,
      validatedValues.email,
      validatedValues.password
    );

    const initialProfile: UserProfile = {
      id: userCredential.user.uid,
      email: userCredential.user.email!,
      subscriptionTier: validatedValues.subscriptionTier,
      lastPasswordChangeDate: new Date().toISOString(),
      acceptedLatestTerms: false,
      isAgeCertified: false, // Initial value, certified during profile setup
      firstName: undefined,
      middleInitial: undefined,
      lastName: undefined,
      dateOfBirth: undefined,
      cellPhone: undefined,
      mfaMethod: undefined,
      termsVersionAccepted: undefined,
      paymentDetails: undefined,
      connectedFitnessApps: [],
      connectedDiagnosticsServices: [],
      connectedInsuranceProviders: [],
    };

    if (!db || typeof doc !== 'function' || typeof setDoc !== 'function') {
        console.error("Firestore (db, doc, or setDoc) is not initialized correctly for profile creation in signUpUser. Potential .env.local issue or Firebase setup.");
        return { success: false, error: "Profile creation failed: Database service unavailable. Your account was not fully created." };
    }

    try {
      await setDoc(doc(db, "users", userCredential.user.uid), initialProfile);
    } catch (firestoreError: any) {
      console.error("Error creating user profile in Firestore:", firestoreError);
      // Consider if you need to delete the Firebase Auth user if Firestore profile creation fails
      // await userCredential.user.delete(); // This would be an advanced error recovery
      return { success: false, error: `Account created but profile setup failed: ${firestoreError.message}. Please contact support.` };
    }

    return { success: true, userId: userCredential.user.uid };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input data.', details: error };
    }
    if ((error as AuthError).code === 'auth/email-already-in-use') {
        return { success: false, error: 'This email address is already in use. Please log in or use a different email.', errorCode: (error as AuthError).code };
    }
    console.error("Sign up error:", error);
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
  userProfile?: UserProfile | null;
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

    // --- Fetch user profile from Firestore ---
    if (!db || typeof doc !== 'function' || typeof getDoc !== 'function') {
        console.error("Firestore is not initialized correctly for profile fetching.");
        // If Firestore isn't available, log in succeeds but profile-dependent checks can't occur.
        // This is a degraded state, but better than failing login entirely if Auth worked.
        return { success: true, userId, userProfile: null, error: "Profile could not be fetched, but login succeeded."};
    }
    const userProfileDocRef = doc(db, "users", userId);
    const userProfileSnap = await getDoc(userProfileDocRef);

    if (!userProfileSnap.exists()) {
      // This could happen for a new user if they haven't completed profile setup,
      // or if the profile document creation failed during sign-up.
      console.error(`User profile not found for UID: ${userId}. This might happen if signup was interrupted or for new users before profile save.`);
      // For new users, they are redirected to /profile from signup.
      // If an existing user logs in and profile is missing, it's an issue.
      // Let's allow login but signal that profile is missing. The app layout will handle redirection to /profile or T&C.
      return { success: true, userId, userProfile: null, errorCode: "auth/profile-not-found" };
    }
    const userProfile = userProfileSnap.data() as UserProfile;
    // --- End Profile fetch ---


    // Check password expiry
    if (userProfile.lastPasswordChangeDate) {
      const lastPasswordChange = new Date(userProfile.lastPasswordChangeDate);
      const now = new Date();
      const daysSinceLastChange = (now.getTime() - lastPasswordChange.getTime()) / (1000 * 3600 * 24);
      if (daysSinceLastChange >= 90) {
        return { success: true, userId, passwordExpired: true, userProfile };
      }
    } else {
      // This case should ideally not happen for users who have completed profile setup.
      // Might occur if a new user (profile just created in signup) tries to log in immediately
      // before the lastPasswordChangeDate is robustly set.
      // For now, we'll log a warning. If this becomes an issue, ensure lastPasswordChangeDate
      // is always set even on initial profile creation.
      console.warn(`User ${userId} missing lastPasswordChangeDate. This is unexpected for a fully onboarded user.`);
      // Potentially force a password reset here as a safety measure or require profile completion.
      // For now, let them proceed, (app)/layout.tsx might catch other issues.
    }

    // Check T&C acceptance (assuming '2.0' is the latest version string - this should come from a config)
    if (!userProfile.acceptedLatestTerms || userProfile.termsVersionAccepted !== '2.0') {
      return { success: true, userId, termsNotAccepted: true, userProfile };
    }

    // TODO: Implement MFA check here if enabled for the user
    // if (userProfile.mfaEnabled && !validatedValues.mfaCode) {
    //   return { success: false, requiresMfa: true, error: "MFA code required." };
    // }
    // if (userProfile.mfaEnabled && validatedValues.mfaCode) {
    //   // Verify MFA code
    // }

    return { success: true, userId, userProfile };

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid login input.' };
    }
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
         return { success: false, error: 'Invalid email or password.', errorCode: error.code };
    }
    console.error("Login error:", error);
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
  email: z.string().email(), // Email associated with the reset attempt
  newPassword: passwordSchema,
  confirmNewPassword: passwordSchema,
  // oobCode: z.string().optional(), // For Firebase's built-in email link flow
}).refine(data => data.newPassword === data.confirmNewPassword, {
  message: "Passwords don't match.",
  path: ['confirmNewPassword'],
});


interface ForgotPasswordResult {
  success: boolean;
  error?: string;
  message?: string;
}

// This function simulates sending a code. A real implementation would use Firebase Functions or a third-party service.
export async function sendPasswordResetCode(values: z.infer<typeof ForgotPasswordEmailSchema>): Promise<ForgotPasswordResult> {
  try {
    const validatedValues = ForgotPasswordEmailSchema.parse(values);

    if (!firebaseAuth || typeof firebaseAuth.fetchSignInMethodsForEmail !== 'function') {
        console.warn("Firebase Auth not properly initialized in sendPasswordResetCode.");
        return { success: false, error: "Password reset service is temporarily unavailable." };
    }

    // Check if the email is registered
    const methods = await fetchSignInMethodsForEmail(firebaseAuth, validatedValues.email);
    if (methods.length === 0) {
      // Email not found, but we don't want to reveal this to prevent user enumeration.
      // Send a generic message.
      return { success: true, message: "If your email is registered, instructions to reset your password have been sent. This is a placeholder; code sending not implemented." };
    }

    // TODO: Implement actual code generation and sending (e.g., via Firebase Functions + an email service)
    // Store the code temporarily and securely (e.g., in Firestore with an expiry, associated with the email)
    // For now, this is a placeholder.
    console.log(`Simulating sending password reset code to ${validatedValues.email}. Code: 12345678 (placeholder)`);
    return { success: true, message: "If your email is registered, an 8-digit code has been sent. This is a placeholder; code sending not implemented." };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input.'};
    }
    console.error("Error in sendPasswordResetCode:", error);
    // Still return a generic message for security
    return { success: true, message: "If your email is registered, an 8-digit code has been sent. This is a placeholder; code sending not implemented." };
  }
}

// This function simulates verifying a code.
export async function verifyPasswordResetCode(values: z.infer<typeof VerifyResetCodeSchema>): Promise<ForgotPasswordResult> {
  try {
    const validatedValues = VerifyResetCodeSchema.parse(values);
    // TODO: Implement actual code verification against a temporarily stored code.
    // For now, using a placeholder code.
    if (validatedValues.code === "12345678") { // Placeholder code
        // If successful, you might issue a temporary, secure token that the user can use
        // on the next step (resetting the password) to prove they've verified the code.
        return { success: true };
    } else {
        return { success: false, error: "Invalid or expired verification code."};
    }
  } catch (error: any) {
     if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input.'};
    }
    console.error("Error in verifyPasswordResetCode:", error);
    return { success: false, error: "Code verification failed."};
  }
}

// This function handles password reset for a logged-in user (forced reset)
// or for a user who has completed a forgot password flow (e.g., verified an oobCode or our custom code).
export async function resetPassword(values: z.infer<typeof FinalResetPasswordSchema>): Promise<ForgotPasswordResult> {
  try {
    const validatedValues = FinalResetPasswordSchema.parse(values);
    const currentUser = firebaseAuth.currentUser;

    if (!firebaseAuth || typeof firebaseAuth.updatePassword !== 'function') {
        console.warn("Firebase Auth not properly initialized in resetPassword.");
        return { success: false, error: "Password reset service is temporarily unavailable." };
    }

    // Scenario 1: User is logged in (e.g., forced password expiry)
    if (currentUser && currentUser.email === validatedValues.email) {
      await firebaseUpdatePassword(currentUser, validatedValues.newPassword);
      // Update lastPasswordChangeDate in Firestore
      if (db && typeof doc === 'function' && typeof setDoc === 'function') {
        try {
          await setDoc(doc(db, "users", currentUser.uid), { lastPasswordChangeDate: new Date().toISOString() }, { merge: true });
        } catch (dbError) {
          console.error("Failed to update lastPasswordChangeDate in Firestore for current user:", dbError);
          // Non-fatal for password reset itself, but log it.
        }
      } else {
         console.warn("DB not available to update lastPasswordChangeDate for current user password reset.");
      }
      return { success: true, message: "Password has been reset successfully." };
    }

    // Scenario 2: User is not logged in but has verified via a custom code (placeholder logic)
    // This part assumes the email in `validatedValues.email` has been "verified" through a prior step
    // (like our custom 8-digit code flow). Firebase itself doesn't directly support resetting passwords
    // for unauthenticated users with just an email and new password without an oobCode.
    // A more robust custom flow would involve a secure, short-lived token generated after code verification.
    if (validatedValues.email /* && validatedValues.someSecureTokenFromCodeVerification */) {
        // This is a placeholder. Firebase's standard way is `confirmPasswordReset` with an oobCode.
        // To implement this custom flow securely, you'd need:
        // 1. A backend mechanism (e.g., Firebase Function) to verify your custom code.
        // 2. If verified, that backend mechanism would need to reset the password using Firebase Admin SDK.
        //    The Admin SDK can update passwords without the user being logged in or needing an oobCode,
        //    but this must be done from a trusted server environment.
        console.warn("Attempting password reset for unauthenticated user via custom code flow. This needs a secure backend implementation using Firebase Admin SDK.");
        // For now, let's simulate success IF this were a real backend call that succeeded.
        // In a real app, you would call a Firebase Function here.
        // If that function successfully resets password and updates Firestore, return success.
        // This path is NOT secure as is and is just a placeholder for the described flow.
        // A real implementation would involve an Admin SDK call on the server.
        // Since we don't have an Admin SDK call here, we can't *actually* reset the password for an unauth user.
        return { success: false, error: "Password reset for unauthenticated users via custom code requires a secure backend implementation. This feature is not fully implemented." };
    }

    // TODO: Handle Firebase's oobCode flow if you decide to use it instead of custom codes.
    // if (validatedValues.oobCode) {
    //   await confirmPasswordReset(firebaseAuth, validatedValues.oobCode, validatedValues.newPassword);
    //   // Need to get UID from oobCode or prompt for email again if not available.
    //   // Then update lastPasswordChangeDate in Firestore.
    //   return { success: true, message: "Password has been reset successfully." };
    // }

    return { success: false, error: "Could not reset password. User context mismatch or invalid flow." };

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input.'};
    }
    // Handle specific Firebase errors
    if (error.code === 'auth/requires-recent-login') {
      return { success: false, error: 'This operation is sensitive and requires recent authentication. Please log in again before changing your password.', errorCode: error.code };
    }
    if (error.code === 'auth/user-not-found') {
      return { success: false, error: 'No user found with this email address.', errorCode: error.code };
    }
     if (error.code === 'auth/weak-password') {
      return { success: false, error: 'The new password is too weak.', errorCode: error.code };
    }
    console.error("Reset password error:", error);
    return { success: false, error: (error as AuthError).message || 'Password reset failed.', errorCode: (error as AuthError).code };
  }
}

// --- Update Profile Actions ---

// Helper function to calculate age on the server
const serverCalculateAge = (birthDateString: string): number => {
  const birthDate = new Date(birthDateString);
  if (isNaN(birthDate.getTime())) return 0; // Invalid date string
  return differenceInYears(new Date(), birthDate);
};

const DemographicsSchemaServer = z.object({
  firstName: z.string().min(3, "First name must be at least 3 characters.").max(50).regex(/^[a-zA-Z\s'-]+$/, "First name can only contain letters.").trim(),
  middleInitial: z.string().max(1, "Middle initial can be at most 1 character.").trim().optional(),
  lastName: z.string().min(3, "Last name must be at least 3 characters.").max(50).regex(/^[a-zA-Z\s'-]+$/, "Last name can only contain letters.").trim(),
  dateOfBirth: z.string() // Will be ISO string from client
                  .refine((val) => !isNaN(Date.parse(val)), { message: "Invalid date of birth" })
                  .refine((val) => serverCalculateAge(val) >= 18, { message: "User must be 18 or older." }),
  email: z.string().email(), // Should match the logged-in user's email, usually read-only on form
  cellPhone: z.string().regex(/^$|^\d{3}-\d{3}-\d{4}$/, "Invalid phone format (e.g., 999-999-9999).").optional(),
  isAgeCertified: z.boolean().optional(), // This will be true if age is >= 18 and user certified
}).refine(data => data.email || data.cellPhone, { // Email is always there from UserProfile, so this ensures cellPhone if email was somehow blank (should not happen)
    message: "Either email or cell phone must be provided for contact and MFA.",
    path: ["cellPhone"], // Or a general error path
}).refine(data => {
    // If age is 18 or over, certification is mandatory.
    if (serverCalculateAge(data.dateOfBirth) >= 18) {
        return data.isAgeCertified === true;
    }
    return true; // Not applicable if under 18 (though caught by DOB refine)
}, {
    message: "Age certification is required for users 18 or older.",
    path: ["isAgeCertified"], // This path might need to match client-side checkbox name e.g. "ageCertification"
});


export async function updateDemographics(userId: string, values: z.infer<typeof DemographicsSchemaServer>): Promise<{success: boolean, error?: string, data?: Partial<UserProfile>, details?: any}> {
    try {
        // Re-validate with server schema which includes age check
        const validatedValues = DemographicsSchemaServer.parse(values);

        if (!db || typeof doc !== 'function' || typeof setDoc !== 'function') {
            console.error("Firestore (db, doc, or setDoc) is not initialized correctly for profile update.");
            return { success: false, error: "Profile update failed: Database service unavailable." };
        }

        // Construct the data to be updated in Firestore, ensuring only fields from UserProfile are included
        const profileUpdateData: Partial<UserProfile> = {
            firstName: validatedValues.firstName,
            middleInitial: validatedValues.middleInitial,
            lastName: validatedValues.lastName,
            dateOfBirth: validatedValues.dateOfBirth, // Already an ISO string
            cellPhone: validatedValues.cellPhone,
            isAgeCertified: validatedValues.isAgeCertified,
            // email is not updated here as it's tied to auth
        };

        await setDoc(doc(db, "users", userId), profileUpdateData, { merge: true });
        return { success: true, data: profileUpdateData };
    } catch (error: any) {
        if (error instanceof z.ZodError) {
          // This will include detailed validation errors from the server-side schema
          return { success: false, error: 'Invalid input from server validation.', details: error.flatten() };
        }
        console.error("Error updating demographics in Firestore:", error);
        return { success: false, error: "Failed to update profile." };
    }
}

export async function updateUserTermsAcceptance(userId: string, accepted: boolean, version: string): Promise<{success: boolean, error?: string}> {
    try {
        if (!db || typeof doc !== 'function' || typeof setDoc !== 'function') {
            console.error("Firestore not available to update terms acceptance.");
            return { success: false, error: "Database service unavailable."};
        }
        await setDoc(doc(db, "users", userId), { acceptedLatestTerms: accepted, termsVersionAccepted: version }, { merge: true });
        return { success: true };
    } catch (error: any) {
        console.error("Error updating terms acceptance in Firestore:", error);
        return { success: false, error: "Failed to update terms acceptance."};
    }
}
