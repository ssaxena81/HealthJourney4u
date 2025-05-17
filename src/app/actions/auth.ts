
'use server';

import {
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail, // Added for robust email check
  signInWithEmailAndPassword,
  updatePassword as firebaseUpdatePassword,
  type AuthError,
} from 'firebase/auth';
import { auth as firebaseAuth, db } from '@/lib/firebase/clientApp';
import { z } from 'zod';
import type { UserProfile, SubscriptionTier } from '@/types';
import { passwordSchema } from '@/types'; // Moved from here
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

    // Refined check: A real Auth instance should have a 'settings' object.
    // If firebaseAuth was stubbed due to missing .env.local vars, firebaseAuth.settings will be undefined.
    if (!firebaseAuth || !firebaseAuth.settings) {
        console.warn("Firebase Auth not properly initialized in checkEmailAvailability. Cannot verify email. Check .env.local configuration and restart the server.");
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
      console.error("Firebase Auth is not initialized correctly. Potential .env.local issue.");
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
      isAgeCertified: false, // Certified during demographics step
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
        console.error("Firestore (db, doc, or setDoc) is not initialized correctly for profile creation. Potential .env.local issue or Firebase setup.");
        // Potentially delete the auth user here if profile creation fails critically
        // await userCredential.user.delete(); // Requires careful error handling
        return { success: false, error: "Profile creation failed: Database service unavailable. Your account was not fully created." };
    }
    
    try {
      await setDoc(doc(db, "users", userCredential.user.uid), initialProfile);
    } catch (firestoreError: any) {
      console.error("Error creating user profile in Firestore:", firestoreError);
      // Potentially delete the auth user here if profile creation fails critically
      // await userCredential.user.delete(); // Requires careful error handling
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
        // For now, returning a success state but with no profile. App layout will handle T&C/PW Expiry.
        // This allows login but subsequent checks in AppLayout will trigger.
        // TODO: Decide if login should fail here or proceed to let AppLayout handle missing profile scenarios
        // For this iteration, allowing login to proceed and AppLayout to potentially show T&C based on a 'stub' profile
        // is acceptable, as new users are directly sent to /profile.
        // A more robust approach might be to return { success: false, error: "Could not retrieve profile" }
        // but this would block login entirely even if Auth is successful.
        return { success: true, userId, userProfile: null, error: "Profile could not be fetched, but login succeeded."}; 
    }
    const userProfileDocRef = doc(db, "users", userId);
    const userProfileSnap = await getDoc(userProfileDocRef);

    if (!userProfileSnap.exists()) {
      console.error(`User profile not found for UID: ${userId}. This might happen if signup was interrupted or for new users before profile save.`);
      // This is a critical state. User is authenticated, but Firestore profile is missing.
      // For NEW users, they are redirected to /profile page by signup-flow.tsx after this loginUser() call.
      // For EXISTING users, this would be an anomaly.
      // Returning success: true but userProfile: null allows login to proceed,
      // and the (app)/layout.tsx will handle the missing profile (e.g., by showing T&C modal if `acceptedLatestTerms` is missing/false).
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
      // Should not happen for an existing user post-profile setup
      console.warn(`User ${userId} missing lastPasswordChangeDate.`);
      // Consider forcing a password reset or handling as an error. For now, proceed.
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
    const validatedValues = ForgotPasswordEmailSchema.parse(values);
    
    if (!firebaseAuth || !firebaseAuth.settings) { // Check if Firebase is initialized
        console.warn("Firebase Auth not properly initialized in sendPasswordResetCode.");
        return { success: false, error: "Password reset service is temporarily unavailable." };
    }
    
    // Check if the email exists first
    const methods = await fetchSignInMethodsForEmail(firebaseAuth, validatedValues.email);
    if (methods.length === 0) {
        // Email does not exist, but we give a generic message to avoid email enumeration.
        return { success: true, message: "If your email is registered, instructions to reset your password have been sent. This is a placeholder; code sending not implemented." };
    }

    // TODO: Implement custom 8-digit code sending (e.g., via Firebase Functions + SendGrid/Twilio)
    // For now, simulate success for an existing email.
    return { success: true, message: "If your email is registered, an 8-digit code has been sent. This is a placeholder; code sending not implemented." };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input.'};
    }
    // Generic message for other errors to also avoid confirming email existence
    console.error("Error in sendPasswordResetCode:", error);
    return { success: true, message: "If your email is registered, an 8-digit code has been sent. This is a placeholder; code sending not implemented." }; 
  }
}

export async function verifyPasswordResetCode(values: z.infer<typeof VerifyResetCodeSchema>): Promise<ForgotPasswordResult> {
  try {
    const validatedValues = VerifyResetCodeSchema.parse(values);
    // TODO: Implement custom 8-digit code verification against temporarily stored code.
    // This needs a backend mechanism (e.g., Firestore or Redis) to store the generated code with an expiry.
    if (validatedValues.code === "12345678") { // Placeholder for actual code verification
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

export async function resetPassword(values: z.infer<typeof FinalResetPasswordSchema>): Promise<ForgotPasswordResult> {
  try {
    const validatedValues = FinalResetPasswordSchema.parse(values);
    const currentUser = firebaseAuth.currentUser;

    if (!firebaseAuth || !firebaseAuth.settings) { // Check if Firebase is initialized
        console.warn("Firebase Auth not properly initialized in resetPassword.");
        return { success: false, error: "Password reset service is temporarily unavailable." };
    }

    // Scenario 1: User is logged in (e.g., forced password reset, or changing password from profile)
    if (currentUser && currentUser.email === validatedValues.email) {
      await firebaseUpdatePassword(currentUser, validatedValues.newPassword);
      if (db && typeof doc === 'function' && typeof setDoc === 'function') {
        try {
          await setDoc(doc(db, "users", currentUser.uid), { lastPasswordChangeDate: new Date().toISOString() }, { merge: true });
        } catch (dbError) {
          console.error("Failed to update lastPasswordChangeDate in Firestore:", dbError);
          // Non-critical error for password reset itself, but should be logged.
        }
      } else {
         console.warn("DB not available to update lastPasswordChangeDate for current user password reset.");
      }
      return { success: true, message: "Password has been reset successfully." };
    }
    
    // Scenario 2: User is NOT logged in (forgot password flow after code verification)
    // This part of the custom flow (without Firebase's oobCode) is tricky with client-side SDK.
    // Ideally, after custom code verification, a short-lived, secure token should be generated server-side
    // and used here to authorize the password change for the unauthenticated user.
    // Firebase Client SDK's updatePassword is for the *current* authenticated user.
    // For a truly secure unauthenticated reset via custom code, this would typically involve:
    // 1. verifyPasswordResetCode issues a temporary secure token.
    // 2. This token is passed to resetPassword.
    // 3. A server-side function (e.g., Firebase Function using Admin SDK) verifies this token
    //    and then uses Admin SDK to update the password for the user identified by the email.
    // Since we don't have that temporary token mechanism fully built here:
    // We will assume for now this function is primarily called when a user *is* logged in
    // or if Firebase's standard oobCode flow was used (which it isn't currently).
    // If `emailFromQuery` (used in ResetPasswordForm for custom flow) implies an unauthenticated user,
    // this path is not fully secure/implemented without the temporary token from step 2.
    // The `resetPassword` action needs the user's email to *potentially* find their UID if not logged in,
    // but can't update password for another user via client SDK.
    // For now, let's make it clear this path is for logged-in user or needs oobCode (which is not yet implemented)
    // TODO: Implement Firebase's standard `confirmPasswordReset` with oobCode for unauthenticated flow OR
    // build a secure temporary token system for the custom code flow.
    if (validatedValues.email /* && some_secure_unauthenticated_reset_token_is_present_and_valid */) {
        // Placeholder for unauthenticated flow. This is NOT production-ready for unauthenticated reset.
        console.warn("Attempting password reset for unauthenticated user. This flow needs a secure token mechanism or Firebase oobCode integration.");
        // This should ideally use admin.auth().updateUser(uid, { password: newPassword }) after finding UID by email.
        return { success: false, error: "Password reset for unauthenticated users via custom code is not fully implemented. Use Firebase's email link method or enhance this action." };
    }

    return { success: false, error: "Could not reset password. User context mismatch or invalid flow." };

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input.'};
    }
    console.error("Reset password error:", error);
    return { success: false, error: (error as AuthError).message || 'Password reset failed.', errorCode: (error as AuthError).code };
  }
}

// --- Update Profile Actions ---
const serverCalculateAge = (birthDateString: string): number => {
  const birthDate = new Date(birthDateString);
  if (isNaN(birthDate.getTime())) return 0; 
  return differenceInYears(new Date(), birthDate);
};

// Server-side schema for demographics
const DemographicsSchemaServer = z.object({
  firstName: z.string().min(3, "First name must be at least 3 characters.").max(50).regex(/^[a-zA-Z\s'-]+$/, "First name can only contain letters.").trim(),
  middleInitial: z.string().max(1, "Middle initial can be at most 1 character.").trim().optional(),
  lastName: z.string().min(3, "Last name must be at least 3 characters.").max(50).regex(/^[a-zA-Z\s'-]+$/, "Last name can only contain letters.").trim(),
  dateOfBirth: z.string() // ISO string from client
                  .refine((val) => !isNaN(Date.parse(val)), { message: "Invalid date of birth" })
                  .refine((val) => serverCalculateAge(val) >= 18, { message: "User must be 18 or older." }),
  email: z.string().email(), // Usually not updated here, but passed for context/validation
  cellPhone: z.string().regex(/^$|^\d{3}-\d{3}-\d{4}$/, "Invalid phone format (e.g., 999-999-9999).").optional(),
  isAgeCertified: z.boolean().optional(), 
}).refine(data => data.email || data.cellPhone, { 
    message: "Either email or cell phone must be provided for contact and MFA.",
    path: ["cellPhone"], 
}).refine(data => {
    if (serverCalculateAge(data.dateOfBirth) >= 18) {
        return data.isAgeCertified === true;
    }
    return true; // Not applicable if under 18 (though user is blocked), or if isAgeCertified is not passed (making it optional in base Zod obj)
}, {
    message: "Age certification is required for users 18 or older.",
    path: ["isAgeCertified"], 
});


export async function updateDemographics(userId: string, values: z.infer<typeof DemographicsSchemaServer>): Promise<{success: boolean, error?: string, data?: Partial<UserProfile>, details?: any}> {
    try {
        const validatedValues = DemographicsSchemaServer.parse(values);
        
        if (!db || typeof doc !== 'function' || typeof setDoc !== 'function') {
            console.error("Firestore (db, doc, or setDoc) is not initialized correctly for profile update.");
            return { success: false, error: "Profile update failed: Database service unavailable." };
        }

        const profileUpdateData: Partial<UserProfile> = {
            firstName: validatedValues.firstName,
            middleInitial: validatedValues.middleInitial,
            lastName: validatedValues.lastName,
            dateOfBirth: validatedValues.dateOfBirth,
            cellPhone: validatedValues.cellPhone,
            isAgeCertified: validatedValues.isAgeCertified,
        };
        
        await setDoc(doc(db, "users", userId), profileUpdateData, { merge: true });
        return { success: true, data: profileUpdateData };
    } catch (error: any) {
        if (error instanceof z.ZodError) {
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
        // When terms are accepted, also update lastPasswordChangeDate if it makes sense for your security policy
        // For now, only updating terms fields.
        await setDoc(doc(db, "users", userId), { acceptedLatestTerms: accepted, termsVersionAccepted: version }, { merge: true });
        return { success: true };
    } catch (error: any) {
        console.error("Error updating terms acceptance in Firestore:", error);
        return { success: false, error: "Failed to update terms acceptance."};
    }
}
