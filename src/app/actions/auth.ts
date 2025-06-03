
'use server';

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updatePassword as firebaseUpdatePassword, 
  type AuthError,
} from 'firebase/auth';
import { auth as firebaseAuth, db } from '@/lib/firebase/clientApp';
import { z } from 'zod';
import type { UserProfile, SubscriptionTier } from '@/types';
import { passwordSchema } from '@/types';
import { doc, setDoc, getDoc, updateDoc, Timestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { differenceInYears, format } from 'date-fns';


// --- Sign Up Schemas ---
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
  details?: any;
}

export async function signUpUser(values: z.infer<typeof SignUpDetailsInputSchema>): Promise<SignUpResult> {
  console.log("[SIGNUP_ACTION_START] signUpUser action initiated with email:", values.email, "tier:", values.subscriptionTier);

  if (!firebaseAuth || !firebaseAuth.app) {
    console.error("[SIGNUP_ACTION_CRITICAL_FAILURE] Firebase Auth service appears uninitialized or misconfigured on the server for signUpUser. firebaseAuth:", firebaseAuth);
    return {
      success: false,
      error: "Critical server error: Authentication service is not ready. Please contact support.",
      errorCode: 'SERVER_FIREBASE_AUTH_INIT_FAILURE'
    };
  }
  if (!db || !db.app || typeof doc !== 'function' || typeof setDoc !== 'function') {
    console.error("[SIGNUP_ACTION_CRITICAL_FAILURE] Firestore service (db) appears uninitialized or misconfigured on the server for signUpUser. db:", db);
    return {
      success: false,
      error: "Critical server error: Database service is not ready. Profile cannot be saved. Please contact support.",
      errorCode: 'SERVER_FIREBASE_DB_INIT_FAILURE'
    };
  }
  console.log("[SIGNUP_ACTION_FIREBASE_SERVICES_CHECK_PASSED] Firebase Auth and DB appear initialized for server action.");

  try {
    const validatedValues = SignUpDetailsInputSchema.parse(values);
    console.log("[SIGNUP_ACTION_VALIDATION_PASSED] Input validation passed for email:", validatedValues.email);

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
      console.error("[SIGNUP_AUTH_ERROR] Error during Firebase Auth user creation for email:", validatedValues.email, "Raw Error:", authError);
      const errorMessage = String((authError as AuthError).message || 'Firebase Auth user creation failed.');
      const errorCode = String((authError as AuthError).code || 'AUTH_ERROR');
      console.error(`[SIGNUP_AUTH_ERROR_DETAILS] Code: ${errorCode}, Message: ${errorMessage}`);
      if (errorCode === 'auth/email-already-in-use') {
        console.log("[SIGNUP_ACTION_ATTEMPT_RETURN_ERROR_EMAIL_IN_USE]");
        return { success: false, error: 'This email address is already in use. Please log in or use a different email.', errorCode };
      }
      console.log("[SIGNUP_ACTION_ATTEMPT_RETURN_ERROR_AUTH_CREATE_FAILED]");
      return { success: false, error: errorMessage, errorCode };
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
    };
    console.log("[SIGNUP_ACTION_PROFILE_OBJECT_CREATED] Initial profile object created for UID:", initialProfile.id, initialProfile);

    try {
      console.log("[SIGNUP_ACTION_FIRESTORE_SETDOC_START] Attempting to save profile to Firestore for UID:", userCredential.user.uid);
      await setDoc(doc(db, "users", userCredential.user.uid), initialProfile);
      console.log("[SIGNUP_ACTION_FIRESTORE_SETDOC_SUCCESS] Profile saved to Firestore successfully for UID:", userCredential.user.uid);
    } catch (firestoreError: any) {
      console.error("[SIGNUP_FIRESTORE_ERROR] Error creating user profile in Firestore for UID:", userCredential.user.uid, "Raw Error:", firestoreError);
      const errorMessage = String(firestoreError.message || 'Database error during profile creation.');
      const errorCode = String(firestoreError.code || 'FIRESTORE_ERROR');
      console.error(`[SIGNUP_FIRESTORE_ERROR_DETAILS] Code: ${errorCode}, Message: ${errorMessage}`);
      console.log("[SIGNUP_ACTION_ATTEMPT_RETURN_ERROR_FIRESTORE_SETDOC_FAILED]");
      return { success: false, error: `Account created but profile setup failed: ${errorMessage}. Please contact support.`, errorCode, userId: userCredential.user.uid };
    }

    console.log("[SIGNUP_ACTION_SUCCESS] signUpUser action completed successfully for UID:", userCredential.user.uid);
    console.log("[SIGNUP_ACTION_ATTEMPT_RETURN_SUCCESS]");
    return { success: true, userId: userCredential.user.uid };
  } catch (error: any) {
    console.error("[SIGNUP_ACTION_OUTER_CATCH_ERROR] Raw error in signUpUser's outer catch block:", error);
    let errorMessage = "An unexpected error occurred during account creation.";
    let errorCode = "UNKNOWN_SIGNUP_ERROR";

    if (error instanceof z.ZodError) {
      console.error("[SIGNUP_ZOD_DETAILS] ZodError:", error.flatten());
      errorMessage = "Invalid input data for sign-up.";
      errorCode = "VALIDATION_ERROR";
      console.log("[SIGNUP_ACTION_ATTEMPT_RETURN_ERROR_ZOD_VALIDATION]");
      return { success: false, error: errorMessage, errorCode, details: error.flatten() };
    } else if (error.code) { 
      errorMessage = String(error.message || "Operation failed.");
      errorCode = String(error.code);
      console.error(`[SIGNUP_ACTION_ERROR_DETAILS_CODED] Code: ${errorCode}, Message: ${errorMessage}`);
    } else { 
      errorMessage = String(error.message || "An unexpected server error occurred during sign-up.");
      console.error(`[SIGNUP_ACTION_UNEXPECTED_ERROR_DETAILS] Message: ${errorMessage}`);
    }
    console.log("[SIGNUP_ACTION_ATTEMPT_RETURN_ERROR_OUTER_CATCH]");
    return { success: false, error: errorMessage, errorCode };
  }
}

// --- Login Schema ---
const LoginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, { message: "Password is required." }),
});

interface LoginResult {
  success: boolean;
  userId?: string;
  error?: string;
  errorCode?: string;
  passwordExpired?: boolean;
  termsNotAccepted?: boolean; 
  userProfile?: UserProfile | null; 
}

export async function loginUser(values: z.infer<typeof LoginInputSchema>): Promise<LoginResult> {
  console.log("[LOGIN_ACTION_START] loginUser action initiated for email:", values.email);
  try {
    const validatedValues = LoginInputSchema.parse(values);
    console.log("[LOGIN_ACTION_VALIDATION_PASSED] Input validation passed for email:", validatedValues.email);

    if (!firebaseAuth || !firebaseAuth.app) {
      console.error("[LOGIN_FIREBASE_AUTH_NOT_READY] Firebase Auth is not initialized correctly in loginUser. DB App:", db?.app);
      console.log("[LOGIN_ACTION_ATTEMPT_RETURN_ERROR_AUTH_UNAVAILABLE]");
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
      console.error("[LOGIN_AUTH_ERROR] Error during Firebase Auth sign-in for email:", validatedValues.email, "Raw Error:", authError);
      const errorMessage = String((authError as AuthError).message || 'Firebase Auth sign-in failed.');
      const errorCode = String((authError as AuthError).code || 'AUTH_ERROR');
      console.error(`[LOGIN_AUTH_ERROR_DETAILS] Code: ${errorCode}, Message: ${errorMessage}`);
      if (errorCode === 'auth/user-not-found' || errorCode === 'auth/wrong-password' || errorCode === 'auth/invalid-credential') {
        console.log("[LOGIN_ACTION_ATTEMPT_RETURN_ERROR_INVALID_CREDENTIALS]");
        return { success: false, error: 'Invalid email or password.', errorCode };
      }
      console.log("[LOGIN_ACTION_ATTEMPT_RETURN_ERROR_SIGNIN_FAILED]");
      return { success: false, error: errorMessage, errorCode };
    }
    
    const userId = userCredential.user.uid;

    if (!db || !db.app || typeof doc !== 'function' || typeof getDoc !== 'function' || typeof updateDoc !== 'function') {
        console.error("[LOGIN_FIRESTORE_NOT_READY] Firestore (db, doc, getDoc, or updateDoc) is not initialized correctly. DB App:", db?.app);
        console.log("[LOGIN_ACTION_ATTEMPT_RETURN_SUCCESS_NO_PROFILE_FIRESTORE_UNAVAILABLE]"); 
        return { success: true, userId, userProfile: null, error: "Profile could not be fetched or updated, but login succeeded.", errorCode: 'FIRESTORE_UNAVAILABLE' };
    }
    console.log("[LOGIN_ACTION_FIRESTORE_CHECK_PASSED] Firestore instance seems okay for profile fetch for UID:", userId);

    let userProfileSnap;
    let userProfile: UserProfile;
    try {
      console.log("[LOGIN_ACTION_FIRESTORE_GETDOC_START] Attempting to fetch profile from Firestore for UID:", userId);
      const userProfileDocRef = doc(db, "users", userId);
      userProfileSnap = await getDoc(userProfileDocRef);

      if (!userProfileSnap.exists()) {
        console.error(`[LOGIN_PROFILE_NOT_FOUND] User profile not found for UID: ${userId} in loginUser.`);
        console.log("[LOGIN_ACTION_ATTEMPT_RETURN_SUCCESS_NO_PROFILE_PROFILE_NOT_FOUND]");
        return { success: true, userId, userProfile: null, errorCode: "auth/profile-not-found" };
      }
      userProfile = userProfileSnap.data() as UserProfile;
      console.log("[LOGIN_ACTION_FIRESTORE_GETDOC_SUCCESS] Profile fetch attempt completed for UID:", userId);
    } catch (firestoreError: any) {
      console.error("[LOGIN_FIRESTORE_ERROR] Error fetching user profile from Firestore for UID:", userId, "Raw Error:", firestoreError);
      const errorMessage = String(firestoreError.message || 'Database error during profile fetching.');
      const errorCode = String(firestoreError.code || 'FIRESTORE_ERROR');
      console.error(`[LOGIN_FIRESTORE_ERROR_DETAILS] Code: ${errorCode}, Message: ${errorMessage}`);
      console.log("[LOGIN_ACTION_ATTEMPT_RETURN_SUCCESS_NO_PROFILE_FIRESTORE_ERROR]");
      return { success: true, userId, userProfile: null, error: `Login succeeded but profile fetch failed: ${errorMessage}.`, errorCode };
    }
    
    if (userProfile.lastPasswordChangeDate) {
      const lastPasswordChange = new Date(userProfile.lastPasswordChangeDate);
      const now = new Date();
      const daysSinceLastChange = (now.getTime() - lastPasswordChange.getTime()) / (1000 * 3600 * 24);
      if (daysSinceLastChange >= 90) {
        console.log(`[LOGIN_ACTION_PASSWORD_EXPIRED] Password expired for user ${userId}.`);
        console.log("[LOGIN_ACTION_ATTEMPT_RETURN_SUCCESS_PASSWORD_EXPIRED]");
        return { success: true, userId, passwordExpired: true, userProfile };
      }
    } else {
      console.warn(`[LOGIN_PASSWORD_DATE_MISSING] User ${userId} missing lastPasswordChangeDate. Treating as password expired.`);
      console.log("[LOGIN_ACTION_ATTEMPT_RETURN_SUCCESS_PASSWORD_DATE_MISSING]");
      return { success: true, userId, passwordExpired: true, userProfile };
    }
        
    console.log("[LOGIN_ACTION_SUCCESS] loginUser action completed successfully for UID:", userId);
    console.log("[LOGIN_ACTION_ATTEMPT_RETURN_SUCCESS_FULL]");
    return { success: true, userId, userProfile };

  } catch (error: any) {
    console.error("[LOGIN_ACTION_RAW_ERROR] Raw error in loginUser:", error);
    let errorMessage = "An unknown error occurred during login.";
    let errorCode = "UNKNOWN_LOGIN_ERROR";
    if (error instanceof z.ZodError) {
      console.error("[LOGIN_ACTION_ZOD_DETAILS] ZodError:", error.flatten());
      errorMessage = "Invalid login input.";
      errorCode = "VALIDATION_ERROR";
    } else if (error.code) {
      errorMessage = String(error.message || errorMessage);
      errorCode = String(error.code);
      console.error(`[LOGIN_ACTION_ERROR_DETAILS_CODED] Code: ${errorCode}, Message: ${errorMessage}`);
    } else {
      errorMessage = String(error.message || errorMessage);
      console.error(`[LOGIN_ACTION_UNEXPECTED_ERROR_DETAILS] Message: ${errorMessage}`);
    }
    console.log("[LOGIN_ACTION_ATTEMPT_RETURN_ERROR_OUTER_CATCH]");
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

    if (!db || !db.app || typeof collection !== 'function' || typeof query !== 'function' || typeof where !== 'function' || typeof getDocs !== 'function' || typeof doc !== 'function' || typeof updateDoc !== 'function') {
        console.error("[SEND_RESET_CODE_FIRESTORE_NOT_READY] Firestore not available. DB App:", db?.app);
        return { success: false, error: "Database service for password reset is unavailable.", errorCode: 'DB_UNAVAILABLE'};
    }
    
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("email", "==", validatedValues.email));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        console.log("[SEND_RESET_CODE_USER_NOT_IN_FIRESTORE] User with email not found in Firestore. Sending generic message to avoid enumeration.");
        return { success: true, message: "If your email is registered, an 8-digit code has been sent. Please check your email/phone (or server console for simulation)." };
    }
    
    const userDoc = querySnapshot.docs[0]; 
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
      return { success: false, error: 'Invalid input.', errorCode: 'VALIDATION_ERROR', details: error.flatten()};
    }
    return { success: true, message: "If an account with that email exists, we've sent instructions to reset your password. (Simulation - Error occurred)"};
  }
}

export async function verifyPasswordResetCode(values: z.infer<typeof VerifyResetCodeSchema>): Promise<ForgotPasswordResult> {
  console.log("[VERIFY_RESET_CODE_START] Action initiated for email:", values.email, "with code (first 2 chars):", values.code.substring(0,2));
  try {
    const validatedValues = VerifyResetCodeSchema.parse(values);
    
    if (!db || !db.app || typeof collection !== 'function' || typeof query !== 'function' || typeof where !== 'function' || typeof getDocs !== 'function' || typeof doc !== 'function' || typeof updateDoc !== 'function') {
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
    const userDocSnap = querySnapshot.docs[0];
    const userProfile = userDocSnap.data() as UserProfile;

    if (!userProfile.passwordResetCodeAttempt || !userProfile.passwordResetCodeAttempt.code) {
      return { success: false, error: "No password reset attempt found or code is missing.", errorCode: 'RESET_CODE_NO_ATTEMPT' };
    }
    if (new Date() > new Date(userProfile.passwordResetCodeAttempt.expiresAt)) {
      await updateDoc(doc(db, "users", userDocSnap.id), { passwordResetCodeAttempt: null });
      return { success: false, error: "Password reset code has expired. Please request a new one.", errorCode: 'RESET_CODE_EXPIRED' };
    }
    if (userProfile.passwordResetCodeAttempt.code !== validatedValues.code) {
      return { success: false, error: "Invalid verification code.", errorCode: 'RESET_CODE_INVALID' };
    }
    
    await updateDoc(doc(db, "users", userDocSnap.id), { passwordResetCodeAttempt: null }); 
    console.log("[VERIFY_RESET_CODE_SUCCESS] Code matched and cleared for email:", validatedValues.email);
    return { success: true };

  } catch (error: any) {
    console.error("[VERIFY_RESET_CODE_ACTION_RAW_ERROR] Raw error in verifyPasswordResetCode:", error);
    if (error instanceof z.ZodError) {
      console.error("[VERIFY_RESET_CODE_ACTION_ZOD_DETAILS] ZodError:", error.flatten());
      return { success: false, error: 'Invalid input.', errorCode: 'VALIDATION_ERROR', details: error.flatten()};
    }
    return { success: false, error: String(error.message || "Code verification failed due to an unexpected error."), errorCode: 'UNEXPECTED_ERROR' };
  }
}

export async function resetPassword(values: z.infer<typeof FinalResetPasswordSchema>): Promise<ForgotPasswordResult> {
  console.log("[RESET_PASSWORD_START] Action initiated for email:", values.email);
  try {
    const validatedValues = FinalResetPasswordSchema.parse(values);

    if (!firebaseAuth) {
        console.warn("[RESET_PASSWORD_FIREBASE_AUTH_NULL] firebaseAuth is null. Cannot proceed with password reset.");
        return { success: false, error: "Authentication service is not available.", errorCode: 'AUTH_UNAVAILABLE' };
    }
    
    const currentUser = firebaseAuth.currentUser;

    if (!firebaseAuth.app) {
        console.warn("[RESET_PASSWORD_FIREBASE_APP_NULL] firebaseAuth.app is null. Firebase Auth not properly initialized in resetPassword.");
        return { success: false, error: "Password reset service is temporarily unavailable due to configuration issues.", errorCode: 'AUTH_UNAVAILABLE_APP_SCOPE' };
    }

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

    console.log("[RESET_PASSWORD_UNAUTH_FLOW_INITIATED] Unauthenticated password reset initiated for email:", validatedValues.email);
    if (!db || !db.app || typeof collection !== 'function' || typeof query !== 'function' || typeof where !== 'function' || typeof getDocs !== 'function' || typeof doc === 'function' || typeof updateDoc === 'function') {
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
    const userDocSnap = querySnapshot.docs[0];
    const userIdToReset = userDocSnap.id;

    console.warn(`[RESET_PASSWORD_ADMIN_SDK_REQUIRED] To reset password for unauthenticated user ${userIdToReset}, Firebase Admin SDK must be used on the server. This is a placeholder.`);
    console.log(`[RESET_PASSWORD_SIMULATE_ADMIN_SUCCESS] Simulating successful password reset for ${userIdToReset} using Admin SDK.`);
    
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
      return { success: false, error: 'Invalid input.', errorCode: 'VALIDATION_ERROR', details: error.flatten()};
    }
    const authError = error as AuthError;
    const errorMessage = String(authError.message || 'Password reset failed due to an unexpected error.');
    const errorCode = String(authError.code || 'UNEXPECTED_ERROR');
     console.error(`[RESET_PASSWORD_ACTION_ERROR_DETAILS] Code: ${errorCode}, Message: ${errorMessage}`);
    if (errorCode === 'auth/requires-recent-login') {
      return { success: false, error: 'This operation is sensitive and requires recent authentication. Please log in again before changing your password.', errorCode };
    }
    if (errorCode === 'auth/user-not-found') { 
      return { success: false, error: 'No user found with this email address.', errorCode };
    }
     if (errorCode === 'auth/weak-password') {
      return { success: false, error: 'The new password is too weak.', errorCode };
    }
    return { success: false, error: errorMessage, errorCode };
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
    message: "Either email or cell phone must be provided for contact purposes.",
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
        console.error(`[UPDATE_DEMOGRAPHICS_ERROR_DETAILS] Code: ${errorCode}, Message: ${errorMessage}`);
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
        console.error(`[UPDATE_TERMS_ERROR_DETAILS] Code: ${errorCode}, Message: ${errorMessage}`);
        return { success: false, error: errorMessage, errorCode: errorCode };
    }
}


export async function finalizeFitbitConnection(userId: string): Promise<{success: boolean, error?: string, errorCode?: string, data?: any}> {
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
        const now = new Date();
        const todayDateString = format(now, 'yyyy-MM-dd');

        const connectionUpdateData: Partial<UserProfile> = {
            connectedFitnessApps: [...existingConnections.filter(app => app.id !== 'fitbit'), { id: 'fitbit', name: 'Fitbit', connectedAt: now.toISOString() }],
            fitbitLastSuccessfulSync: todayDateString, 
        };
        
        console.log("[FINALIZE_FITBIT_FIRESTORE_UPDATE_START] Attempting to update Firestore for UID:", userId);
        await updateDoc(userProfileDocRef, connectionUpdateData);
        console.log("[FINALIZE_FITBIT_FIRESTORE_UPDATE_SUCCESS] Firestore updated with Fitbit connection and initial sync date for UID:", userId);
        return { success: true };

    } catch (error: any) {
        console.error("[FINALIZE_FITBIT_RAW_ERROR] Raw error finalizing Fitbit connection for UID:", userId, "Error:", error);
        const errorMessage = String(error.message || "Failed to finalize Fitbit connection.");
        const errorCode = String(error.code || 'UNEXPECTED_ERROR');
        return { success: false, error: errorMessage, errorCode: errorCode};
    }
}

export async function finalizeStravaConnection(userId: string): Promise<{success: boolean, error?: string, errorCode?: string, data?: any}> {
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
        const now = new Date();

        const connectionUpdateData: Partial<UserProfile> = {
             connectedFitnessApps: [...existingConnections.filter(app => app.id !== 'strava'), { id: 'strava', name: 'Strava', connectedAt: now.toISOString() }],
             stravaLastSyncTimestamp: Math.floor(now.getTime() / 1000), 
        };
        
        console.log("[FINALIZE_STRAVA_FIRESTORE_UPDATE_START] Attempting to update Firestore for UID:", userId);
        await updateDoc(userProfileDocRef, connectionUpdateData);
        console.log("[FINALIZE_STRAVA_FIRESTORE_UPDATE_SUCCESS] Firestore updated with Strava connection and initial sync timestamp for UID:", userId);
        return { success: true };
    } catch (error: any) {
        console.error("[FINALIZE_STRAVA_RAW_ERROR] Raw error finalizing Strava connection for UID:", userId, "Error:", error);
        const errorMessage = String(error.message || "Failed to finalize Strava connection.");
        const errorCode = String(error.code || 'UNEXPECTED_ERROR');
        return { success: false, error: errorMessage, errorCode: errorCode};
    }
}

export async function finalizeGoogleFitConnection(userId: string): Promise<{success: boolean, error?: string, errorCode?: string, data?: any}> {
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
        const now = new Date();

        const connectionUpdateData: Partial<UserProfile> = {
            connectedFitnessApps: [...existingConnections.filter(app => app.id !== 'google-fit'), { id: 'google-fit', name: 'Google Fit', connectedAt: now.toISOString() }],
            googleFitLastSuccessfulSync: now.toISOString(), 
        };
        
        console.log("[FINALIZE_GOOGLE_FIT_FIRESTORE_UPDATE_START] Attempting to update Firestore for UID:", userId);
        await updateDoc(userProfileDocRef, connectionUpdateData);
        console.log("[FINALIZE_GOOGLE_FIT_FIRESTORE_UPDATE_SUCCESS] Firestore updated with Google Fit connection and initial sync date for UID:", userId);
        return { success: true };
    } catch (error: any) {
        console.error("[FINALIZE_GOOGLE_FIT_RAW_ERROR] Raw error finalizing Google Fit connection for UID:", userId, "Error:", error);
        const errorMessage = String(error.message || "Failed to finalize Google Fit connection.");
        const errorCode = String(error.code || 'UNEXPECTED_ERROR');
        return { success: false, error: errorMessage, errorCode: errorCode};
    }
}

export async function finalizeWithingsConnection(userId: string, withingsApiUserId?: string): Promise<{success: boolean, error?: string, errorCode?: string, data?: {withingsUserId?: string}} > {
    console.log("[FINALIZE_WITHINGS_CONNECTION_START] Finalizing Withings connection for UID:", userId);
    try {
        if (!db || !db.app || typeof doc !== 'function' || typeof updateDoc !== 'function' || typeof getDoc !== 'function') {
            console.error("[FINALIZE_WITHINGS_FIRESTORE_NOT_READY] Firestore not available. DB App:", db?.app);
            return { success: false, error: "Database service unavailable.", errorCode: 'DB_UNAVAILABLE'};
        }
        const userProfileDocRef = doc(db, "users", userId);
        const userProfileSnap = await getDoc(userProfileDocRef);

        if (!userProfileSnap.exists()) {
            console.error("[FINALIZE_WITHINGS_PROFILE_NOT_FOUND] User profile not found for UID:", userId);
            return { success: false, error: "User profile not found.", errorCode: 'PROFILE_NOT_FOUND'};
        }
        const userProfile = userProfileSnap.data() as UserProfile;
        const existingConnections = userProfile.connectedFitnessApps || [];
        const now = new Date();

        const connectionUpdateData: Partial<UserProfile> & { withingsUserId?: string } = {
            connectedFitnessApps: [...existingConnections.filter(app => app.id !== 'withings'), { id: 'withings', name: 'Withings', connectedAt: now.toISOString() }],
            withingsLastSuccessfulSync: now.toISOString(),
        };
        if (withingsApiUserId) {
            connectionUpdateData.withingsUserId = withingsApiUserId;
        }
        
        console.log("[FINALIZE_WITHINGS_FIRESTORE_UPDATE_START] Attempting to update Firestore for UID:", userId, "with data:", connectionUpdateData);
        await updateDoc(userProfileDocRef, connectionUpdateData);
        console.log("[FINALIZE_WITHINGS_FIRESTORE_UPDATE_SUCCESS] Firestore updated with Withings connection, initial sync date, and Withings User ID for UID:", userId);
        return { success: true, data: { withingsUserId } };
    } catch (error: any) {
        console.error("[FINALIZE_WITHINGS_RAW_ERROR] Raw error finalizing Withings connection for UID:", userId, "Error:", error);
        const errorMessage = String(error.message || "Failed to finalize Withings connection.");
        const errorCode = String(error.code || 'UNEXPECTED_ERROR');
        return { success: false, error: errorMessage, errorCode: errorCode};
    }
}
    
    

