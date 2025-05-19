
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
  details?: z.inferFlattenedErrors<typeof SignUpDetailsInputSchema>; // Use flattened errors
}

export async function checkEmailAvailability(values: z.infer<typeof CheckEmailInputSchema>): Promise<{ available: boolean; error?: string }> {
  try {
    const validatedValues = CheckEmailInputSchema.parse(values);

    if (!firebaseAuth || !firebaseAuth.app) {
        console.warn("Firebase Auth not properly initialized in checkEmailAvailability. Cannot verify email. Check .env.local configuration and restart the server.");
        // console.log("Current firebaseAuth object in checkEmailAvailability:", JSON.stringify(firebaseAuth));
        return { available: false, error: "Email verification service is temporarily unavailable. Please ensure Firebase is configured correctly." };
    }

    const methods = await fetchSignInMethodsForEmail(firebaseAuth, validatedValues.email);
    if (methods.length > 0) {
      return { available: false, error: "This email is already registered. Please try logging in or use 'Forgot my password'." };
    }
    return { available: true };
  } catch (error: any) {
    let errorMessage = "Could not verify email availability due to an unexpected error.";
    if (error.code === 'auth/invalid-email') {
      return { available: false, error: "The email address is badly formatted." };
    }
    
    if (error.code) {
      console.error("Detailed Error in checkEmailAvailability:", error);
      console.error("Firebase Error Code in checkEmailAvailability:", error.code);
      errorMessage = `Could not verify email: ${error.message} (Code: ${error.code})`;
    } else if (error.message) {
      console.error("Detailed Error in checkEmailAvailability:", error);
      console.error("Firebase Error Message in checkEmailAvailability:", error.message);
       errorMessage = `Could not verify email: ${error.message}`;
    } else {
      console.error("Detailed Error in checkEmailAvailability:", error);
    }
    return { available: false, error: errorMessage };
  }
}


export async function signUpUser(values: z.infer<typeof SignUpDetailsInputSchema>): Promise<SignUpResult> {
  try {
    const validatedValues = SignUpDetailsInputSchema.parse(values);

    if (!firebaseAuth || !firebaseAuth.app) {
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
      isAgeCertified: false, 
      // Optional fields are omitted instead of being set to undefined
      connectedFitnessApps: [],
      connectedDiagnosticsServices: [],
      connectedInsuranceProviders: [],
    };

    if (!db || typeof doc !== 'function' || typeof setDoc !== 'function') {
        console.error("Firestore (db, doc, or setDoc) is not initialized correctly for profile creation in signUpUser. Potential .env.local issue or Firebase setup.");
        return { success: false, error: "Profile creation failed: Database service unavailable. Your account was created in Auth but profile data was not saved." };
    }

    try {
      await setDoc(doc(db, "users", userCredential.user.uid), initialProfile);
    } catch (firestoreError: any) {
      console.error("Error creating user profile in Firestore:", firestoreError);
      return { success: false, error: `Account created but profile setup failed: ${firestoreError.message}. Please contact support.` };
    }

    return { success: true, userId: userCredential.user.uid };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input data.', details: error.flatten() };
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
  details?: z.inferFlattenedErrors<typeof LoginInputSchema>; // Added details field
}

export async function loginUser(values: z.infer<typeof LoginInputSchema>): Promise<LoginResult> {
  try {
    const validatedValues = LoginInputSchema.parse(values);

    if (!firebaseAuth || !firebaseAuth.app) {
      return { success: false, error: "Authentication service is not available." };
    }

    const userCredential = await signInWithEmailAndPassword(
      firebaseAuth,
      validatedValues.email,
      validatedValues.password
    );
    const userId = userCredential.user.uid;

    if (!db || typeof doc !== 'function' || typeof getDoc !== 'function') {
        console.error("Firestore is not initialized correctly for profile fetching.");
        return { success: true, userId, userProfile: null, error: "Profile could not be fetched, but login succeeded."};
    }
    const userProfileDocRef = doc(db, "users", userId);
    const userProfileSnap = await getDoc(userProfileDocRef);

    if (!userProfileSnap.exists()) {
      console.error(`User profile not found for UID: ${userId}. This might happen if signup was interrupted or for new users before profile save.`);
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
    
    // Terms not accepted check will be primarily handled by (app)/layout.tsx which gets userProfile
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
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid login input.', details: error.flatten() };
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
}).refine(data => data.newPassword === data.confirmNewPassword, {
  message: "Passwords don't match.",
  path: ['confirmNewPassword'],
});


interface ForgotPasswordResult {
  success: boolean;
  error?: string;
  message?: string;
  errorCode?: string;
  details?: z.inferFlattenedErrors<typeof FinalResetPasswordSchema> | z.inferFlattenedErrors<typeof ForgotPasswordEmailSchema> | z.inferFlattenedErrors<typeof VerifyResetCodeSchema>; // For Zod errors
}

export async function sendPasswordResetCode(values: z.infer<typeof ForgotPasswordEmailSchema>): Promise<ForgotPasswordResult> {
  try {
    const validatedValues = ForgotPasswordEmailSchema.parse(values);

    if (!firebaseAuth || !firebaseAuth.app) {
        console.warn("Firebase Auth not properly initialized in sendPasswordResetCode.");
        return { success: false, error: "Password reset service is temporarily unavailable." };
    }

    const methods = await fetchSignInMethodsForEmail(firebaseAuth, validatedValues.email);
    if (methods.length === 0) {
      return { success: true, message: "If your email is registered, instructions to reset your password have been sent. This is a placeholder; code sending not implemented." };
    }

    console.log(`Simulating sending password reset code to ${validatedValues.email}. Code: 12345678 (placeholder)`);
    return { success: true, message: "If your email is registered, an 8-digit code has been sent. This is a placeholder; code sending not implemented." };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input.', details: error.flatten()};
    }
    console.error("Error in sendPasswordResetCode:", error);
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
     if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input.', details: error.flatten()};
    }
    console.error("Error in verifyPasswordResetCode:", error);
    return { success: false, error: "Code verification failed."};
  }
}

export async function resetPassword(values: z.infer<typeof FinalResetPasswordSchema>): Promise<ForgotPasswordResult> {
  try {
    const validatedValues = FinalResetPasswordSchema.parse(values);
    
    if (!firebaseAuth || !firebaseAuth.app) {
        console.warn("Firebase Auth not properly initialized in resetPassword.");
        return { success: false, error: "Password reset service is temporarily unavailable." };
    }
    const currentUser = firebaseAuth.currentUser; 

    if (currentUser && currentUser.email === validatedValues.email) {
      await firebaseUpdatePassword(currentUser, validatedValues.newPassword); 
      if (db && typeof doc === 'function' && typeof setDoc === 'function') {
        try {
          await setDoc(doc(db, "users", currentUser.uid), { lastPasswordChangeDate: new Date().toISOString() }, { merge: true });
        } catch (dbError) {
          console.error("Failed to update lastPasswordChangeDate in Firestore for current user:", dbError);
        }
      } else {
         console.warn("DB not available to update lastPasswordChangeDate for current user password reset.");
      }
      return { success: true, message: "Password has been reset successfully." };
    }

    if (validatedValues.email ) {
        console.warn("Attempting password reset for unauthenticated user via custom code flow. This needs a secure backend implementation using Firebase Admin SDK.");
        return { success: false, error: "Password reset for unauthenticated users via custom code requires a secure backend implementation. This feature is not fully implemented." };
    }

    return { success: false, error: "Could not reset password. User context mismatch or invalid flow." };

  } catch (error: any) {
    if (error instanceof z.ZodError) {
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
        await setDoc(doc(db, "users", userId), { acceptedLatestTerms: accepted, termsVersionAccepted: version }, { merge: true });
        return { success: true };
    } catch (error: any) {
        console.error("Error updating terms acceptance in Firestore:", error);
        return { success: false, error: "Failed to update terms acceptance."};
    }
}

    

    