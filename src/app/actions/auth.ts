
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
  details?: z.inferFlattenedErrors<typeof SignUpDetailsInputSchema>; // Corrected type
}

export async function checkEmailAvailability(values: z.infer<typeof CheckEmailInputSchema>): Promise<{ available: boolean; error?: string }> {
  try {
    const validatedValues = CheckEmailInputSchema.parse(values);

    if (!firebaseAuth || !firebaseAuth.app) {
        console.warn("Firebase Auth not properly initialized in checkEmailAvailability. Potential .env.local issue. Cannot verify email.");
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
    // Log more detailed error on the server
    console.error("Detailed Error in checkEmailAvailability (server log):", error);
    if (error.code) {
      console.error("Firebase Error Code in checkEmailAvailability (server log):", error.code);
    }
    if (error.message) {
      console.error("Firebase Error Message in checkEmailAvailability (server log):", error.message);
    }
    return { available: false, error: "Could not verify email availability due to an unexpected error. Please check server logs for details." };
  }
}


export async function signUpUser(values: z.infer<typeof SignUpDetailsInputSchema>): Promise<SignUpResult> {
  try {
    const validatedValues = SignUpDetailsInputSchema.parse(values);

    if (!firebaseAuth || !firebaseAuth.app) {
      console.error("Firebase Auth is not initialized correctly in signUpUser. Potential .env.local issue.");
      return { success: false, error: "Authentication service is not available. Please configure Firebase.", errorCode: 'AUTH_UNAVAILABLE' };
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
      isAgeCertified: false,
      connectedFitnessApps: [],
      connectedDiagnosticsServices: [],
      connectedInsuranceProviders: [],
    };

    if (!db || !db.app || typeof doc !== 'function' || typeof setDoc !== 'function') {
        console.error("Firestore (db, doc, or setDoc) is not initialized correctly for profile creation in signUpUser. Potential .env.local issue or Firebase setup. DB App:", db?.app);
        return { success: false, error: "Profile creation failed: Database service unavailable. Your account was created in Auth but profile data was not saved.", errorCode: 'FIRESTORE_UNAVAILABLE' };
    }

    try {
      await setDoc(doc(db, "users", userCredential.user.uid), initialProfile);
    } catch (firestoreError: any) {
      console.error("[SIGNUP_FIRESTORE_ERROR] Error creating user profile in Firestore:", firestoreError);
      const errorMessage = String(firestoreError.message || 'Database error during profile creation.');
      const errorCode = String(firestoreError.code || 'FIRESTORE_ERROR');
      return { success: false, error: `Account created but profile setup failed: ${errorMessage}. Please contact support.`, errorCode: errorCode };
    }

    return { success: true, userId: userCredential.user.uid };
  } catch (error: any) {
    // Log the raw error first for server-side debugging
    console.error("[SIGNUP_ACTION_RAW_ERROR] Raw error in signUpUser:", error);

    if (error instanceof z.ZodError) {
      console.error("[SIGNUP_ACTION_ZOD_DETAILS] ZodError:", error.flatten());
      return { success: false, error: 'Invalid input data.', details: error.flatten() };
    }
    if ((error as AuthError).code === 'auth/email-already-in-use') {
        return { success: false, error: 'This email address is already in use. Please log in or use a different email.', errorCode: (error as AuthError).code };
    }
    // Generic catch-all for other errors
    console.error("[SIGNUP_ACTION_ERROR] Unhandled error in signUpUser (after processing):", error);
    const errorMessage = String(error.message || 'An unexpected error occurred during sign up.');
    const errorCode = String(error.code || 'UNKNOWN_SIGNUP_ERROR');
    return { success: false, error: errorMessage, errorCode: errorCode };
  }
}

// --- Login Schema ---
const LoginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, { message: "Password is required." }),
  mfaCode: z.string().length(8, { message: "MFA code must be 8 digits."}).optional().or(z.literal('')),
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
  details?: z.inferFlattenedErrors<typeof LoginInputSchema>;
}

export async function loginUser(values: z.infer<typeof LoginInputSchema>): Promise<LoginResult> {
  try {
    const validatedValues = LoginInputSchema.parse(values);

    if (!firebaseAuth || !firebaseAuth.app) {
      console.error("Firebase Auth is not initialized correctly in loginUser. Potential .env.local issue.");
      return { success: false, error: "Authentication service is not available.", errorCode: 'AUTH_UNAVAILABLE' };
    }

    const userCredential = await signInWithEmailAndPassword(
      firebaseAuth,
      validatedValues.email,
      validatedValues.password
    );
    const userId = userCredential.user.uid;

    if (!db || !db.app || typeof doc !== 'function' || typeof getDoc !== 'function') {
        console.error("Firestore (db, doc, or getDoc) is not initialized correctly for profile fetching in loginUser. Potential .env.local issue or Firebase setup. DB App:", db?.app);
        return { success: true, userId, userProfile: null, error: "Profile could not be fetched, but login succeeded.", errorCode: 'FIRESTORE_UNAVAILABLE' };
    }
    const userProfileDocRef = doc(db, "users", userId);
    const userProfileSnap = await getDoc(userProfileDocRef);

    if (!userProfileSnap.exists()) {
      console.error(`User profile not found for UID: ${userId} in loginUser. This might happen if signup was interrupted or for new users before profile save.`);
      return { success: true, userId, userProfile: null, errorCode: "auth/profile-not-found" };
    }
    const userProfile = userProfileSnap.data() as UserProfile;

    if (userProfile.lastPasswordChangeDate) {
      const lastPasswordChange = new Date(userProfile.lastPasswordChangeDate);
      const now = new Date();
      const daysSinceLastChange = (now.getTime() - lastPasswordChange.getTime()) / (1000 * 3600 * 24);
      if (daysSinceLastChange >= 90) {
        return { success: true, userId, passwordExpired: true, userProfile };
      }
    } else {
      console.warn(`User ${userId} missing lastPasswordChangeDate. Treating as password expired.`);
      return { success: true, userId, passwordExpired: true, userProfile };
    }
    
    // if (!userProfile.acceptedLatestTerms /* || check version */) {
    //   return { success: true, userId, termsNotAccepted: true, userProfile };
    // }

    if (userProfile.mfaMethod && !validatedValues.mfaCode) {
      // TODO: Generate and send MFA code
      console.log(`MFA required for user ${userId} via ${userProfile.mfaMethod}. No code provided yet.`);
      return { success: false, requiresMfa: true, error: "MFA code required. Please check your device.", userProfile };
    }
    
    if (userProfile.mfaMethod && validatedValues.mfaCode) {
      // TODO: Implement actual MFA code validation.
      const isValidMfaCode = validatedValues.mfaCode.length === 8; 
      console.log(`MFA code provided for user ${userId}: ${validatedValues.mfaCode}. Placeholder validation result: ${isValidMfaCode}`);
      if (!isValidMfaCode) {
        return { success: false, error: "Invalid MFA code.", userProfile };
      }
    }

    return { success: true, userId, userProfile };

  } catch (error: any) {
    console.error("[LOGIN_ACTION_RAW_ERROR] Raw error in loginUser:", error);
    if (error instanceof z.ZodError) {
      console.error("[LOGIN_ACTION_ZOD_DETAILS] ZodError:", error.flatten());
      return { success: false, error: 'Invalid login input.', details: error.flatten() };
    }
    if ((error as AuthError).code === 'auth/user-not-found' || (error as AuthError).code === 'auth/wrong-password' || (error as AuthError).code === 'auth/invalid-credential') {
         return { success: false, error: 'Invalid email or password.', errorCode: (error as AuthError).code };
    }
    console.error("[LOGIN_ACTION_ERROR] Unhandled error in loginUser (after processing):", error);
    const errorMessage = String(error.message || 'An unexpected error occurred during login.');
    const errorCode = String(error.code || 'UNKNOWN_LOGIN_ERROR');
    return { success: false, error: errorMessage, errorCode: errorCode };
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
}).refine(data => data.newPassword === data.confirmNewPassword, {
  message: "Passwords don't match.",
  path: ['confirmNewPassword'],
});


interface ForgotPasswordResult {
  success: boolean;
  error?: string;
  message?: string;
  errorCode?: string;
  details?: z.inferFlattenedErrors<typeof ForgotPasswordEmailSchema | typeof VerifyResetCodeSchema | typeof FinalResetPasswordSchema>;
}

export async function sendPasswordResetCode(values: z.infer<typeof ForgotPasswordEmailSchema>): Promise<ForgotPasswordResult> {
  try {
    const validatedValues = ForgotPasswordEmailSchema.parse(values);

    if (!firebaseAuth || !firebaseAuth.app) {
        console.warn("Firebase Auth not properly initialized in sendPasswordResetCode.");
        return { success: false, error: "Password reset service is temporarily unavailable.", errorCode: 'AUTH_UNAVAILABLE' };
    }

    const methods = await fetchSignInMethodsForEmail(firebaseAuth, validatedValues.email);
    if (methods.length === 0) {
      return { success: true, message: "If your email is registered, instructions to reset your password have been sent. This is a placeholder; code sending not implemented." };
    }

    console.log(`Simulating sending password reset code to ${validatedValues.email}. Code: 12345678 (placeholder)`);
    return { success: true, message: "If your email is registered, an 8-digit code has been sent. This is a placeholder; code sending not implemented." };
  } catch (error: any) {
    console.error("[SEND_RESET_CODE_ACTION_RAW_ERROR] Raw error in sendPasswordResetCode:", error);
    if (error instanceof z.ZodError) {
      console.error("[SEND_RESET_CODE_ACTION_ZOD_DETAILS] ZodError:", error.flatten());
      return { success: false, error: 'Invalid input.', details: error.flatten()};
    }
    // Still return a generic message for security
    console.error("[SEND_RESET_CODE_ACTION_ERROR] Unhandled error in sendPasswordResetCode (after processing):", error);
    return { success: true, message: "If your email is registered, an 8-digit code has been sent. This is a placeholder; code sending not implemented." };
  }
}

export async function verifyPasswordResetCode(values: z.infer<typeof VerifyResetCodeSchema>): Promise<ForgotPasswordResult> {
  try {
    const validatedValues = VerifyResetCodeSchema.parse(values);
    if (validatedValues.code === "12345678") { 
        return { success: true };
    } else {
        return { success: false, error: "Invalid or expired verification code."};
    }
  } catch (error: any) {
    console.error("[VERIFY_RESET_CODE_ACTION_RAW_ERROR] Raw error in verifyPasswordResetCode:", error);
     if (error instanceof z.ZodError) {
      console.error("[VERIFY_RESET_CODE_ACTION_ZOD_DETAILS] ZodError:", error.flatten());
      return { success: false, error: 'Invalid input.', details: error.flatten()};
    }
    console.error("[VERIFY_RESET_CODE_ACTION_ERROR] Unhandled error in verifyPasswordResetCode (after processing):", error);
    const errorMessage = String(typeof error.message === 'string' ? error.message : 'Code verification failed.');
    const errorCode = String(typeof error.code === 'string' ? error.code : 'UNKNOWN_VERIFY_CODE_ERROR');
    return { success: false, error: errorMessage, errorCode: errorCode };
  }
}

export async function resetPassword(values: z.infer<typeof FinalResetPasswordSchema>): Promise<ForgotPasswordResult> {
  try {
    const validatedValues = FinalResetPasswordSchema.parse(values);
    
    if (!firebaseAuth || !firebaseAuth.app) {
        console.warn("Firebase Auth not properly initialized in resetPassword.");
        return { success: false, error: "Password reset service is temporarily unavailable.", errorCode: 'AUTH_UNAVAILABLE' };
    }
    const currentUser = firebaseAuth.currentUser; 

    if (currentUser && currentUser.email === validatedValues.email) {
      await firebaseUpdatePassword(currentUser, validatedValues.newPassword); 
      if (db && db.app && typeof doc === 'function' && typeof setDoc === 'function') {
        try {
          await setDoc(doc(db, "users", currentUser.uid), { lastPasswordChangeDate: new Date().toISOString() }, { merge: true });
        } catch (dbError: any) {
          console.error("[RESET_PASSWORD_FIRESTORE_ERROR] Failed to update lastPasswordChangeDate for current user:", dbError);
        }
      } else {
         console.warn("DB not available to update lastPasswordChangeDate for current user password reset. DB App:", db?.app);
      }
      return { success: true, message: "Password has been reset successfully." };
    }

    if (validatedValues.email ) {
        console.warn("Attempting password reset for unauthenticated user via custom code flow. This needs a secure backend implementation using Firebase Admin SDK.");
        return { success: false, error: "Password reset for unauthenticated users via custom code requires a secure backend implementation. This feature is not fully implemented." };
    }

    return { success: false, error: "Could not reset password. User context mismatch or invalid flow." };

  } catch (error: any) {
    console.error("[RESET_PASSWORD_ACTION_RAW_ERROR] Raw error in resetPassword:", error);
    if (error instanceof z.ZodError) {
      console.error("[RESET_PASSWORD_ACTION_ZOD_DETAILS] ZodError:", error.flatten());
      return { success: false, error: 'Invalid input.', details: error.flatten()};
    }
    if ((error as AuthError).code === 'auth/requires-recent-login') {
      return { success: false, error: 'This operation is sensitive and requires recent authentication. Please log in again before changing your password.', errorCode: (error as AuthError).code };
    }
    if ((error as AuthError).code === 'auth/user-not-found') {
      return { success: false, error: 'No user found with this email address.', errorCode: (error as AuthError).code };
    }
     if ((error as AuthError).code === 'auth/weak-password') {
      return { success: false, error: 'The new password is too weak.', errorCode: (error as AuthError).code };
    }
    console.error("[RESET_PASSWORD_ACTION_ERROR] Unhandled error in resetPassword (after processing):", error);
    const errorMessage = String(typeof error.message === 'string' ? error.message : 'Password reset failed.');
    const errorCode = String(typeof error.code === 'string' ? error.code : 'UNKNOWN_RESET_PASSWORD_ERROR');
    return { success: false, error: errorMessage, errorCode: errorCode };
  }
}

// --- Update Profile Actions ---

const serverCalculateAge = (birthDateString: string): number => {
  const birthDate = new Date(birthDateString);
  if (isNaN(birthDate.getTime())) return 0; 
  return differenceInYears(new Date(), birthDate);
};

const DemographicsSchemaServer = z.object({
  firstName: z.string().min(3, "First name must be at least 3 characters.").max(50).regex(/^[a-zA-Z\s'-]+$/, "First name can only contain letters.").trim(),
  middleInitial: z.string().max(1, "Middle initial can be at most 1 character.").trim().optional(),
  lastName: z.string().min(3, "Last name must be at least 3 characters.").max(50).regex(/^[a-zA-Z\s'-]+$/, "Last name can only contain letters.").trim(),
  dateOfBirth: z.string() 
                  .refine((val) => !isNaN(Date.parse(val)), { message: "Invalid date of birth" })
                  .refine((val) => serverCalculateAge(val) >= 18, { message: "User must be 18 or older." }),
  email: z.string().email(), 
  cellPhone: z.string().regex(/^$|^\d{3}-\d{3}-\d{4}$/, "Invalid phone format (e.g., 999-999-9999).").optional(),
  isAgeCertified: z.boolean().optional(), 
}).refine(data => data.email || data.cellPhone, { 
    message: "Either email or cell phone must be provided for contact and MFA.",
    path: ["cellPhone"], 
}).refine(data => {
    if (serverCalculateAge(data.dateOfBirth) >= 18) {
        return data.isAgeCertified === true;
    }
    return true; 
}, {
    message: "Age certification is required for users 18 or older.",
    path: ["isAgeCertified"],
});


export async function updateDemographics(userId: string, values: z.infer<typeof DemographicsSchemaServer>): Promise<{success: boolean, error?: string, errorCode?: string, data?: Partial<UserProfile>, details?: any}> {
    try {
        const validatedValues = DemographicsSchemaServer.parse(values);

        if (!db || !db.app || typeof doc !== 'function' || typeof setDoc !== 'function') {
            console.error("Firestore (db, doc, or setDoc) is not initialized correctly for profile update. DB App:", db?.app);
            return { success: false, error: "Profile update failed: Database service unavailable.", errorCode: 'FIRESTORE_UNAVAILABLE' };
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
        console.error("[UPDATE_DEMOGRAPHICS_ACTION_RAW_ERROR] Raw error in updateDemographics:", error);
        if (error instanceof z.ZodError) {
          console.error("[UPDATE_DEMOGRAPHICS_ACTION_ZOD_DETAILS] ZodError:", error.flatten());
          return { success: false, error: 'Invalid input from server validation.', details: error.flatten() };
        }
        console.error("[UPDATE_DEMOGRAPHICS_ACTION_ERROR] Unhandled error in updateDemographics (after processing):", error);
        const errorMessage = String(typeof error.message === 'string' ? error.message : 'Failed to update profile.');
        const errorCode = String(typeof error.code === 'string' ? error.code : 'UNKNOWN_PROFILE_UPDATE_ERROR');
        return { success: false, error: errorMessage, errorCode: errorCode };
    }
}

export async function updateUserTermsAcceptance(userId: string, accepted: boolean, version: string): Promise<{success: boolean, error?: string, errorCode?: string}> {
    try {
        if (!db || !db.app || typeof doc !== 'function' || typeof setDoc !== 'function') {
            console.error("Firestore not available to update terms acceptance. DB App:", db?.app);
            return { success: false, error: "Database service unavailable.", errorCode: 'FIRESTORE_UNAVAILABLE'};
        }
        await setDoc(doc(db, "users", userId), { acceptedLatestTerms: accepted, termsVersionAccepted: version }, { merge: true });
        return { success: true };
    } catch (error: any) {
        console.error("[UPDATE_TERMS_ACTION_RAW_ERROR] Raw error in updateUserTermsAcceptance:", error);
        console.error("[UPDATE_TERMS_ACTION_ERROR] Unhandled error in updateUserTermsAcceptance (after processing):", error);
        const errorMessage = String(typeof error.message === 'string' ? error.message : 'Failed to update terms acceptance.');
        const errorCode = String(typeof error.code === 'string' ? error.code : 'UNKNOWN_TERMS_UPDATE_ERROR');
        return { success: false, error: errorMessage, errorCode: errorCode};
    }
}


