
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
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
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
  userId?: string; // Only userId on success now
  error?: string;
  errorCode?: string;
  details?: z.inferFlattenedErrors<typeof SignUpDetailsInputSchema>;
  userProfile?: UserProfile; // For client context update
}

export async function checkEmailAvailability(values: z.infer<typeof CheckEmailInputSchema>): Promise<{ available: boolean; error?: string }> {
  console.log("[CHECK_EMAIL_AVAILABILITY_START] Checking email:", values.email);
  try {
    const validatedValues = CheckEmailInputSchema.parse(values);
    console.log("[CHECK_EMAIL_AVAILABILITY_VALIDATED] Email validated by Zod:", validatedValues.email);

    if (!firebaseAuth || !firebaseAuth.app) {
        console.warn("[CHECK_EMAIL_AVAILABILITY_FIREBASE_NOT_READY] Firebase Auth not properly initialized in checkEmailAvailability. Cannot verify email. Check .env.local configuration and restart the server. DB App:", db?.app);
        return { available: false, error: "Email verification service is temporarily unavailable. Please ensure Firebase is configured correctly." };
    }
    console.log("[CHECK_EMAIL_AVAILABILITY_FIREBASE_READY] Firebase Auth instance seems okay.");

    try {
        const methods = await fetchSignInMethodsForEmail(firebaseAuth, validatedValues.email);
        console.log("[CHECK_EMAIL_AVAILABILITY_FIREBASE_METHODS_FETCHED] Sign-in methods fetched:", methods);
        if (methods.length > 0) {
          console.log("[CHECK_EMAIL_AVAILABILITY_EMAIL_IN_USE] Email is already registered.");
          return { available: false, error: "This email is already registered. Please try logging in or use 'Forgot my password'." };
        }
        console.log("[CHECK_EMAIL_AVAILABILITY_EMAIL_AVAILABLE] Email is available.");
        return { available: true };
    } catch (firebaseError: any) {
        console.error("[CHECK_EMAIL_AVAILABILITY_FIREBASE_ERROR] Detailed Error in checkEmailAvailability (server log - firebaseError):", firebaseError);
        if (firebaseError.code) {
          console.error("[CHECK_EMAIL_AVAILABILITY_FIREBASE_ERROR_CODE] Firebase Error Code in checkEmailAvailability (server log):", firebaseError.code);
        }
        if (firebaseError.message) {
          console.error("[CHECK_EMAIL_AVAILABILITY_FIREBASE_ERROR_MESSAGE] Firebase Error Message in checkEmailAvailability (server log):", firebaseError.message);
        }
        if (firebaseError.code === 'auth/invalid-email') {
          return { available: false, error: "The email address is badly formatted." };
        }
        return { available: false, error: `Could not verify email availability. ${String(firebaseError.message || 'Internal error')}` };
    }
  } catch (error: any) {
    console.error("[CHECK_EMAIL_AVAILABILITY_OUTER_ERROR] Unexpected error in checkEmailAvailability (server log - error):", error);
    if (error instanceof z.ZodError) {
        console.error("[CHECK_EMAIL_AVAILABILITY_ZOD_ERROR_DETAILS] ZodError:", error.flatten());
        return { available: false, error: "Invalid email format provided." };
    }
    return { available: false, error: "An unexpected error occurred while checking email availability. Please try again." };
  }
}


export async function signUpUser(values: z.infer<typeof SignUpDetailsInputSchema>): Promise<SignUpResult> {
  console.log("[SIGNUP_ACTION_START] signUpUser action initiated with email:", values.email, "tier:", values.subscriptionTier);
  try {
    const validatedValues = SignUpDetailsInputSchema.parse(values);
    console.log("[SIGNUP_ACTION_VALIDATION_PASSED] Input validation passed for email:", validatedValues.email);

    if (!firebaseAuth || !firebaseAuth.app) {
      console.error("[SIGNUP_FIREBASE_AUTH_NOT_READY] Firebase Auth is not initialized correctly in signUpUser. Potential .env.local issue.");
      return { success: false, error: "Authentication service is not available. Please configure Firebase.", errorCode: 'AUTH_UNAVAILABLE' };
    }
    console.log("[SIGNUP_ACTION_FIREBASE_AUTH_CHECK_PASSED] Firebase Auth instance seems okay for email:", validatedValues.email);

    let userCredential;
    try {
      console.log("[SIGNUP_ACTION_CREATE_USER_START] Attempting to create user in Firebase Auth for email:", validatedValues.email);
      userCredential = await createUserWithEmailAndPassword(
        firebaseAuth,
        validatedValues.email,
        validatedValues.password
      );
      console.log("[SIGNUP_ACTION_CREATE_USER_SUCCESS] Firebase Auth user created successfully. UID:", userCredential.user.uid, "for email:", validatedValues.email);
    } catch (authError: any) {
      console.error("[SIGNUP_AUTH_ERROR] Error during Firebase Auth user creation for email:", validatedValues.email, "Error:", authError);
      if ((authError as AuthError).code === 'auth/email-already-in-use') {
        return { success: false, error: 'This email address is already in use. Please log in or use a different email.', errorCode: (authError as AuthError).code };
      }
      return { success: false, error: String((authError as AuthError).message || 'Firebase Auth user creation failed.'), errorCode: String((authError as AuthError).code || 'AUTH_ERROR') };
    }

    const initialProfile: UserProfile = {
      id: userCredential.user.uid,
      email: userCredential.user.email!,
      subscriptionTier: validatedValues.subscriptionTier,
      lastPasswordChangeDate: new Date().toISOString(),
      acceptedLatestTerms: false,
      isAgeCertified: false,
      // Initialize other fields as undefined or empty arrays if they are optional
      // This avoids writing 'undefined' to Firestore which is not allowed
      connectedFitnessApps: [],
      connectedDiagnosticsServices: [],
      connectedInsuranceProviders: [],
      // other optional fields like firstName, lastName etc. are omitted and will be added during profile setup
    };
    console.log("[SIGNUP_ACTION_PROFILE_OBJECT_CREATED] Initial profile object created for UID:", initialProfile.id);

    if (!db || !db.app || typeof doc !== 'function' || typeof setDoc !== 'function') {
        console.error("[SIGNUP_FIRESTORE_NOT_READY] Firestore (db, doc, or setDoc) is not initialized correctly for profile creation. DB App:", db?.app);
        return { success: false, error: "Profile creation failed: Database service unavailable. Your account was created in Auth but profile data was not saved.", errorCode: 'FIRESTORE_UNAVAILABLE' };
    }
    console.log("[SIGNUP_ACTION_FIRESTORE_CHECK_PASSED] Firestore instance seems okay for UID:", userCredential.user.uid);

    try {
      console.log("[SIGNUP_ACTION_FIRESTORE_SETDOC_START] Attempting to save profile to Firestore for UID:", userCredential.user.uid);
      await setDoc(doc(db, "users", userCredential.user.uid), initialProfile);
      console.log("[SIGNUP_ACTION_FIRESTORE_SETDOC_SUCCESS] Profile saved to Firestore successfully for UID:", userCredential.user.uid);
    } catch (firestoreError: any) {
      console.error("[SIGNUP_FIRESTORE_ERROR] Error creating user profile in Firestore for UID:", userCredential.user.uid, "Error:", firestoreError);
      const errorMessage = String(firestoreError.message || 'Database error during profile creation.');
      const errorCode = String(firestoreError.code || 'FIRESTORE_ERROR');
      return { success: false, error: `Account created but profile setup failed: ${errorMessage}. Please contact support.`, errorCode: errorCode };
    }

    console.log("[SIGNUP_ACTION_SUCCESS] signUpUser action completed successfully for UID:", userCredential.user.uid);
    return { success: true, userId: userCredential.user.uid, userProfile: initialProfile };
  } catch (error: any) {
    console.error("[SIGNUP_ACTION_RAW_ERROR] Raw error in signUpUser:", error);
    if (error instanceof z.ZodError) {
        console.error("[SIGNUP_ACTION_ZOD_DETAILS] ZodError:", error.flatten());
        return { success: false, error: 'Invalid input data.', details: error.flatten() };
    }
    const errorMessage = String((error as AuthError).message || 'An unexpected error occurred during account creation.');
    const errorCode = String((error as AuthError).code || 'UNKNOWN_AUTH_ERROR');
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
  console.log("[LOGIN_ACTION_START] loginUser action initiated for email:", values.email);
  try {
    const validatedValues = LoginInputSchema.parse(values);
    console.log("[LOGIN_ACTION_VALIDATION_PASSED] Input validation passed for email:", validatedValues.email);

    if (!firebaseAuth || !firebaseAuth.app) {
      console.error("[LOGIN_FIREBASE_AUTH_NOT_READY] Firebase Auth is not initialized correctly in loginUser.");
      return { success: false, error: "Authentication service is not available.", errorCode: 'AUTH_UNAVAILABLE' };
    }
     console.log("[LOGIN_ACTION_FIREBASE_AUTH_CHECK_PASSED] Firebase Auth instance seems okay for email:", validatedValues.email);

    let userCredential;
    try {
      console.log("[LOGIN_ACTION_SIGNIN_START] Attempting to sign in user with Firebase Auth for email:", validatedValues.email);
      userCredential = await signInWithEmailAndPassword(
        firebaseAuth,
        validatedValues.email,
        validatedValues.password
      );
      console.log("[LOGIN_ACTION_SIGNIN_SUCCESS] Firebase Auth sign-in successful. UID:", userCredential.user.uid, "for email:", validatedValues.email);
    } catch (authError: any) {
      console.error("[LOGIN_AUTH_ERROR] Error during Firebase Auth sign-in for email:", validatedValues.email, "Error:", authError);
      if ((authError as AuthError).code === 'auth/user-not-found' || (authError as AuthError).code === 'auth/wrong-password' || (authError as AuthError).code === 'auth/invalid-credential') {
        return { success: false, error: 'Invalid email or password.', errorCode: (authError as AuthError).code };
      }
      return { success: false, error: String((authError as AuthError).message || 'Firebase Auth sign-in failed.'), errorCode: String((authError as AuthError).code || 'AUTH_ERROR') };
    }
    
    const userId = userCredential.user.uid;

    if (!db || !db.app || typeof doc !== 'function' || typeof getDoc !== 'function') {
        console.error("[LOGIN_FIRESTORE_NOT_READY] Firestore (db, doc, or getDoc) is not initialized correctly for profile fetching. DB App:", db?.app);
        return { success: true, userId, userProfile: null, error: "Profile could not be fetched, but login succeeded.", errorCode: 'FIRESTORE_UNAVAILABLE' };
    }
    console.log("[LOGIN_ACTION_FIRESTORE_CHECK_PASSED] Firestore instance seems okay for profile fetch for UID:", userId);

    let userProfileSnap;
    try {
      console.log("[LOGIN_ACTION_FIRESTORE_GETDOC_START] Attempting to fetch profile from Firestore for UID:", userId);
      const userProfileDocRef = doc(db, "users", userId);
      userProfileSnap = await getDoc(userProfileDocRef);
      console.log("[LOGIN_ACTION_FIRESTORE_GETDOC_SUCCESS] Profile fetch attempt completed for UID:", userId, ". Exists:", userProfileSnap.exists());
    } catch (firestoreError: any) {
      console.error("[LOGIN_FIRESTORE_ERROR] Error fetching user profile from Firestore for UID:", userId, "Error:", firestoreError);
      return { success: true, userId, userProfile: null, error: `Login succeeded but profile fetch failed: ${String(firestoreError.message || 'Database error')}.`, errorCode: String(firestoreError.code || 'FIRESTORE_ERROR')};
    }
    

    if (!userProfileSnap.exists()) {
      console.error(`[LOGIN_PROFILE_NOT_FOUND] User profile not found for UID: ${userId} in loginUser.`);
      return { success: true, userId, userProfile: null, errorCode: "auth/profile-not-found" };
    }
    const userProfile = userProfileSnap.data() as UserProfile;

    if (userProfile.lastPasswordChangeDate) {
      const lastPasswordChange = new Date(userProfile.lastPasswordChangeDate);
      const now = new Date();
      const daysSinceLastChange = (now.getTime() - lastPasswordChange.getTime()) / (1000 * 3600 * 24);
      if (daysSinceLastChange >= 90) {
        console.log(`[LOGIN_ACTION_PASSWORD_EXPIRED] Password expired for user ${userId}.`);
        return { success: true, userId, passwordExpired: true, userProfile };
      }
    } else {
      console.warn(`[LOGIN_PASSWORD_DATE_MISSING] User ${userId} missing lastPasswordChangeDate. Treating as password expired.`);
      return { success: true, userId, passwordExpired: true, userProfile };
    }
    
    if (userProfile.mfaMethod && !validatedValues.mfaCode) {
      console.log(`[LOGIN_MFA_REQUIRED] MFA required for user ${userId} via ${userProfile.mfaMethod}. No code provided yet.`);
      return { success: false, requiresMfa: true, error: "MFA code required. Please check your device.", userProfile };
    }
    
    if (userProfile.mfaMethod && validatedValues.mfaCode) {
      // TODO: Implement actual MFA code validation.
      const isValidMfaCode = validatedValues.mfaCode.length === 8; 
      console.log(`[LOGIN_MFA_VALIDATION] MFA code provided for user ${userId}: ${validatedValues.mfaCode}. Placeholder validation result: ${isValidMfaCode}`);
      if (!isValidMfaCode) {
        return { success: false, error: "Invalid MFA code.", userProfile };
      }
    }

    console.log("[LOGIN_ACTION_SUCCESS] loginUser action completed successfully for UID:", userId);
    return { success: true, userId, userProfile };

  } catch (error: any) {
    console.error("[LOGIN_ACTION_RAW_ERROR] Raw error in loginUser:", error);
    if (error instanceof z.ZodError) {
      console.error("[LOGIN_ACTION_ZOD_DETAILS] ZodError:", error.flatten());
      return { success: false, error: 'Invalid login input.', details: error.flatten() };
    }
    const errorMessage = String((error as AuthError).message || 'An unexpected error occurred during login.');
    const errorCode = String((error as AuthError).code || 'UNKNOWN_LOGIN_ERROR');
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
  console.log("[SEND_RESET_CODE_START] Action initiated for email:", values.email);
  try {
    const validatedValues = ForgotPasswordEmailSchema.parse(values);
    console.log("[SEND_RESET_CODE_VALIDATED] Email validated by Zod:", validatedValues.email);

    if (!firebaseAuth || !firebaseAuth.app) {
        console.warn("[SEND_RESET_CODE_FIREBASE_NOT_READY] Firebase Auth not properly initialized in sendPasswordResetCode.");
        return { success: false, error: "Password reset service is temporarily unavailable.", errorCode: 'AUTH_UNAVAILABLE' };
    }
    console.log("[SEND_RESET_CODE_FIREBASE_READY] Firebase Auth instance seems okay.");

    const methods = await fetchSignInMethodsForEmail(firebaseAuth, validatedValues.email);
    console.log("[SEND_RESET_CODE_METHODS_FETCHED] Sign-in methods fetched for email:", validatedValues.email, methods);
    if (methods.length === 0) {
      console.log("[SEND_RESET_CODE_EMAIL_NOT_FOUND] Email not found, sending generic message.");
      return { success: true, message: "If your email is registered, instructions to reset your password have been sent. This is a placeholder; code sending not implemented." };
    }

    console.log(`[SEND_RESET_CODE_SIMULATION] Simulating sending password reset code to ${validatedValues.email}. Code: 12345678 (placeholder)`);
    return { success: true, message: "If your email is registered, an 8-digit code has been sent. This is a placeholder; code sending not implemented." };
  } catch (error: any) {
    console.error("[SEND_RESET_CODE_ACTION_RAW_ERROR] Raw error in sendPasswordResetCode:", error);
    if (error instanceof z.ZodError) {
      console.error("[SEND_RESET_CODE_ACTION_ZOD_DETAILS] ZodError:", error.flatten());
      return { success: false, error: 'Invalid input.', details: error.flatten()};
    }
    return { success: true, message: "If your email is registered, an 8-digit code has been sent. This is a placeholder; code sending not implemented." };
  }
}

export async function verifyPasswordResetCode(values: z.infer<typeof VerifyResetCodeSchema>): Promise<ForgotPasswordResult> {
  console.log("[VERIFY_RESET_CODE_START] Action initiated for email:", values.email, "with code (first 2 chars):", values.code.substring(0,2));
  try {
    const validatedValues = VerifyResetCodeSchema.parse(values);
    console.log("[VERIFY_RESET_CODE_VALIDATED] Input validated by Zod.");
    if (validatedValues.code === "12345678") { 
        console.log("[VERIFY_RESET_CODE_SUCCESS] Placeholder code matched.");
        return { success: true };
    } else {
        console.log("[VERIFY_RESET_CODE_FAILURE] Placeholder code did not match.");
        return { success: false, error: "Invalid or expired verification code."};
    }
  } catch (error: any)
