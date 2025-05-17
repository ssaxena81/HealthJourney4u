
'use server';

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  updatePassword as firebaseUpdatePassword,
  type AuthError,
} from 'firebase/auth';
import { auth as firebaseAuth } from '@/lib/firebase/clientApp';
import { z } from 'zod';
import type { UserProfile, SubscriptionTier } from '@/types';
import { passwordSchema } from '@/types';
// TODO: Import firestore and functions to save/update user profile data (e.g. in a 'users' collection)

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
  details?: z.ZodError<any>; // Changed to any to match existing code
}

export async function checkEmailAvailability(values: z.infer<typeof CheckEmailInputSchema>): Promise<{ available: boolean; error?: string }> {
  try {
    const validatedValues = CheckEmailInputSchema.parse(values);
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

    // TODO: Create user profile in Firestore
    const initialProfile: UserProfile = { // Made this a full UserProfile to satisfy type
      id: userCredential.user.uid,
      email: userCredential.user.email!,
      subscriptionTier: validatedValues.subscriptionTier,
      lastPasswordChangeDate: new Date().toISOString(),
      acceptedLatestTerms: false, // User needs to accept T&C post-signup
      termsVersionAccepted: undefined, // Initialize
      // Initialize other profile fields as empty/default
      connectedFitnessApps: [],
      connectedDiagnosticsServices: [],
      connectedInsuranceProviders: [],
      // Add other fields from UserProfile with default/undefined values
      firstName: undefined,
      middleInitial: undefined,
      lastName: undefined,
      dateOfBirth: undefined,
      cellPhone: undefined,
      mfaMethod: undefined,
      paymentDetails: undefined,

    };
    // await db.collection('users').doc(userCredential.user.uid).set(initialProfile); // Example Firestore save

    return { success: true, userId: userCredential.user.uid };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input.', details: error as any }; // Changed to any
    }
    return { success: false, error: (error as AuthError).message || 'Sign up failed.', errorCode: (error as AuthError).code };
  }
}

// --- Login Schema ---
const LoginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, { message: "Password is required." }), // Min 1, specific complexity checked by Firebase on login
  mfaCode: z.string().optional(), // For 8-digit MFA code
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

    // TODO: Implement actual MFA check
    if (!validatedValues.mfaCode) {
      // This is a placeholder. A real app would check if user has MFA enabled.
      // For now, let's assume it is required for some users (e.g. based on profile settings)
      // const userRequiresMfa = true; // This would come from user's profile
      // if (userRequiresMfa) {
      //   return { success: false, requiresMfa: true, error: "MFA code required." };
      // }
    } else {
      // TODO: Verify MFA code if provided.
      // const isValidMfa = await verifyMfaCode(userId, validatedValues.mfaCode);
      // if (!isValidMfa) return { success: false, error: "Invalid MFA code." };
    }

    // --- Placeholder for userProfile fetch ---
    // TODO: Fetch real user profile from Firestore
    // const userProfileDoc = await db.collection('users').doc(userId).get();
    // if (!userProfileDoc.exists) return { success: false, error: "User profile not found." };
    // const userProfile = userProfileDoc.data() as UserProfile;
    const userProfile: UserProfile = { // This is MOCK data
      id: userId,
      email: validatedValues.email,
      subscriptionTier: 'free',
      lastPasswordChangeDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(), // Simulate 100 days ago
      acceptedLatestTerms: false, // Simulate not accepted
      termsVersionAccepted: '1.0', // Simulate old version accepted
      // other fields...
      connectedFitnessApps: [],
      connectedDiagnosticsServices: [],
      connectedInsuranceProviders: [],
      firstName: "Mock",
      lastName: "User",
      dateOfBirth: new Date(1990,0,1).toISOString(),
    };
    // --- End Placeholder ---


    // Check password expiry
    const lastPasswordChange = new Date(userProfile.lastPasswordChangeDate);
    const now = new Date();
    const daysSinceLastChange = (now.getTime() - lastPasswordChange.getTime()) / (1000 * 3600 * 24);
    if (daysSinceLastChange >= 90) {
      return { success: true, userId, passwordExpired: true, userProfile };
    }

    // Check T&C acceptance (assuming '2.0' is the latest)
    if (!userProfile.acceptedLatestTerms || userProfile.termsVersionAccepted !== '2.0') {
      return { success: true, userId, termsNotAccepted: true, userProfile };
    }
    
    return { success: true, userId, userProfile };

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input.' }; // Removed details to match simpler type
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

// Schema for the final step of resetting password (after code verification)
const FinalResetPasswordSchema = z.object({
  email: z.string().email(), // Email of the user resetting password
  newPassword: passwordSchema,
  confirmNewPassword: passwordSchema,
  // oobCode: z.string().optional(), // For Firebase's own reset links, if we integrate that
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
    // TODO: Implement custom 8-digit code sending (e.g., via Firebase Functions + SendGrid/Twilio)
    // For now, simulate success.
    console.log(`Simulating sending 8-digit code to ${validatedValues.email}`);
    // In a real scenario:
    // 1. Generate 8-digit code.
    // 2. Store it temporarily (e.g., Firestore with TTL) associated with the email/userId.
    // 3. Send it via email/SMS using the user's preferred MFA method if available, or email.
    return { success: true, message: "If your email is registered, an 8-digit code has been sent." };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input.'};
    }
    return { success: true, message: "If your email is registered, an 8-digit code has been sent." }; // Generic message
  }
}

export async function verifyPasswordResetCode(values: z.infer<typeof VerifyResetCodeSchema>): Promise<ForgotPasswordResult> {
  try {
    const validatedValues = VerifyResetCodeSchema.parse(values);
    // TODO: Implement custom 8-digit code verification against temporarily stored code.
    console.log(`Simulating verification of code ${validatedValues.code} for ${validatedValues.email}`);
    if (validatedValues.code === "12345678") { // Placeholder for actual verification
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

// This action is for resetting password when user IS LOGGED IN (e.g. forced reset, or change password in profile)
// OR for the final step of "forgot password" if identity is confirmed via oobCode or custom code.
export async function resetPassword(values: z.infer<typeof FinalResetPasswordSchema>): Promise<ForgotPasswordResult> {
  try {
    const validatedValues = FinalResetPasswordSchema.parse(values);
    const currentUser = firebaseAuth.currentUser;

    // Scenario 1: User is logged in (e.g., forced reset or changing password from profile)
    if (currentUser && currentUser.email === validatedValues.email) {
      await firebaseUpdatePassword(currentUser, validatedValues.newPassword);
      // TODO: Update lastPasswordChangeDate in Firestore for currentUser.uid
      // await db.collection('users').doc(currentUser.uid).update({ lastPasswordChangeDate: new Date().toISOString() });
      return { success: true, message: "Password has been reset successfully." };
    }
    
    // Scenario 2: User is NOT logged in, but has an oobCode from Firebase email link (not implemented fully yet)
    // if (validatedValues.oobCode) {
    //   await firebaseAuth.confirmPasswordReset(validatedValues.oobCode, validatedValues.newPassword);
    //   // Here, we don't have a currentUser to update Firestore directly.
    //   // The user needs to log in again. `lastPasswordChangeDate` might be updated on next login,
    //   // or by a backend trigger if using Firebase Functions.
    //   return { success: true, message: "Password reset. You can now log in." };
    // }

    // Scenario 3: Custom "forgot password" flow where user is not logged in, and we used a custom 8-digit code.
    // This is the most complex scenario security-wise without Firebase's oobCode.
    // Firebase's client-side `updatePassword` requires user to be signed in.
    // To do this securely without oobCode, the `verifyPasswordResetCode` step would need to
    // grant a temporary, secure session/token that this function can use to authorize the password change
    // for the specified email. This typically involves backend logic (Firebase Functions).
    // For now, this action primarily supports logged-in password changes or oobCode flow (if oobCode is passed).
    
    // If not logged in and no oobCode, this path is problematic for "forgot password".
    if (!currentUser) {
      console.warn("resetPassword action called for forgot password flow without oobCode or temporary auth. This is not secure for unauthenticated users without further backend implementation.");
      return { success: false, error: "Password reset for unauthenticated users via this path requires further implementation (oobCode or custom token flow)." };
    }

    return { success: false, error: "Could not reset password. User context mismatch or flow not fully supported." };

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input.'};
    }
    return { success: false, error: (error as AuthError).message || 'Password reset failed.', errorCode: (error as AuthError).code };
  }
}

// --- Update Profile Actions ---

// Schema for demographics data received by the server action
const DemographicsSchema = z.object({
  firstName: z.string().min(3, "First name must be at least 3 characters.").max(50).regex(/^[a-zA-Z\s'-]+$/, "First name can only contain letters.").trim(),
  middleInitial: z.string().max(1, "Middle initial can be at most 1 character.").trim().optional(),
  lastName: z.string().min(3, "Last name must be at least 3 characters.").max(50).regex(/^[a-zA-Z\s'-]+$/, "Last name can only contain letters.").trim(),
  dateOfBirth: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid date of birth" }), // Expecting ISO string
  email: z.string().email(), // Readonly from auth, for reference
  cellPhone: z.string().regex(/^$|^\d{3}-\d{3}-\d{4}$/, "Invalid phone format (e.g., 999-999-9999)").optional(),
}).refine(data => data.email || data.cellPhone, { 
    message: "Either email or cell phone must be provided.",
    path: ["cellPhone"], 
});


export async function updateDemographics(userId: string, values: z.infer<typeof DemographicsSchema>): Promise<{success: boolean, error?: string, data?: Partial<UserProfile>, details?: any}> {
    try {
        const validatedValues = DemographicsSchema.parse(values);
        // TODO: Update user profile in Firestore for userId with validatedValues
        console.log("Updating demographics for user:", userId, validatedValues);
        // const updatedProfileData: Partial<UserProfile> = {
        //   firstName: validatedValues.firstName,
        //   middleInitial: validatedValues.middleInitial,
        //   lastName: validatedValues.lastName,
        //   dateOfBirth: validatedValues.dateOfBirth, // Store as ISO string
        //   cellPhone: validatedValues.cellPhone,
        // };
        // await db.collection('users').doc(userId).update(updatedProfileData);
        // return { success: true, data: updatedProfileData };
        return { success: true, data: values }; // Return parsed values for optimistic update
    } catch (error: any) {
        if (error instanceof z.ZodError) {
          return { success: false, error: 'Invalid input.', details: error.flatten() };
        }
        return { success: false, error: "Failed to update profile." };
    }
}

// TODO: Actions for updating Fitness, Diagnostics, Insurance connections
// These will involve secure token handling if using OAuth, and communication with external APIs.
// Example structure:
// export async function updateFitnessConnections(userId: string, connections: UserProfile['connectedFitnessApps']): Promise<{success: boolean, error?: string}> { ... }
// export async function updateDiagnosticsConnections(userId: string, connections: UserProfile['connectedDiagnosticsServices']): Promise<{success: boolean, error?: string}> { ... }
// export async function updateInsuranceConnections(userId: string, connections: UserProfile['connectedInsuranceProviders']): Promise<{success: boolean, error?: string}> { ... }


export async function updateUserTermsAcceptance(userId: string, accepted: boolean, version: string): Promise<{success: boolean, error?: string}> {
    try {
        // TODO: Update user profile in Firestore
        console.log(`User ${userId} terms acceptance: ${accepted}, version: ${version}`);
        // await db.collection('users').doc(userId).update({ acceptedLatestTerms: accepted, termsVersionAccepted: version });
        return { success: true };
    } catch (error) {
        return { success: false, error: "Failed to update terms acceptance."};
    }
}

