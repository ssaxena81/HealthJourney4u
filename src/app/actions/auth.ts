
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

    if (!firebaseAuth || typeof firebaseAuth.app?.name !== 'string' || firebaseAuth.app.name === '[DEFAULT]') { // Check if firebaseAuth is a real instance
        // If firebaseAuth is not properly initialized (e.g. missing env vars), we can't check.
        // This scenario should ideally be caught by broader app health checks.
        // For now, let's be pessimistic to avoid false positives.
        console.warn("Firebase Auth not properly initialized in checkEmailAvailability. Cannot verify email.");
        return { available: false, error: "Email verification service is temporarily unavailable." };
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
    // Handle other potential errors from fetchSignInMethodsForEmail, though most common is invalid-email
    console.error("Error in checkEmailAvailability:", error);
    return { available: false, error: "Could not verify email availability due to an unexpected error." };
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

    const initialProfile: UserProfile = {
      id: userCredential.user.uid,
      email: userCredential.user.email!,
      subscriptionTier: validatedValues.subscriptionTier,
      lastPasswordChangeDate: new Date().toISOString(),
      acceptedLatestTerms: false, 
      isAgeCertified: false, // Certified during demographics step
      // Initialize other profile fields as empty/default
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
        console.error("Firestore (db, doc, or setDoc) is not initialized correctly for profile creation.");
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
  userProfile?: UserProfile | null; // Can be null if not found or error
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
        return { success: false, error: "Login failed: Could not retrieve user profile." };
    }
    const userProfileDocRef = doc(db, "users", userId);
    const userProfileSnap = await getDoc(userProfileDocRef);

    if (!userProfileSnap.exists()) {
      console.error(`User profile not found for UID: ${userId}. This might happen if signup was interrupted.`);
      // This case is critical. User is authenticated but has no profile.
      // Redirect to profile page or show an error.
      // For now, returning a state that indicates profile is missing.
      return { success: false, error: "User profile not found. Please complete your profile setup or contact support.", errorCode: "auth/profile-not-found" };
    }
    const userProfile = userProfileSnap.data() as UserProfile;
    // --- End Profile fetch ---

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
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
         return { success: false, error: 'Invalid email or password.', errorCode: error.code };
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
    // Important: Before sending a code, verify the email exists.
    const emailCheck = await checkEmailAvailability(values);
    if (emailCheck.available) { // If email does NOT exist, we shouldn't say we sent a code
        return { success: true, message: "If your email is registered, an 8-digit code has been sent. This is a placeholder; code sending not implemented." }; // Message adjusted for clarity
    }
    return { success: true, message: "If your email is registered, an 8-digit code has been sent. This is a placeholder; code sending not implemented." };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input.'};
    }
    // Generic message to avoid confirming email existence to unauthenticated users
    return { success: true, message: "If your email is registered, an 8-digit code has been sent. This is a placeholder; code sending not implemented." }; 
  }
}

export async function verifyPasswordResetCode(values: z.infer<typeof VerifyResetCodeSchema>): Promise<ForgotPasswordResult> {
  try {
    const validatedValues = VerifyResetCodeSchema.parse(values);
    // TODO: Implement custom 8-digit code verification against temporarily stored code.
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
      if (db && typeof doc === 'function' && typeof setDoc === 'function') {
        await setDoc(doc(db, "users", currentUser.uid), { lastPasswordChangeDate: new Date().toISOString() }, { merge: true });
      } else {
         console.warn("DB not available to update lastPasswordChangeDate for current user password reset.");
      }
      return { success: true, message: "Password has been reset successfully." };
    }
    
    // TODO: Handle oobCode flow for password reset if Firebase default email links are used.
    // if (validatedValues.oobCode) { ... }

    // TODO: For forgot password flow (where user is not logged in),
    // after custom code verification (verifyPasswordResetCode), a temporary session/token
    // might be needed to authorize this password change for validatedValues.email.
    // Or, use Firebase's built-in `confirmPasswordReset` with an oobCode if using that flow.
    // The current structure is best for logged-in users (forced reset or profile change).
    // For "forgot password", this part requires more robust implementation if not using Firebase's email links.
    // For now, assuming if no currentUser, and no oobCode path (which is not built), this is an invalid state for this action.
    // A placeholder success for custom code flow where user is not logged in yet:
    // This part would need a secure way to confirm the user's identity again before changing password.
    // This example doesn't implement that secure token exchange for unauthenticated users.
    console.warn("Attempting password reset for unauthenticated user without oobCode. This flow is not fully secure without further token implementation after code verification.");
    // Placeholder: In a real scenario, you'd re-verify user (e.g. via a temporary token from `verifyPasswordResetCode`)
    // and then update the password. Since Firebase client SDK cannot update password for *another* user,
    // this ideally needs Admin SDK for unauth reset, or use Firebase's standard reset flow.
    // Simulating success for demo, but THIS IS NOT PRODUCTION READY for unauthenticated users.
    if (validatedValues.email) { // Simulating the user has been "verified" by the code step
         // This is where direct password update for an unauthenticated user via Client SDK is problematic.
         // Firebase Admin SDK would be `admin.auth().updateUser(uid, { password: newPassword })` after finding UID by email.
         // For client-side based server action, this part is tricky without Firebase's OOB code.
         // We will assume this action is called only when user is logged-in OR Firebase OOB flow is used.
         // The custom code flow is not fully fleshed out here for unauthenticated password change.
         return { success: false, error: "Password reset for unauthenticated users via custom code is not fully implemented in this action. Use Firebase's email link method or enhance this action." };
    }


    return { success: false, error: "Could not reset password. User context mismatch or invalid flow." };

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input.'};
    }
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
  isAgeCertified: z.boolean().optional(), // isAgeCertified is derived from ageCertification in client form
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
    path: ["isAgeCertified"], // Path should ideally match client form field for certification
});


export async function updateDemographics(userId: string, values: z.infer<typeof DemographicsSchemaServer>): Promise<{success: boolean, error?: string, data?: Partial<UserProfile>, details?: any}> {
    try {
        // Note: `values.email` is passed but typically not changed here.
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
            // email is not updated via this demographic form
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
        await setDoc(doc(db, "users", userId), { acceptedLatestTerms: accepted, termsVersionAccepted: version, lastPasswordChangeDate: new Date().toISOString() }, { merge: true });
        return { success: true };
    } catch (error: any) {
        console.error("Error updating terms acceptance in Firestore:", error);
        return { success: false, error: "Failed to update terms acceptance."};
    }
}
