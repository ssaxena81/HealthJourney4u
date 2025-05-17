
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
import { passwordSchema } from '@/types'; // Import from types
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
  details?: z.ZodError<any>;
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
    const initialProfile: Partial<UserProfile> = {
      id: userCredential.user.uid,
      email: userCredential.user.email!,
      subscriptionTier: validatedValues.subscriptionTier,
      lastPasswordChangeDate: new Date().toISOString(),
      acceptedLatestTerms: false, // User needs to accept T&C post-signup
      // Initialize other profile fields as empty/default
      connectedFitnessApps: [],
      connectedDiagnosticsServices: [],
      connectedInsuranceProviders: [],
    };
    // await db.collection('users').doc(userCredential.user.uid).set(initialProfile); // Example Firestore save

    return { success: true, userId: userCredential.user.uid };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input.', details: error as any };
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
  // TODO: Add flags for T&C and password expiry
  passwordExpired?: boolean;
  termsNotAccepted?: boolean;
  userProfile?: UserProfile; // Send profile to client for checks
}

export async function loginUser(values: z.infer<typeof LoginInputSchema>): Promise<LoginResult> {
  try {
    const validatedValues = LoginInputSchema.parse(values);

    if (!firebaseAuth || typeof firebaseAuth.signInWithEmailAndPassword !== 'function') {
      return { success: false, error: "Authentication service is not available." };
    }
    
    // Step 1: Basic email/password authentication
    const userCredential = await signInWithEmailAndPassword(
      firebaseAuth,
      validatedValues.email,
      validatedValues.password
    );
    const userId = userCredential.user.uid;

    // TODO: Implement actual MFA check
    // For now, let's assume MFA is required and user needs to enter code
    // This part of logic would be more complex in real app, involving checking user's MFA settings
    if (!validatedValues.mfaCode) {
      // This is a simplified stub for MFA. In a real app, you'd check if MFA is enabled for the user.
      // If so, you'd send a code here (or earlier) and return requiresMfa: true.
      // Then, client would re-submit with the code.
      // For this iteration, we'll simulate this: if no code, ask for it.
      // This means login will initially "fail" to prompt for MFA if needed.
      // This is a placeholder for real MFA logic
      // return { success: false, requiresMfa: true, error: "MFA code required." };
    } else {
      // TODO: Verify MFA code if provided.
      // If mfaCode is provided, verify it. This logic is highly dependent on chosen MFA method.
      // const isValidMfa = await verifyMfaCode(userId, validatedValues.mfaCode);
      // if (!isValidMfa) return { success: false, error: "Invalid MFA code." };
    }

    // TODO: Fetch user profile from Firestore
    // const userProfileDoc = await db.collection('users').doc(userId).get();
    // if (!userProfileDoc.exists) return { success: false, error: "User profile not found." };
    // const userProfile = userProfileDoc.data() as UserProfile;
    
    // --- Placeholder for userProfile fetch ---
    const userProfile: UserProfile = { // This is MOCK data
      id: userId,
      email: validatedValues.email,
      subscriptionTier: 'free',
      lastPasswordChangeDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(), // 100 days ago
      acceptedLatestTerms: false,
      // other fields...
      connectedFitnessApps: [],
      connectedDiagnosticsServices: [],
      connectedInsuranceProviders: [],
    };
    // --- End Placeholder ---


    // Check password expiry
    const lastPasswordChange = new Date(userProfile.lastPasswordChangeDate);
    const now = new Date();
    const daysSinceLastChange = (now.getTime() - lastPasswordChange.getTime()) / (1000 * 3600 * 24);
    if (daysSinceLastChange >= 90) {
      return { success: true, userId, passwordExpired: true, userProfile }; // Logged in, but needs immediate redirect
    }

    // Check T&C acceptance
    // Assuming '2.0' is the latest T&C version string. This should come from a config.
    if (!userProfile.acceptedLatestTerms || userProfile.termsVersionAccepted !== '2.0') {
      return { success: true, userId, termsNotAccepted: true, userProfile }; // Logged in, but needs T&C redirect
    }
    
    return { success: true, userId, userProfile };

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input.', details: error as any };
    }
    return { success: false, error: (error as AuthError).message || 'Login failed.', errorCode: (error as AuthError).code };
  }
}


// --- Forgot Password Schemas ---
const ForgotPasswordEmailSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
});

const VerifyResetCodeSchema = z.object({
  email: z.string().email(), // Or a temporary token associated with the code
  code: z.string().length(8, { message: "Code must be 8 digits." }),
});

const ResetPasswordSchema = z.object({
  email: z.string().email(), // Or a temporary token
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
}

export async function sendPasswordResetCode(values: z.infer<typeof ForgotPasswordEmailSchema>): Promise<ForgotPasswordResult> {
  try {
    const validatedValues = ForgotPasswordEmailSchema.parse(values);
    // TODO: Implement custom 8-digit code sending (e.g., via Firebase Functions + SendGrid/Twilio)
    // Firebase's default `sendPasswordResetEmail` sends a link, not an 8-digit code for user to type.
    // For now, we'll use the standard Firebase method and the UI will need to adapt or this needs a custom backend.
    // This is a placeholder for the 8-digit code sending.
    // To stick to user's 8-digit code request, this needs custom implementation.
    // For now, let's pretend we sent a code and proceed.
    // In a real scenario:
    // 1. Generate 8-digit code.
    // 2. Store it temporarily (e.g., Firestore with TTL) associated with the email/userId.
    // 3. Send it via email/SMS.
    console.log(`Simulating sending 8-digit code to ${validatedValues.email}`);
    return { success: true, message: "If your email is registered, an 8-digit code has been sent." };

    // If using standard Firebase reset link:
    // await firebaseSendPasswordResetEmail(firebaseAuth, validatedValues.email);
    // return { success: true, message: "Password reset email sent. Please check your inbox." };

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input.'};
    }
    // Don't reveal if email exists or not for security, unless intended.
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
        return { success: false, error: "Invalid verification code."};
    }
  } catch (error: any) {
     if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input.'};
    }
    return { success: false, error: "Code verification failed."};
  }
}

export async function resetPassword(values: z.infer<typeof ResetPasswordSchema>): Promise<ForgotPasswordResult> {
  try {
    const validatedValues = ResetPasswordSchema.parse(values);
    const currentUser = firebaseAuth.currentUser;

    // This action should ideally be performed when the user is authenticated via the reset code/token.
    // Firebase's standard flow provides a token (oobCode) in the reset link.
    // If using custom 8-digit code, you need a way to re-authenticate or prove identity here
    // before changing password for security. This is complex.
    // Forcing a re-login before this step, or having a temporary auth token from code verification step is needed.
    
    // Assuming the user's identity is confirmed (e.g. by a temporary token from the code verification step)
    // For simplicity, if using Firebase client SDK for password reset AFTER `applyActionCode` (from link),
    // or if user is somehow re-authenticated temporarily.
    // This is a MAJOR simplification. A secure custom flow is much more involved.
    // One way with custom code: user enters code, you verify it, issue a short-lived custom token,
    // user uses that token to call this resetPassword function.

    // If relying on Firebase context (e.g. user clicked link and is on reset page served by your app with oobCode)
    // you'd use confirmPasswordReset with the oobCode.

    // Since we're simulating a custom flow and don't have oobCode from Firebase link:
    // This part is tricky without the oobCode or a re-authentication mechanism.
    // Firebase's `updatePassword` requires the user to be currently signed in.
    // If the user is not signed in (which they wouldn't be in a typical forgot password flow before this point),
    // this will fail. This highlights the complexity of deviating from Firebase standard reset link.

    // Let's assume for this action, the user IS signed in (e.g. forced password reset flow)
    if (!currentUser) {
        // This path for "forgot password" flow is problematic without oobCode.
        // For "forced password reset" where user IS logged in, this is okay.
        // TODO: Properly handle the oobCode flow for actual password reset links from Firebase.
        // For now, this action primarily supports logged-in password changes.
        // If an oobCode is passed (e.g. from URL query params), it should be handled here using `confirmPasswordReset`.
        console.warn("resetPassword action called without a logged-in user and no oobCode handling. This is for forced reset or change password.");
        return { success: false, error: "User not authenticated. This action is for logged-in users changing their password or after oobCode verification." };
    }
    
    await firebaseUpdatePassword(currentUser, validatedValues.newPassword);

    // TODO: Update lastPasswordChangeDate in Firestore for currentUser.uid
    // await db.collection('users').doc(currentUser.uid).update({ lastPasswordChangeDate: new Date().toISOString() });

    return { success: true, message: "Password has been reset successfully." };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input.'};
    }
    return { success: false, error: (error as AuthError).message || 'Password reset failed.', errorCode: (error as AuthError).code };
  }
}

// --- Update Profile Action (Simplified) ---
const DemographicsSchema = z.object({
  firstName: z.string().min(3).max(50).regex(/^[a-zA-Z\s'-]+$/, "First name can only contain letters.").trim(),
  middleInitial: z.string().max(1).optional().trim(),
  lastName: z.string().min(3).max(50).regex(/^[a-zA-Z\s'-]+$/, "Last name can only contain letters.").trim(),
  dateOfBirth: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid date of birth" }),
  cellPhone: z.string().regex(/^$|^\d{3}-\d{3}-\d{4}$/, "Invalid phone format (e.g., 999-999-9999)").optional(),
  email: z.string().email(), // Readonly, for reference
}).refine(data => data.email || data.cellPhone, { 
    message: "Either email or cell phone must be provided.",
    path: ["cellPhone"], 
});


export async function updateDemographics(userId: string, values: z.infer<typeof DemographicsSchema>): Promise<{success: boolean, error?: string, data?: UserProfile, details?: any}> {
    try {
        const validatedValues = DemographicsSchema.parse(values);
        // TODO: Update user profile in Firestore for userId with validatedValues
        console.log("Updating demographics for user:", userId, validatedValues);
        // const updatedProfile = { ... }; // Get updated profile
        // return { success: true, data: updatedProfile };
        return { success: true };
    } catch (error: any) {
        if (error instanceof z.ZodError) {
          return { success: false, error: 'Invalid input.', details: error.flatten() };
        }
        return { success: false, error: "Failed to update profile." };
    }
}

// TODO: Actions for updating Fitness, Diagnostics, Insurance connections
// These will involve secure token handling if using OAuth, and communication with external APIs.

export async function updateUserTermsAcceptance(userId: string, accepted: boolean, version?: string): Promise<{success: boolean, error?: string}> {
    try {
        // TODO: Update user profile in Firestore
        console.log(`User ${userId} terms acceptance: ${accepted}, version: ${version}`);
        // await db.collection('users').doc(userId).update({ acceptedLatestTerms: accepted, termsVersionAccepted: version });
        return { success: true };
    } catch (error) {
        return { success: false, error: "Failed to update terms acceptance."};
    }
}
