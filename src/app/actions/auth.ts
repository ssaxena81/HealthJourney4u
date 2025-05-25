
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
import { doc, setDoc, getDoc, updateDoc, query, where, getDocs, collection, Timestamp } from 'firebase/firestore';
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
  details?: z.inferFlattenedErrors<typeof SignUpDetailsInputSchema>; // Updated to use flattened errors
  userProfile?: UserProfile; // To return the created profile
}

export async function checkEmailAvailability(values: z.infer<typeof CheckEmailInputSchema>): Promise<{ available: boolean; error?: string; errorCode?: string }> {
  console.log("[CHECK_EMAIL_AVAILABILITY_START] Checking email:", values.email);
  try {
    const validatedValues = CheckEmailInputSchema.parse(values);
    console.log("[CHECK_EMAIL_AVAILABILITY_VALIDATED] Email validated by Zod:", validatedValues.email);

    if (!firebaseAuth || !firebaseAuth.app) { // Check if firebaseAuth and its app property are initialized
        console.warn("[CHECK_EMAIL_AVAILABILITY_FIREBASE_NOT_READY] Firebase Auth not properly initialized in checkEmailAvailability. Cannot verify email. Check .env.local configuration and restart the server. DB App:", db?.app);
        return { available: false, error: "Email verification service is temporarily unavailable. Please ensure Firebase is configured correctly.", errorCode: 'AUTH_SERVICE_UNAVAILABLE' };
    }
    console.log("[CHECK_EMAIL_AVAILABILITY_FIREBASE_READY] Firebase Auth instance seems okay.");

    try {
        const methods = await fetchSignInMethodsForEmail(firebaseAuth, validatedValues.email);
        console.log("[CHECK_EMAIL_AVAILABILITY_FIREBASE_METHODS_FETCHED] Sign-in methods fetched:", methods);
        if (methods.length > 0) {
          console.log("[CHECK_EMAIL_AVAILABILITY_EMAIL_IN_USE] Email is already registered.");
          return { available: false, error: "This email is already registered. Please try logging in or use 'Forgot my password'.", errorCode: 'auth/email-already-in-use' };
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
          return { available: false, error: "The email address is badly formatted.", errorCode: firebaseError.code };
        }
        // Log a generic error to the server but provide a user-friendly message
        return { available: false, error: `Could not verify email availability. Error: ${String(firebaseError.message || 'Unknown Firebase error')}`, errorCode: firebaseError.code || 'UNKNOWN_FIREBASE_ERROR' };
    }
  } catch (error: any) {
    console.error("[CHECK_EMAIL_AVAILABILITY_OUTER_ERROR] Raw error in checkEmailAvailability (server log - error):", error);
    if (error instanceof z.ZodError) {
        console.error("[CHECK_EMAIL_AVAILABILITY_ZOD_ERROR_DETAILS] ZodError:", error.flatten());
        return { available: false, error: "Invalid email format provided.", errorCode: 'VALIDATION_ERROR' };
    }
    return { available: false, error: "An unexpected error occurred while checking email availability. Please try again.", errorCode: 'UNEXPECTED_ERROR' };
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
      connectedFitnessApps: [],
      connectedDiagnosticsServices: [],
      connectedInsuranceProviders: [],
      // Optional fields are not included if undefined
    };
    console.log("[SIGNUP_ACTION_PROFILE_OBJECT_CREATED] Initial profile object created for UID:", initialProfile.id, initialProfile);

    if (!db || !db.app || typeof doc !== 'function' || typeof setDoc !== 'function') {
        console.error("[SIGNUP_FIRESTORE_NOT_READY] Firestore (db, doc, or setDoc) is not initialized correctly for profile creation. DB App:", db?.app);
        return { success: false, error: "Profile creation failed: Database service unavailable. Your account was created in Auth but profile data was not saved.", errorCode: 'FIRESTORE_UNAVAILABLE', userProfile: initialProfile };
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
      return { success: false, error: `Account created but profile setup failed: ${errorMessage}. Please contact support.`, errorCode: errorCode, userProfile: initialProfile };
    }

    console.log("[SIGNUP_ACTION_SUCCESS] signUpUser action completed successfully for UID:", userCredential.user.uid);
    return { success: true, userId: userCredential.user.uid, userProfile: initialProfile };
  } catch (error: any)
   {
    console.error("[SIGNUP_OUTER_ERROR] Raw error in signUpUser:", error);
    if (error instanceof z.ZodError) {
        console.error("[SIGNUP_ZOD_DETAILS] ZodError:", error.flatten());
        return { success: false, error: 'Invalid input data.', details: error.flatten(), errorCode: 'VALIDATION_ERROR' };
    }
    const errorMessage = String((error as AuthError).message || 'An unexpected error occurred during account creation.');
    const errorCode = String((error as AuthError).code || 'UNKNOWN_AUTH_ERROR');
    console.error(`[SIGNUP_ACTION_ERROR] Error: ${errorMessage}, Code: ${errorCode}`);
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

    if (!db || !db.app || typeof doc !== 'function' || typeof getDoc !== 'function' || typeof updateDoc !== 'function') {
        console.error("[LOGIN_FIRESTORE_NOT_READY] Firestore (db, doc, getDoc, or updateDoc) is not initialized correctly. DB App:", db?.app);
        return { success: true, userId, userProfile: null, error: "Profile could not be fetched or updated, but login succeeded.", errorCode: 'FIRESTORE_UNAVAILABLE' };
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
    
    // MFA Logic
    if (userProfile.mfaMethod && !validatedValues.mfaCode) {
      const mfaCode = Math.floor(10000000 + Math.random() * 90000000).toString();
      const expiresAtTimestamp = Timestamp.fromMillis(Date.now() + 5 * 60 * 1000); // 5 minutes expiry

      console.log(`[LOGIN_MFA_CODE_GENERATED] MFA Code for user ${userProfile.email} is ${mfaCode}. It will expire at ${expiresAtTimestamp.toDate().toISOString()}.`);

      try {
        const userDocRef = doc(db, "users", userId);
        await updateDoc(userDocRef, { 
          mfaCodeAttempt: { code: mfaCode, expiresAt: expiresAtTimestamp.toDate().toISOString() } 
        });
        console.log(`[LOGIN_MFA_CODE_STORED] MFA code attempt stored for user ${userId}`);
      } catch (dbError: any) {
        console.error(`[LOGIN_MFA_DB_ERROR] Failed to store MFA code attempt for user ${userId}:`, dbError);
        return { 
          success: false, 
          requiresMfa: true, 
          error: "MFA is required, but there was an issue initiating it. Please try again.", 
          userProfile,
          errorCode: 'MFA_INIT_FAILURE'
        };
      }
      return { success: false, requiresMfa: true, error: "MFA code required. Check your device (or server console for simulation).", userProfile, errorCode: 'MFA_REQUIRED' };
    }
    
    if (userProfile.mfaMethod && validatedValues.mfaCode) {
      if (!userProfile.mfaCodeAttempt || !userProfile.mfaCodeAttempt.code) {
        return { success: false, error: "No MFA code attempt found or code is missing. Please try logging in again.", userProfile, errorCode: 'MFA_NO_ATTEMPT' };
      }
      if (new Date() > new Date(userProfile.mfaCodeAttempt.expiresAt)) {
        return { success: false, error: "MFA code has expired. Please try logging in again to get a new code.", userProfile, errorCode: 'MFA_EXPIRED' };
      }
      if (userProfile.mfaCodeAttempt.code !== validatedValues.mfaCode) {
        return { success: false, error: "Invalid MFA code.", userProfile, errorCode: 'MFA_INVALID_CODE' };
      }
      
      try {
        const userDocRef = doc(db, "users", userId);
        await updateDoc(userDocRef, { mfaCodeAttempt: null }); 
        console.log(`[LOGIN_MFA_CODE_CLEARED] MFA code attempt cleared for user ${userId}`);
      } catch (dbError: any) {
        console.error(`[LOGIN_MFA_DB_ERROR] Failed to clear MFA code attempt for user ${userId}:`, dbError);
      }
      console.log(`[LOGIN_MFA_SUCCESS] MFA code validated successfully for user ${userId}`);
    }


    console.log("[LOGIN_ACTION_SUCCESS] loginUser action completed successfully for UID:", userId);
    return { success: true, userId, userProfile };

  } catch (error: any) {
    console.error("[LOGIN_ACTION_RAW_ERROR] Raw error in loginUser:", error);
    if (error instanceof z.ZodError) {
      console.error("[LOGIN_ACTION_ZOD_DETAILS] ZodError:", error.flatten());
      return { success: false, error: 'Invalid login input.', details: error.flatten(), errorCode: 'VALIDATION_ERROR' };
    }
    const errorMessage = String((error as AuthError).message || 'An unexpected error occurred during login.');
    const errorCode = String((error as AuthError).code || 'UNKNOWN_LOGIN_ERROR');
    console.error(`[LOGIN_ACTION_ERROR] Error: ${errorMessage}, Code: ${errorCode}`);
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
      // For security, don't explicitly state email not found to prevent enumeration.
      return { success: true, message: "If your email is registered, instructions to reset your password have been sent." };
    }

    // Find user by email in Firestore to store the code
    if (!db || !db.app) {
        console.error("[SEND_RESET_CODE_FIRESTORE_NOT_READY] Firestore not available. DB App:", db?.app);
        return { success: false, error: "Database service for password reset is unavailable.", errorCode: 'DB_UNAVAILABLE'};
    }
    
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("email", "==", validatedValues.email));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        console.log("[SEND_RESET_CODE_USER_NOT_IN_FIRESTORE] User with email not found in Firestore, though exists in Auth. Sending generic message.");
        // This case is odd (auth user exists, but no Firestore profile). Still send generic for security.
        return { success: true, message: "If your email is registered, instructions to reset your password have been sent." };
    }
    
    const userDoc = querySnapshot.docs[0]; // Assuming email is unique in users collection
    const userIdForReset = userDoc.id;

    const resetCode = Math.floor(10000000 + Math.random() * 90000000).toString();
    const expiresAt = Timestamp.fromMillis(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    await updateDoc(doc(db, "users", userIdForReset), {
      passwordResetCodeAttempt: { code: resetCode, expiresAt: expiresAt.toDate().toISOString() }
    });

    console.log(`[SEND_RESET_CODE_SUCCESS] Password reset code for ${validatedValues.email} is ${resetCode}. (Simulated sending). Stored in Firestore for user ${userIdForReset}.`);
    return { success: true, message: "If your email is registered, an 8-digit code has been sent. Please check your email/phone (or server console for simulation)." };

  } catch (error: any) {
    console.error("[SEND_RESET_CODE_ACTION_RAW_ERROR] Raw error in sendPasswordResetCode:", error);
    if (error instanceof z.ZodError) {
      console.error("[SEND_RESET_CODE_ACTION_ZOD_DETAILS] ZodError:", error.flatten());
      return { success: false, error: 'Invalid input.', details: error.flatten(), errorCode: 'VALIDATION_ERROR'};
    }
    // For security, return a generic success message even on unexpected internal errors
    return { success: true, message: "If an account with that email exists, we've sent instructions to reset your password.", errorCode: 'SIMULATED_SUCCESS_ON_ERROR' };
  }
}

export async function verifyPasswordResetCode(values: z.infer<typeof VerifyResetCodeSchema>): Promise<ForgotPasswordResult> {
  console.log("[VERIFY_RESET_CODE_START] Action initiated for email:", values.email, "with code (first 2 chars):", values.code.substring(0,2));
  try {
    const validatedValues = VerifyResetCodeSchema.parse(values);
    
    if (!db || !db.app) {
        console.error("[VERIFY_RESET_CODE_FIRESTORE_NOT_READY] Firestore not available. DB App:", db?.app);
        return { success: false, error: "Database service for password reset is unavailable.", errorCode: 'DB_UNAVAILABLE'};
    }

    const usersRef = collection(db, "users");
    const q = query(usersRef, where("email", "==", validatedValues.email));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        console.log("[VERIFY_RESET_CODE_USER_NOT_FOUND] User not found in Firestore for email:", validatedValues.email);
        return { success: false, error: "Invalid or expired verification code.", errorCode: 'INVALID_VERIFICATION_CODE'};
    }
    const userDoc = querySnapshot.docs[0];
    const userProfile = userDoc.data() as UserProfile;

    if (!userProfile.passwordResetCodeAttempt || !userProfile.passwordResetCodeAttempt.code) {
      return { success: false, error: "No password reset attempt found or code is missing.", errorCode: 'RESET_CODE_NO_ATTEMPT' };
    }
    if (new Date() > new Date(userProfile.passwordResetCodeAttempt.expiresAt)) {
      // Clear expired code
      await updateDoc(doc(db, "users", userDoc.id), { passwordResetCodeAttempt: null });
      return { success: false, error: "Password reset code has expired. Please request a new one.", errorCode: 'RESET_CODE_EXPIRED' };
    }
    if (userProfile.passwordResetCodeAttempt.code !== validatedValues.code) {
      return { success: false, error: "Invalid verification code.", errorCode: 'RESET_CODE_INVALID' };
    }
    
    // Code is valid, clear it.
    // For true security, this step should ideally return a short-lived, single-use token
    // that the next step (resetPassword) would require. Here, we just clear and proceed.
    await updateDoc(doc(db, "users", userDoc.id), { passwordResetCodeAttempt: null });
    console.log("[VERIFY_RESET_CODE_SUCCESS] Code matched and cleared for email:", validatedValues.email);
    return { success: true };

  } catch (error: any) {
    console.error("[VERIFY_RESET_CODE_ACTION_RAW_ERROR] Raw error in verifyPasswordResetCode:", error);
    if (error instanceof z.ZodError) {
      console.error("[VERIFY_RESET_CODE_ACTION_ZOD_DETAILS] ZodError:", error.flatten());
      return { success: false, error: 'Invalid input.', details: error.flatten(), errorCode: 'VALIDATION_ERROR'};
    }
    return { success: false, error: String(error.message || "Code verification failed due to an unexpected error."), errorCode: 'UNEXPECTED_ERROR' };
  }
}

export async function resetPassword(values: z.infer<typeof FinalResetPasswordSchema>): Promise<ForgotPasswordResult> {
  console.log("[RESET_PASSWORD_START] Action initiated for email:", values.email);
  try {
    const validatedValues = FinalResetPasswordSchema.parse(values);
    const currentUser = firebaseAuth.currentUser;

    if (!firebaseAuth || !firebaseAuth.app) {
        console.warn("[RESET_PASSWORD_FIREBASE_NOT_READY] Firebase Auth not properly initialized in resetPassword.");
        return { success: false, error: "Password reset service is temporarily unavailable.", errorCode: 'AUTH_UNAVAILABLE' };
    }

    // Scenario 1: User is logged in (e.g., forced password expiry or changing password from profile)
    if (currentUser && currentUser.email === validatedValues.email) {
      console.log("[RESET_PASSWORD_LOGGED_IN_USER] Attempting password update for logged-in user:", currentUser.uid);
      await firebaseUpdatePassword(currentUser, validatedValues.newPassword);
      console.log("[RESET_PASSWORD_LOGGED_IN_USER_SUCCESS] Password updated via Firebase Auth for:", currentUser.uid);
      if (db && db.app && typeof doc === 'function' && typeof updateDoc === 'function') {
        try {
          console.log("[RESET_PASSWORD_LOGGED_IN_USER_FIRESTORE_UPDATE_START] Updating lastPasswordChangeDate in Firestore for:", currentUser.uid);
          await updateDoc(doc(db, "users", currentUser.uid), { lastPasswordChangeDate: new Date().toISOString() });
          console.log("[RESET_PASSWORD_LOGGED_IN_USER_FIRESTORE_UPDATE_SUCCESS] lastPasswordChangeDate updated for:", currentUser.uid);
        } catch (dbError: any) {
          console.error("[RESET_PASSWORD_LOGGED_IN_USER_FIRESTORE_ERROR] Failed to update lastPasswordChangeDate for UID:", currentUser.uid, "Error:", dbError);
        }
      } else {
         console.warn("[RESET_PASSWORD_DB_NOT_READY_FOR_DATE_UPDATE] DB not available to update lastPasswordChangeDate for current user password reset.");
      }
      return { success: true, message: "Password has been reset successfully." };
    }

    // Scenario 2: User is NOT logged in - this requires Firebase Admin SDK
    console.log("[RESET_PASSWORD_UNAUTH_FLOW_INITIATED] Unauthenticated password reset initiated for email:", validatedValues.email);
    // First, find the user by email to get their UID.
    if (!db || !db.app) {
      console.error("[RESET_PASSWORD_UNAUTH_FIRESTORE_NOT_READY] Firestore not available for unauth reset. DB App:", db?.app);
      return { success: false, error: "Database service unavailable for password reset.", errorCode: 'DB_UNAVAILABLE'};
    }
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("email", "==", validatedValues.email));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        console.error("[RESET_PASSWORD_UNAUTH_USER_NOT_FOUND] User with email not found in Firestore for unauth reset:", validatedValues.email);
        return { success: false, error: "User not found or password reset process invalid.", errorCode: 'USER_NOT_FOUND_FOR_RESET' };
    }
    const userDoc = querySnapshot.docs[0];
    const userIdToReset = userDoc.id;

    // TODO: CRITICAL - Implement Firebase Admin SDK for password reset
    // The following is a conceptual placeholder. You CANNOT reset a password
    // for an unauthenticated user using the client-side Firebase SDK.
    // This needs to be a call to a Firebase Function or a secure backend endpoint
    // that uses the Firebase Admin SDK's `admin.auth().updateUser(uid, { password: newPassword })`.
    console.warn(`[RESET_PASSWORD_ADMIN_SDK_REQUIRED] To reset password for unauthenticated user ${userIdToReset}, Firebase Admin SDK must be used on the server.`);
    console.log(`[RESET_PASSWORD_SIMULATE_ADMIN_SUCCESS] Simulating successful password reset for ${userIdToReset} using Admin SDK.`);
    
    // Simulate successful Admin SDK call for now and update Firestore
    try {
      console.log("[RESET_PASSWORD_UNAUTH_FIRESTORE_UPDATE_START] Updating lastPasswordChangeDate in Firestore for:", userIdToReset);
      await updateDoc(doc(db, "users", userIdToReset), { lastPasswordChangeDate: new Date().toISOString() });
      console.log("[RESET_PASSWORD_UNAUTH_FIRESTORE_UPDATE_SUCCESS] lastPasswordChangeDate updated for:", userIdToReset);
      return { success: true, message: "Password has been reset successfully. (Simulated Admin SDK)" };
    } catch (dbError: any) {
      console.error("[RESET_PASSWORD_UNAUTH_FIRESTORE_ERROR] Failed to update lastPasswordChangeDate for UID:", userIdToReset, "Error:", dbError);
      return { success: false, error: "Password reset seemed to succeed, but failed to update profile data.", errorCode: 'PROFILE_UPDATE_FAILED_AFTER_RESET' };
    }

  } catch (error: any) {
    console.error("[RESET_PASSWORD_ACTION_RAW_ERROR] Raw error in resetPassword:", error);
    if (error instanceof z.ZodError) {
      console.error("[RESET_PASSWORD_ACTION_ZOD_DETAILS] ZodError:", error.flatten());
      return { success: false, error: 'Invalid input.', details: error.flatten(), errorCode: 'VALIDATION_ERROR'};
    }
    const authError = error as AuthError;
    if (authError.code === 'auth/requires-recent-login') {
      return { success: false, error: 'This operation is sensitive and requires recent authentication. Please log in again before changing your password.', errorCode: authError.code };
    }
    if (authError.code === 'auth/user-not-found') { // This applies if Firebase Auth itself can't find the user during a logged-in update
      return { success: false, error: 'No user found with this email address.', errorCode: authError.code };
    }
     if (authError.code === 'auth/weak-password') {
      return { success: false, error: 'The new password is too weak.', errorCode: authError.code };
    }
    return { success: false, error: String(authError.message || 'Password reset failed due to an unexpected error.'), errorCode: String(authError.code || 'UNEXPECTED_ERROR') };
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


export async function updateDemographics(userId: string, values: z.infer<typeof DemographicsSchemaServer>): Promise<{success: boolean, error?: string, data?: Partial<UserProfile>, details?: z.inferFlattenedErrors<typeof DemographicsSchemaServer>, errorCode?: string}> {
    console.log("[UPDATE_DEMOGRAPHICS_START] Updating demographics for UID:", userId, "with values:", values);
    try {
        const validatedValues = DemographicsSchemaServer.parse(values);
        console.log("[UPDATE_DEMOGRAPHICS_VALIDATION_PASSED] Server-side validation passed for UID:", userId);

        if (!db || !db.app || typeof doc !== 'function' || typeof updateDoc !== 'function') {
            console.error("[UPDATE_DEMOGRAPHICS_FIRESTORE_NOT_READY] Firestore (db, doc, or updateDoc) is not initialized correctly. DB App:", db?.app);
            return { success: false, error: "Profile update failed: Database service unavailable.", errorCode: 'DB_UNAVAILABLE' };
        }

        const profileUpdateData: Partial<UserProfile> = {
            firstName: validatedValues.firstName,
            middleInitial: validatedValues.middleInitial,
            lastName: validatedValues.lastName,
            dateOfBirth: validatedValues.dateOfBirth,
            cellPhone: validatedValues.cellPhone,
            isAgeCertified: validatedValues.isAgeCertified,
        };
        console.log("[UPDATE_DEMOGRAPHICS_FIRESTORE_UPDATE_START] Attempting to update Firestore for UID:", userId);
        await updateDoc(doc(db, "users", userId), profileUpdateData);
        console.log("[UPDATE_DEMOGRAPHICS_FIRESTORE_UPDATE_SUCCESS] Firestore updated successfully for UID:", userId);
        return { success: true, data: profileUpdateData };
    } catch (error: any) {
        console.error("[UPDATE_DEMOGRAPHICS_RAW_ERROR] Raw error in updateDemographics for UID:", userId, "Error:", error);
        if (error instanceof z.ZodError) {
          console.error("[UPDATE_DEMOGRAPHICS_ZOD_ERROR_DETAILS] ZodError:", error.flatten());
          return { success: false, error: 'Invalid input from server validation.', details: error.flatten(), errorCode: 'VALIDATION_ERROR' };
        }
        const errorMessage = String(error.message || "Failed to update profile due to an unexpected error.");
        const errorCode = String(error.code || 'UNEXPECTED_ERROR');
        console.error(`[UPDATE_DEMOGRAPHICS_ERROR] Error: ${errorMessage}, Code: ${errorCode}`);
        return { success: false, error: errorMessage, errorCode: errorCode };
    }
}

export async function updateUserTermsAcceptance(userId: string, accepted: boolean, version: string): Promise<{success: boolean, error?: string, errorCode?: string}> {
    console.log("[UPDATE_TERMS_START] Updating terms acceptance for UID:", userId, "Accepted:", accepted, "Version:", version);
    try {
        if (!db || !db.app || typeof doc !== 'function' || typeof updateDoc !== 'function') {
            console.error("[UPDATE_TERMS_FIRESTORE_NOT_READY] Firestore not available. DB App:", db?.app);
            return { success: false, error: "Database service unavailable.", errorCode: 'DB_UNAVAILABLE'};
        }
        console.log("[UPDATE_TERMS_FIRESTORE_UPDATE_START] Attempting to update Firestore for UID:", userId);
        await updateDoc(doc(db, "users", userId), { acceptedLatestTerms: accepted, termsVersionAccepted: version });
        console.log("[UPDATE_TERMS_FIRESTORE_UPDATE_SUCCESS] Firestore updated successfully for UID:", userId);
        return { success: true };
    } catch (error: any) {
        console.error("[UPDATE_TERMS_RAW_ERROR] Raw error in updateUserTermsAcceptance for UID:", userId, "Error:", error);
        const errorMessage = String(error.message || "Failed to update terms acceptance due to an unexpected error.");
        const errorCode = String(error.code || 'UNEXPECTED_ERROR');
        console.error(`[UPDATE_TERMS_ERROR] Error: ${errorMessage}, Code: ${errorCode}`);
        return { success: false, error: errorMessage, errorCode: errorCode };
    }
}


// --- Fitbit OAuth Finalization ---
export async function finalizeFitbitConnection(userId: string): Promise<{success: boolean, error?: string, errorCode?: string}> {
    console.log("[FINALIZE_FITBIT_CONNECTION_START] Finalizing Fitbit connection for UID:", userId);
    try {
        if (!db || !db.app || typeof doc !== 'function' || typeof updateDoc !== 'function' || typeof getDoc !== 'function') {
            console.error("[FINALIZE_FITBIT_FIRESTORE_NOT_READY] Firestore not available. DB App:", db?.app);
            return { success: false, error: "Database service unavailable.", errorCode: 'DB_UNAVAILABLE'};
        }

        const userProfileDocRef = doc(db, "users", userId);
        const userProfileSnap = await getDoc(userProfileDocRef);

        if (!userProfileSnap.exists()) {
            console.error("[FINALIZE_FITBIT_PROFILE_NOT_FOUND] User profile not found for UID:", userId);
            return { success: false, error: "User profile not found.", errorCode: 'PROFILE_NOT_FOUND'};
        }
        const userProfile = userProfileSnap.data() as UserProfile;
        const existingConnections = userProfile.connectedFitnessApps || [];

        if (existingConnections.some(app => app.id === 'fitbit')) {
            console.log("[FINALIZE_FITBIT_ALREADY_CONNECTED] Fitbit already marked as connected for UID:", userId);
            return { success: true };
        }

        const updatedConnections = [...existingConnections, { id: 'fitbit', name: 'Fitbit', connectedAt: new Date().toISOString() }];
        
        console.log("[FINALIZE_FITBIT_FIRESTORE_UPDATE_START] Attempting to update Firestore for UID:", userId);
        await updateDoc(userProfileDocRef, { connectedFitnessApps: updatedConnections });
        console.log("[FINALIZE_FITBIT_FIRESTORE_UPDATE_SUCCESS] Firestore updated with Fitbit connection for UID:", userId);
        return { success: true };

    } catch (error: any) {
        console.error("[FINALIZE_FITBIT_RAW_ERROR] Raw error finalizing Fitbit connection for UID:", userId, "Error:", error);
        const errorMessage = String(error.message || "Failed to finalize Fitbit connection.");
        const errorCode = String(error.code || 'UNEXPECTED_ERROR');
        return { success: false, error: errorMessage, errorCode: errorCode};
    }
}

// --- Strava OAuth Finalization ---
export async function finalizeStravaConnection(userId: string): Promise<{success: boolean, error?: string, errorCode?: string}> {
    console.log("[FINALIZE_STRAVA_CONNECTION_START] Finalizing Strava connection for UID:", userId);
    try {
        if (!db || !db.app || typeof doc !== 'function' || typeof updateDoc !== 'function' || typeof getDoc !== 'function') {
            console.error("[FINALIZE_STRAVA_FIRESTORE_NOT_READY] Firestore not available. DB App:", db?.app);
            return { success: false, error: "Database service unavailable.", errorCode: 'DB_UNAVAILABLE'};
        }
        const userProfileDocRef = doc(db, "users", userId);
        const userProfileSnap = await getDoc(userProfileDocRef);

        if (!userProfileSnap.exists()) {
            console.error("[FINALIZE_STRAVA_PROFILE_NOT_FOUND] User profile not found for UID:", userId);
            return { success: false, error: "User profile not found.", errorCode: 'PROFILE_NOT_FOUND'};
        }
        const userProfile = userProfileSnap.data() as UserProfile;
        const existingConnections = userProfile.connectedFitnessApps || [];

        if (existingConnections.some(app => app.id === 'strava')) {
             console.log("[FINALIZE_STRAVA_ALREADY_CONNECTED] Strava already marked as connected for UID:", userId);
            return { success: true };
        }
        const updatedConnections = [...existingConnections, { id: 'strava', name: 'Strava', connectedAt: new Date().toISOString() }];
        
        console.log("[FINALIZE_STRAVA_FIRESTORE_UPDATE_START] Attempting to update Firestore for UID:", userId);
        await updateDoc(userProfileDocRef, { connectedFitnessApps: updatedConnections });
        console.log("[FINALIZE_STRAVA_FIRESTORE_UPDATE_SUCCESS] Firestore updated with Strava connection for UID:", userId);
        return { success: true };
    } catch (error: any) {
        console.error("[FINALIZE_STRAVA_RAW_ERROR] Raw error finalizing Strava connection for UID:", userId, "Error:", error);
        const errorMessage = String(error.message || "Failed to finalize Strava connection.");
        const errorCode = String(error.code || 'UNEXPECTED_ERROR');
        return { success: false, error: errorMessage, errorCode: errorCode};
    }
}

// --- Google Fit OAuth Actions ---
export async function finalizeGoogleFitConnection(userId: string): Promise<{success: boolean, error?: string, errorCode?: string}> {
    console.log("[FINALIZE_GOOGLE_FIT_CONNECTION_START] Finalizing Google Fit connection for UID:", userId);
     try {
        if (!db || !db.app || typeof doc !== 'function' || typeof updateDoc !== 'function' || typeof getDoc !== 'function') {
            console.error("[FINALIZE_GOOGLE_FIT_FIRESTORE_NOT_READY] Firestore not available. DB App:", db?.app);
            return { success: false, error: "Database service unavailable.", errorCode: 'DB_UNAVAILABLE'};
        }
        const userProfileDocRef = doc(db, "users", userId);
        const userProfileSnap = await getDoc(userProfileDocRef);

        if (!userProfileSnap.exists()) {
            console.error("[FINALIZE_GOOGLE_FIT_PROFILE_NOT_FOUND] User profile not found for UID:", userId);
            return { success: false, error: "User profile not found.", errorCode: 'PROFILE_NOT_FOUND'};
        }
        const userProfile = userProfileSnap.data() as UserProfile;
        const existingConnections = userProfile.connectedFitnessApps || [];

        if (existingConnections.some(app => app.id === 'google-fit')) {
            console.log("[FINALIZE_GOOGLE_FIT_ALREADY_CONNECTED] Google Fit already marked as connected for UID:", userId);
            return { success: true };
        }
        const updatedConnections = [...existingConnections, { id: 'google-fit', name: 'Google Fit', connectedAt: new Date().toISOString() }];
        
        console.log("[FINALIZE_GOOGLE_FIT_FIRESTORE_UPDATE_START] Attempting to update Firestore for UID:", userId);
        await updateDoc(userProfileDocRef, { connectedFitnessApps: updatedConnections });
        console.log("[FINALIZE_GOOGLE_FIT_FIRESTORE_UPDATE_SUCCESS] Firestore updated with Google Fit connection for UID:", userId);
        return { success: true };
    } catch (error: any) {
        console.error("[FINALIZE_GOOGLE_FIT_RAW_ERROR] Raw error finalizing Google Fit connection for UID:", userId, "Error:", error);
        const errorMessage = String(error.message || "Failed to finalize Google Fit connection.");
        const errorCode = String(error.code || 'UNEXPECTED_ERROR');
        return { success: false, error: errorMessage, errorCode: errorCode};
    }
}
