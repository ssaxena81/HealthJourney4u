
'use server';

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  // sendPasswordResetEmail as firebaseSendPasswordResetEmail, // Not used for custom code flow
  updatePassword as firebaseUpdatePassword,
  type AuthError,
} from 'firebase/auth';
import { auth as firebaseAuth, db } from '@/lib/firebase/clientApp';
import { z } from 'zod';
import type { UserProfile, SubscriptionTier } from '@/types';
import { passwordSchema } from '@/types';
import { doc, setDoc, getDoc } from 'firebase/firestore'; // Import getDoc
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
      email: userCredential.user.email!,
      subscriptionTier: validatedValues.subscriptionTier,
      lastPasswordChangeDate: new Date().toISOString(),
      acceptedLatestTerms: false,
      isAgeCertified: false, // Initialize as false, user certifies in demographics
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
        return { success: false, error: "Profile creation failed: Database service unavailable." };
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
      return { success: false, error: 'Invalid input data.', details: error };
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
  userProfile?: UserProfile;
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
      // Forcing a basic profile creation here might be an option, or guiding user to complete profile.
      // For now, error out or return a specific state.
      return { success: false, error: "User profile not found. Please contact support or try signing up again." };
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
         console.warn("DB not available to update lastPasswordChangeDate");
      }
      return { success: true, message: "Password has been reset successfully." };
    }
    
    // TODO: Handle oobCode flow for password reset if Firebase default email links are used.
    // if (validatedValues.oobCode) { ... }

    if (!currentUser) {
      console.warn("resetPassword action called for forgot password flow without oobCode or temporary auth.");
      // This part of the flow (forgot password without being logged in) needs a different approach,
      // typically involving Firebase's sendPasswordResetEmail and handling the oobCode.
      // The current action is primarily for logged-in users forced to reset or changing their own password.
      // For true "forgot password" via email link, Firebase has a built-in flow.
      // If using custom 8-digit code, a temporary token should be issued after code verification
      // that this function can then use to authorize the password change.
      return { success: false, error: "Password reset for unauthenticated users requires a verification token (oobCode or custom)." };
    }

    return { success: false, error: "Could not reset password. User context mismatch or invalid flow." };

  } catch (error: any)
{
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input.'};
    }
    return { success: false, error: (error as AuthError).message || 'Password reset failed.', errorCode: (error as AuthError).code };
  }
}

// --- Update Profile Actions ---
const serverCalculateAge = (birthDateString: string): number => {
  const birthDate = new Date(birthDateString);
  if (isNaN(birthDate.getTime())) return 0; // Invalid date string
  return differenceInYears(new Date(), birthDate);
};

const DemographicsSchemaServer = z.object({
  firstName: z.string().min(3, "First name must be at least 3 characters.").max(50).regex(/^[a-zA-Z\s'-]+$/, "First name can only contain letters.").trim(),
  middleInitial: z.string().max(1, "Middle initial can be at most 1 character.").trim().optional(),
  lastName: z.string().min(3, "Last name must be at least 3 characters.").max(50).regex(/^[a-zA-Z\s'-]+$/, "Last name can only contain letters.").trim(),
  dateOfBirth: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid date of birth" })
                  .refine((val) => serverCalculateAge(val) >= 18, { message: "User must be 18 or older." }),
  email: z.string().email(), 
  cellPhone: z.string().regex(/^$|^\d{3}-\d{3}-\d{4}$/, "Invalid phone format (e.g., 999-999-9999)").optional(),
  isAgeCertified: z.boolean().optional(), // isAgeCertified is derived from ageCertification in client form
}).refine(data => data.email || data.cellPhone, { 
    message: "Either email or cell phone must be provided.",
    path: ["cellPhone"], 
}).refine(data => {
    // If user is 18+, certification must be true.
    // This assumes dateOfBirth string is valid due to prior refine.
    if (serverCalculateAge(data.dateOfBirth) >= 18) {
        return data.isAgeCertified === true;
    }
    // If user is under 18 (though prior refine should catch this), this check doesn't apply,
    // but the age check itself will fail.
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

        // Prepare data for Firestore, ensuring correct types (e.g., dateOfBirth is already string)
        const profileUpdateData: Partial<UserProfile> = {
            firstName: validatedValues.firstName,
            middleInitial: validatedValues.middleInitial,
            lastName: validatedValues.lastName,
            dateOfBirth: validatedValues.dateOfBirth, // Already ISO string from client
            cellPhone: validatedValues.cellPhone,
            isAgeCertified: validatedValues.isAgeCertified,
            // email is not typically updated here as it's tied to auth
        };
        
        await setDoc(doc(db, "users", userId), profileUpdateData, { merge: true });
        return { success: true, data: profileUpdateData };
    } catch (error: any) {
        if (error instanceof z.ZodError) {
          return { success: false, error: 'Invalid input.', details: error.flatten() };
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
