
'use server';

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updatePassword as firebaseUpdatePassword,
  type AuthError,
  type Auth, // For type annotation
} from 'firebase/auth';
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'; // For server-side init
import { getAuth } from 'firebase/auth'; // For server-side getAuth
import { getFirestore, type Firestore } from 'firebase/firestore'; // For server-side Firestore
// DO NOT import { auth as firebaseAuth, db } from '@/lib/firebase/clientApp' for server actions
import { z } from 'zod';
import type { UserProfile, SubscriptionTier, FitbitApiCallStats, StravaApiCallStats, GoogleFitApiCallStats, WithingsApiCallStats, WalkingRadarGoals, RunningRadarGoals, HikingRadarGoals, SwimmingRadarGoals, SleepRadarGoals, DashboardMetricIdValue } from '@/types';
import { passwordSchema } from '@/types';
import { doc, setDoc, getDoc, updateDoc, Timestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { differenceInYears, format } from 'date-fns';

// Helper function for server-side Firebase initialization
const initializeServerFirebase = () => {
  const firebaseConfigServer = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  if (
    !firebaseConfigServer.apiKey ||
    !firebaseConfigServer.authDomain ||
    !firebaseConfigServer.projectId ||
    !firebaseConfigServer.storageBucket ||
    !firebaseConfigServer.messagingSenderId ||
    !firebaseConfigServer.appId
  ) {
    console.error("[ServerFirebaseHelper] CRITICAL SERVER FIREBASE CONFIG ERROR: One or more NEXT_PUBLIC_FIREBASE_... environment variables are missing.");
    throw new Error("Server Firebase configuration is incomplete.");
  }
  
  let app: FirebaseApp;
  if (!getApps().length) {
    console.log("[ServerFirebaseHelper] No Firebase apps initialized for server. Initializing new Firebase app.");
    app = initializeApp(firebaseConfigServer);
  } else {
    console.log("[ServerFirebaseHelper] Firebase app already initialized for server. Getting existing app.");
    app = getApp();
  }
  const authInstance: Auth = getAuth(app);
  const dbInstance: Firestore = getFirestore(app);
  return { app, auth: authInstance, db: dbInstance };
};


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
  
  let serverAuth: Auth;
  let serverDb: Firestore;

  try {
    const { auth: sAuth, db: sDb } = initializeServerFirebase();
    serverAuth = sAuth;
    serverDb = sDb;
    console.log("[SIGNUP_ACTION_SERVER_FIREBASE_INIT_SUCCESS] Server-side Firebase Auth and DB initialized for signUpUser.");
  } catch (initError: any) {
    console.error("[SIGNUP_ACTION_SERVER_FIREBASE_INIT_FAILURE]", initError.message);
    return {
      success: false,
      error: "Critical server error: Firebase services could not be initialized. Please contact support.",
      errorCode: 'SERVER_FIREBASE_INIT_FAILURE'
    };
  }


  try {
    const validatedValues = SignUpDetailsInputSchema.parse(values);
    console.log("[SIGNUP_ACTION_VALIDATION_PASSED] Input validation passed for email:", validatedValues.email);

    let userCredential;
    try {
      console.log("[SIGNUP_ACTION_CREATE_USER_START] Attempting to create user in Firebase Auth for email:", validatedValues.email);
      userCredential = await createUserWithEmailAndPassword(
        serverAuth, // Use server-initialized auth
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

    const nowIso = new Date().toISOString();
    const initialProfile: UserProfile = {
      id: userCredential.user.uid,
      email: userCredential.user.email!,
      subscriptionTier: validatedValues.subscriptionTier,
      lastPasswordChangeDate: nowIso,
      lastLoggedInDate: nowIso,
      acceptedLatestTerms: false,
      termsVersionAccepted: undefined, // Initialize as undefined
      isAgeCertified: false,
      profileSetupComplete: false, // Initialize as false
      connectedFitnessApps: [],
      connectedDiagnosticsServices: [],
      connectedInsuranceProviders: [],
    };
    console.log("[SIGNUP_ACTION_PROFILE_OBJECT_CREATED] Initial profile object created for UID:", initialProfile.id, initialProfile);

    try {
      console.log("[SIGNUP_ACTION_FIRESTORE_SETDOC_START] Attempting to save profile to Firestore for UID:", userCredential.user.uid);
      await setDoc(doc(serverDb, "users", userCredential.user.uid), initialProfile); // Use server-initialized db
      console.log("[SIGNUP_ACTION_FIRESTORE_SETDOC_SUCCESS] Profile saved to Firestore successfully for UID:", userCredential.user.uid);
    } catch (firestoreError: any) {
      console.error("[SIGNUP_FIRESTORE_ERROR] Error creating user profile in Firestore for UID:", userCredential.user.uid, "Raw Error:", firestoreError);
      const errorMessage = String(firestoreError.message || 'Database error during profile creation.');
      const errorCode = String(firestoreError.code || 'FIRESTORE_ERROR');
      console.error(`[SIGNUP_FIRESTORE_ERROR_DETAILS] Code: ${errorCode}, Message: ${errorMessage}`);
      console.log("[SIGNUP_ACTION_ATTEMPT_RETURN_ERROR_FIRESTORE_SETDOC_FAILED]");
      // Consider deleting the Auth user if Firestore profile creation fails to avoid orphaned auth accounts
      // await serverAuth.currentUser?.delete(); // Or use Admin SDK for this from a backend
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
  
  let serverAuth: Auth;
  let serverDb: Firestore;

  try {
    const { auth: sAuth, db: sDb } = initializeServerFirebase();
    serverAuth = sAuth;
    serverDb = sDb;
    console.log("[LOGIN_ACTION_SERVER_FIREBASE_INIT_SUCCESS] Server-side Firebase Auth and DB initialized for loginUser.");
  } catch (initError: any) {
    console.error("[LOGIN_ACTION_SERVER_FIREBASE_INIT_FAILURE]", initError.message);
    return {
      success: false,
      error: "Critical server error: Firebase services could not be initialized. Please contact support.",
      errorCode: 'SERVER_FIREBASE_INIT_FAILURE'
    };
  }

  try {
    const validatedValues = LoginInputSchema.parse(values);
    console.log("[LOGIN_ACTION_VALIDATION_PASSED] Input validation passed for email:", validatedValues.email);

    let userCredential;
    try {
      console.log("[LOGIN_ACTION_SIGNIN_START] Attempting to sign in user with Firebase Auth for email:", validatedValues.email);
      userCredential = await signInWithEmailAndPassword(
        serverAuth, // Use server-initialized auth
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
    const userProfileDocRef = doc(serverDb, "users", userId); // Use server-initialized db

    let userProfile: UserProfile;
    try {
      console.log("[LOGIN_ACTION_FIRESTORE_GETDOC_START] Attempting to fetch profile from Firestore for UID:", userId);
      const userProfileSnap = await getDoc(userProfileDocRef);

      if (!userProfileSnap.exists()) {
        console.error(`[LOGIN_PROFILE_NOT_FOUND] User profile not found for UID: ${userId} in loginUser.`);
        console.log("[LOGIN_ACTION_ATTEMPT_RETURN_SUCCESS_NO_PROFILE_PROFILE_NOT_FOUND]");
        return { success: true, userId, userProfile: null, errorCode: "auth/profile-not-found" };
      }

      const rawProfileData = userProfileSnap.data();
      if (!rawProfileData) {
        console.error(`[LOGIN_PROFILE_DATA_MISSING] User profile data is unexpectedly null/undefined for UID: ${userId}.`);
        return { success: true, userId, userProfile: null, errorCode: "auth/profile-data-missing" };
      }

      userProfile = {
        id: userId,
        email: userCredential.user.email!,
        subscriptionTier: rawProfileData.subscriptionTier || 'free',
        lastPasswordChangeDate: (rawProfileData.lastPasswordChangeDate instanceof Timestamp
          ? rawProfileData.lastPasswordChangeDate.toDate().toISOString()
          : typeof rawProfileData.lastPasswordChangeDate === 'string'
            ? rawProfileData.lastPasswordChangeDate
            : new Date(0).toISOString()),
        lastLoggedInDate: (rawProfileData.lastLoggedInDate instanceof Timestamp
          ? rawProfileData.lastLoggedInDate.toDate().toISOString()
          : typeof rawProfileData.lastLoggedInDate === 'string'
            ? rawProfileData.lastLoggedInDate
            : undefined),
        acceptedLatestTerms: !!rawProfileData.acceptedLatestTerms,
        termsVersionAccepted: typeof rawProfileData.termsVersionAccepted === 'string' ? rawProfileData.termsVersionAccepted : undefined,
        isAgeCertified: !!rawProfileData.isAgeCertified,
        profileSetupComplete: typeof rawProfileData.profileSetupComplete === 'boolean' ? rawProfileData.profileSetupComplete : false,
        firstName: typeof rawProfileData.firstName === 'string' ? rawProfileData.firstName : undefined,
        middleInitial: typeof rawProfileData.middleInitial === 'string' ? rawProfileData.middleInitial : undefined,
        lastName: typeof rawProfileData.lastName === 'string' ? rawProfileData.lastName : undefined,
        dateOfBirth: (rawProfileData.dateOfBirth instanceof Timestamp
          ? rawProfileData.dateOfBirth.toDate().toISOString()
          : typeof rawProfileData.dateOfBirth === 'string'
            ? rawProfileData.dateOfBirth
            : undefined),
        cellPhone: typeof rawProfileData.cellPhone === 'string' ? rawProfileData.cellPhone : undefined,
        connectedFitnessApps: Array.isArray(rawProfileData.connectedFitnessApps) ? rawProfileData.connectedFitnessApps : [],
        connectedDiagnosticsServices: Array.isArray(rawProfileData.connectedDiagnosticsServices) ? rawProfileData.connectedDiagnosticsServices : [],
        connectedInsuranceProviders: Array.isArray(rawProfileData.connectedInsuranceProviders) ? rawProfileData.connectedInsuranceProviders : [],
        fitbitApiCallStats: typeof rawProfileData.fitbitApiCallStats === 'object' && rawProfileData.fitbitApiCallStats !== null ? rawProfileData.fitbitApiCallStats as FitbitApiCallStats : undefined,
        stravaApiCallStats: typeof rawProfileData.stravaApiCallStats === 'object' && rawProfileData.stravaApiCallStats !== null ? rawProfileData.stravaApiCallStats as StravaApiCallStats : undefined,
        googleFitApiCallStats: typeof rawProfileData.googleFitApiCallStats === 'object' && rawProfileData.googleFitApiCallStats !== null ? rawProfileData.googleFitApiCallStats as GoogleFitApiCallStats : undefined,
        withingsApiCallStats: typeof rawProfileData.withingsApiCallStats === 'object' && rawProfileData.withingsApiCallStats !== null ? rawProfileData.withingsApiCallStats as WithingsApiCallStats : undefined,
        fitbitLastSuccessfulSync: typeof rawProfileData.fitbitLastSuccessfulSync === 'string' ? rawProfileData.fitbitLastSuccessfulSync : undefined,
        stravaLastSyncTimestamp: typeof rawProfileData.stravaLastSyncTimestamp === 'number' ? rawProfileData.stravaLastSyncTimestamp : undefined,
        googleFitLastSuccessfulSync: typeof rawProfileData.googleFitLastSuccessfulSync === 'string' ? rawProfileData.googleFitLastSuccessfulSync : undefined,
        withingsLastSuccessfulSync: typeof rawProfileData.withingsLastSuccessfulSync === 'string' ? rawProfileData.withingsLastSuccessfulSync : undefined,
        withingsUserId: typeof rawProfileData.withingsUserId === 'string' ? rawProfileData.withingsUserId : undefined,
        walkingRadarGoals: typeof rawProfileData.walkingRadarGoals === 'object' && rawProfileData.walkingRadarGoals !== null ? rawProfileData.walkingRadarGoals as WalkingRadarGoals : undefined,
        runningRadarGoals: typeof rawProfileData.runningRadarGoals === 'object' && rawProfileData.runningRadarGoals !== null ? rawProfileData.runningRadarGoals as RunningRadarGoals : undefined,
        hikingRadarGoals: typeof rawProfileData.hikingRadarGoals === 'object' && rawProfileData.hikingRadarGoals !== null ? rawProfileData.hikingRadarGoals as HikingRadarGoals : undefined,
        swimmingRadarGoals: typeof rawProfileData.swimmingRadarGoals === 'object' && rawProfileData.swimmingRadarGoals !== null ? rawProfileData.swimmingRadarGoals as SwimmingRadarGoals : undefined,
        sleepRadarGoals: typeof rawProfileData.sleepRadarGoals === 'object' && rawProfileData.sleepRadarGoals !== null ? rawProfileData.sleepRadarGoals as SleepRadarGoals : undefined,
        dashboardRadarMetrics: Array.isArray(rawProfileData.dashboardRadarMetrics) ? rawProfileData.dashboardRadarMetrics as DashboardMetricIdValue[] : undefined,
        passwordResetCodeAttempt: typeof rawProfileData.passwordResetCodeAttempt === 'object' && rawProfileData.passwordResetCodeAttempt !== null ? rawProfileData.passwordResetCodeAttempt as { code: string; expiresAt: string; } : undefined,
      };

      console.log("[LOGIN_ACTION_FIRESTORE_GETDOC_SUCCESS] Profile constructed for UID:", userId);
    } catch (firestoreError: any) {
      console.error("[LOGIN_FIRESTORE_ERROR] Error fetching/constructing user profile from Firestore for UID:", userId, "Raw Error:", firestoreError);
      const errorMessage = String(firestoreError.message || 'Database error during profile fetching.');
      const errorCode = String(firestoreError.code || 'FIRESTORE_ERROR');
      console.error(`[LOGIN_FIRESTORE_ERROR_DETAILS] Code: ${errorCode}, Message: ${errorMessage}`);
      console.log("[LOGIN_ACTION_ATTEMPT_RETURN_SUCCESS_NO_PROFILE_FIRESTORE_ERROR]");
      return { success: true, userId, userProfile: null, error: `Login succeeded but profile fetch failed: ${errorMessage}.`, errorCode };
    }

    const currentLoginTimeISO = new Date().toISOString();
    try {
      await updateDoc(userProfileDocRef, { lastLoggedInDate: currentLoginTimeISO });
      console.log("[LOGIN_ACTION_FIRESTORE_UPDATE_SUCCESS] lastLoggedInDate updated in Firestore for UID:", userId);
      userProfile.lastLoggedInDate = currentLoginTimeISO;
    } catch (dbError: any) {
      console.error("[LOGIN_ACTION_FIRESTORE_ERROR] Failed to update lastLoggedInDate for UID:", userId, "Error:", dbError);
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
  let serverDb: Firestore;
  try {
    const { db: sDb } = initializeServerFirebase(); // Auth not needed here, only DB
    serverDb = sDb;
    const validatedValues = ForgotPasswordEmailSchema.parse(values);
    console.log("[SEND_RESET_CODE_VALIDATED] Email validated by Zod:", validatedValues.email);

    const usersRef = collection(serverDb, "users");
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

    await updateDoc(doc(serverDb, "users", userIdForReset), {
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
    // Return a generic success message for security, even if an error occurred, to prevent email enumeration.
    return { success: true, message: "If an account with that email exists, we've sent instructions to reset your password. (Error occurred, simulated success for security)"};
  }
}

export async function verifyPasswordResetCode(values: z.infer<typeof VerifyResetCodeSchema>): Promise<ForgotPasswordResult> {
  console.log("[VERIFY_RESET_CODE_START] Action initiated for email:", values.email, "with code (first 2 chars):", values.code.substring(0,2));
  let serverDb: Firestore;
  try {
    const { db: sDb } = initializeServerFirebase();
    serverDb = sDb;
    const validatedValues = VerifyResetCodeSchema.parse(values);

    const usersRef = collection(serverDb, "users");
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
      await updateDoc(doc(serverDb, "users", userDocSnap.id), { passwordResetCodeAttempt: null });
      return { success: false, error: "Password reset code has expired. Please request a new one.", errorCode: 'RESET_CODE_EXPIRED' };
    }
    if (userProfile.passwordResetCodeAttempt.code !== validatedValues.code) {
      return { success: false, error: "Invalid verification code.", errorCode: 'RESET_CODE_INVALID' };
    }

    await updateDoc(doc(serverDb, "users", userDocSnap.id), { passwordResetCodeAttempt: null });
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
  let serverAuth: Auth;
  let serverDb: Firestore;
  try {
    const { auth: sAuth, db: sDb } = initializeServerFirebase();
    serverAuth = sAuth;
    serverDb = sDb;
    const validatedValues = FinalResetPasswordSchema.parse(values);

    const currentUser = serverAuth.currentUser; // Check current user on server-side auth instance

    if (currentUser && currentUser.email === validatedValues.email) {
      console.log("[RESET_PASSWORD_LOGGED_IN_USER] Attempting password update for logged-in user on server instance:", currentUser.uid);
      await firebaseUpdatePassword(currentUser, validatedValues.newPassword);
      console.log("[RESET_PASSWORD_LOGGED_IN_USER_SUCCESS] Password updated via Firebase Auth for:", currentUser.uid);
      try {
        console.log("[RESET_PASSWORD_LOGGED_IN_USER_FIRESTORE_UPDATE_START] Updating lastPasswordChangeDate in Firestore for:", currentUser.uid);
        await updateDoc(doc(serverDb, "users", currentUser.uid), { lastPasswordChangeDate: new Date().toISOString() });
        console.log("[RESET_PASSWORD_LOGGED_IN_USER_FIRESTORE_UPDATE_SUCCESS] lastPasswordChangeDate updated for:", currentUser.uid);
      } catch (dbError: any) {
        console.error("[RESET_PASSWORD_LOGGED_IN_USER_FIRESTORE_ERROR] Failed to update lastPasswordChangeDate for UID:", currentUser.uid, "Error:", dbError);
      }
      return { success: true, message: "Password has been reset successfully." };
    }

    console.log("[RESET_PASSWORD_UNAUTH_FLOW_INITIATED] Unauthenticated password reset initiated for email:", validatedValues.email);
    const usersRef = collection(serverDb, "users");
    const q = query(usersRef, where("email", "==", validatedValues.email));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        console.error("[RESET_PASSWORD_UNAUTH_USER_NOT_FOUND] User with email not found in Firestore for unauth reset:", validatedValues.email);
        return { success: false, error: "User not found or password reset process invalid.", errorCode: 'USER_NOT_FOUND_FOR_RESET' };
    }
    const userDocSnap = querySnapshot.docs[0];
    const userIdToReset = userDocSnap.id;

    console.warn(`[RESET_PASSWORD_ADMIN_SDK_REQUIRED] To reset password for unauthenticated user ${userIdToReset} via email link flow, Firebase Admin SDK (or verifying the oobCode client-side then calling applyPasswordReset) is typically used. Simulating update via server action for now.`);
    // This part is tricky without Admin SDK. Ideally, for an oobCode flow, you'd verify the code
    // then update. Since we have a custom code, we're assuming it was verified by verifyPasswordResetCode.
    // The Firebase client SDK's updatePassword requires the user to be signed in.
    // For a true "forgot password" where user is not signed in, Admin SDK `updateUser` is needed.
    // This simplified version will just update the Firestore date, implying an Admin SDK call would happen.
    console.log(`[RESET_PASSWORD_SIMULATE_ADMIN_SUCCESS] Simulating successful password reset for ${userIdToReset} via Admin SDK (not actually changing auth password here).`);

    try {
      console.log("[RESET_PASSWORD_UNAUTH_FIRESTORE_UPDATE_START] Updating lastPasswordChangeDate in Firestore for:", userIdToReset);
      await updateDoc(doc(serverDb, "users", userIdToReset), {
        lastPasswordChangeDate: new Date().toISOString(),
        // It's crucial that the actual password change happens via Firebase Auth (Admin SDK for this flow)
        // For this simulation, we're just updating the date.
      });
      console.log("[RESET_PASSWORD_UNAUTH_FIRESTORE_UPDATE_SUCCESS] lastPasswordChangeDate updated for:", userIdToReset);
      return { success: true, message: "Password has been reset successfully. (Simulated Admin SDK: actual auth password not changed by this action in unauth flow without Admin SDK)" };
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
    let serverDb: Firestore;
    try {
      const { db: sDb } = initializeServerFirebase();
      serverDb = sDb;
      const validatedValues = DemographicsSchemaServer.parse(values);
      console.log("[UPDATE_DEMOGRAPHICS_VALIDATION_PASSED] Server-side validation passed for UID:", userId);

      const profileUpdateData: Partial<UserProfile> = {
          firstName: validatedValues.firstName,
          middleInitial: validatedValues.middleInitial,
          lastName: validatedValues.lastName,
          dateOfBirth: validatedValues.dateOfBirth,
          cellPhone: validatedValues.cellPhone,
          isAgeCertified: validatedValues.isAgeCertified,
      };
      console.log("[UPDATE_DEMOGRAPHICS_FIRESTORE_UPDATE_START] Attempting to update Firestore for UID:", userId);
      await updateDoc(doc(serverDb, "users", userId), profileUpdateData);
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
    let serverDb: Firestore;
    try {
        const { db: sDb } = initializeServerFirebase();
        serverDb = sDb;
        console.log("[UPDATE_TERMS_FIRESTORE_UPDATE_START] Attempting to update Firestore for UID:", userId);
        await updateDoc(doc(serverDb, "users", userId), { acceptedLatestTerms: accepted, termsVersionAccepted: version });
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
    let serverDb: Firestore;
    try {
        const { db: sDb } = initializeServerFirebase();
        serverDb = sDb;
        const userProfileDocRef = doc(serverDb, "users", userId);
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
    let serverDb: Firestore;
    try {
        const { db: sDb } = initializeServerFirebase();
        serverDb = sDb;
        const userProfileDocRef = doc(serverDb, "users", userId);
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
    let serverDb: Firestore;
     try {
        const { db: sDb } = initializeServerFirebase();
        serverDb = sDb;
        const userProfileDocRef = doc(serverDb, "users", userId);
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
    let serverDb: Firestore;
    try {
        const { db: sDb } = initializeServerFirebase();
        serverDb = sDb;
        const userProfileDocRef = doc(serverDb, "users", userId);
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
        return { success: true, data: { withingsUserId: withingsApiUserId } };
    } catch (error: any) {
        console.error("[FINALIZE_WITHINGS_RAW_ERROR] Raw error finalizing Withings connection for UID:", userId, "Error:", error);
        const errorMessage = String(error.message || "Failed to finalize Withings connection.");
        const errorCode = String(error.code || 'UNEXPECTED_ERROR');
        return { success: false, error: errorMessage, errorCode: errorCode};
    }
}
    
    
