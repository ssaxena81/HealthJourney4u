
'use client';

import React, { useState, useEffect, createContext, useContext, useMemo, useCallback } from 'react';
import { onAuthStateChanged, type User as FirebaseUser, signOut } from 'firebase/auth';
import { auth as firebaseAuthInstance, db } from '@/lib/firebase/clientApp';
import type { UserProfile, AppAuthStateCookie } from '@/types';
import { doc, getDoc } from 'firebase/firestore';
import { setCookie, eraseCookie } from '@/lib/cookie-utils';

interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
  setUserProfile?: (profileUpdater: (prev: UserProfile | null) => UserProfile | null) => void;
  checkAuthState?: () => Promise<void>; // Kept for potential explicit refresh elsewhere, but not primary for login
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const initialLogTimestamp = useMemo(() => new Date().toISOString(), []);
  console.log(`[AuthProvider BODY START @ ${initialLogTimestamp}]`);

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true); // Initialize to true

  console.log(`  [AuthProvider State Init @ ${new Date().toISOString()}] User: ${user?.uid || 'null'}, Loading: ${loading}. firebaseAuthInstance: ${!!firebaseAuthInstance}`);

  const fetchUserProfile = useCallback(async (fbUser: FirebaseUser): Promise<UserProfile | null> => {
    const fetchProfileTimestamp = new Date().toISOString();
    console.log(`    [AuthProvider fetchUserProfile @ ${fetchProfileTimestamp}] Called for UID: ${fbUser.uid}. DB available: ${!!db}`);
    if (!db) {
      console.error("    [AuthProvider fetchUserProfile] Firestore 'db' instance is not available.");
      setLoading(false); // Ensure loading is false if db is not available
      return null;
    }
    try {
      const profileSnap = await getDoc(doc(db, "users", fbUser.uid));
      if (profileSnap.exists()) {
        const profileData = profileSnap.data() as UserProfile;
        console.log(`    [AuthProvider fetchUserProfile @ ${fetchProfileTimestamp}] Profile fetched for ${fbUser.uid}. Profile Data:`, profileData);
        return profileData;
      } else {
        console.warn(`    [AuthProvider fetchUserProfile @ ${fetchProfileTimestamp}] No profile found for ${fbUser.uid}.`);
        return null;
      }
    } catch (e: any) {
      console.error(`    [AuthProvider fetchUserProfile @ ${fetchProfileTimestamp}] Error fetching profile for ${fbUser.uid}:`, e.message, e.stack);
      return null;
    }
  }, []);

  const processUserSession = useCallback(async (fbUser: FirebaseUser | null, source: string) => {
    const processTime = new Date().toISOString();
    console.log(`  [AuthProvider processUserSession FROM ${source} @ ${processTime}] START. Received fbUser UID: ${fbUser?.uid || 'null'}.`);
    
    let newFirebaseUser: FirebaseUser | null = null;
    let newProfile: UserProfile | null = null;

    if (fbUser) {
      console.log(`    [AuthProvider processUserSession @ ${processTime}] fbUser IS PRESENT (UID: ${fbUser.uid}). Attempting to fetch profile.`);
      newFirebaseUser = fbUser;
      newProfile = await fetchUserProfile(fbUser);
      console.log(`    [AuthProvider processUserSession @ ${processTime}] fetchUserProfile completed for UID: ${fbUser.uid}. Profile ${newProfile ? 'found' : 'NOT found'}.`);
    } else {
      console.log(`    [AuthProvider processUserSession @ ${processTime}] fbUser IS NULL.`);
    }

    setUser(newFirebaseUser);
    setUserProfileState(newProfile);
    console.log(`    [AuthProvider processUserSession @ ${processTime}] setUser and setUserProfileState called. Context User: ${newFirebaseUser?.uid || 'null'}, Context Profile: ${newProfile?.id || 'null'}`);

    if (newFirebaseUser && newProfile) {
      const cookieStateToSet: AppAuthStateCookie = {
          isProfileCreated: !!newProfile.profileSetupComplete,
          authSyncComplete: true
      };
      console.log(`    [AuthProvider processUserSession @ ${processTime}] Attempting to set app_auth_state cookie for UID: ${newFirebaseUser.uid} with state:`, cookieStateToSet);
      setCookie('app_auth_state', JSON.stringify(cookieStateToSet), 1);
      console.log(`    [AuthProvider processUserSession @ ${processTime}] app_auth_state cookie SET for user ${newFirebaseUser.uid}.`);
    } else {
      console.log(`    [AuthProvider processUserSession @ ${processTime}] No user or profile. Attempting to erase app_auth_state cookie.`);
      eraseCookie('app_auth_state');
      console.log(`    [AuthProvider processUserSession @ ${processTime}] app_auth_state cookie ERASED.`);
    }
    
    console.log(`  [AuthProvider processUserSession FROM ${source} @ ${new Date().toISOString()}] END. Setting loading to FALSE.`);
    setLoading(false);
  }, [fetchUserProfile]);

  useEffect(() => {
    const effectExecutionTime = new Date().toISOString();
    console.log(`[AuthProvider useEffect for onAuthStateChanged @ ${effectExecutionTime}] EXECUTING EFFECT.`);
    let isMounted = true;

    if (!firebaseAuthInstance) {
      console.warn(`  [AuthProvider useEffect @ ${effectExecutionTime}] Firebase Auth instance not available. Aborting onAuthStateChanged setup.`);
      if (isMounted) {
        processUserSession(null, 'useEffect-NoAuthInstance');
      }
      return;
    }
    
    console.log(`  [AuthProvider useEffect @ ${effectExecutionTime}] firebaseAuthInstance is available. setLoading(true) and subscribing to onAuthStateChanged...`);
    setLoading(true); // Set loading true when starting to listen

    const unsubscribe = onAuthStateChanged(firebaseAuthInstance, async (fbUser) => {
      const callbackTime = new Date().toISOString();
      if (!isMounted) {
        console.log(`  [AuthProvider onAuthStateChanged CALLBACK @ ${callbackTime}] Listener FIRED but component unmounted. Aborting.`);
        return;
      }
      console.log(`  [AuthProvider onAuthStateChanged CALLBACK @ ${callbackTime}] Listener FIRED. fbUser UID: ${fbUser?.uid || 'null'}. Calling processUserSession.`);
      await processUserSession(fbUser, 'onAuthStateChanged');
    });
    console.log(`  [AuthProvider useEffect @ ${effectExecutionTime}] onAuthStateChanged Listener SUBSCRIBED.`);

    return () => {
      isMounted = false;
      const cleanupTime = new Date().toISOString();
      console.log(`[AuthProvider useEffect for onAuthStateChanged @ ${cleanupTime}] CLEANING UP. Unsubscribing.`);
      unsubscribe();
    };
  }, [processUserSession]);

  const contextLogout = useCallback(async () => {
    const logoutStartTime = new Date().toISOString();
    console.log(`[AuthProvider contextLogout @ ${logoutStartTime}] Called.`);
    setLoading(true);
    console.log(`  [AuthProvider contextLogout @ ${logoutStartTime}] setLoading(true) called.`);
    eraseCookie('app_auth_state');
    if (firebaseAuthInstance) {
      try {
        await signOut(firebaseAuthInstance);
        console.log(`  [AuthProvider contextLogout @ ${new Date().toISOString()}] signOut successful. onAuthStateChanged will handle subsequent state updates and set loading to false.`);
        // onAuthStateChanged will call processUserSession(null, ...) which sets loading to false
      } catch (error) {
        console.error("  [AuthProvider contextLogout] Error signing out:", error);
        await processUserSession(null, 'logoutError'); // Ensure loading is set to false
      }
    } else {
      console.error("  [AuthProvider contextLogout] Firebase Auth instance not available.");
      await processUserSession(null, 'logoutNoAuthInstance'); // Ensure loading is set to false
    }
  }, [processUserSession]);

  const contextSetUserProfile = useCallback((updater: (prev: UserProfile | null) => UserProfile | null) => {
    const setProfileTime = new Date().toISOString();
    console.log(`[AuthProvider contextSetUserProfile @ ${setProfileTime}] Manually updating profile in context via updater fn.`);
    setUserProfileState(prevUserProfile => {
        const newProfile = updater(prevUserProfile);
        if (user && newProfile) {
             const cookieStateToSet: AppAuthStateCookie = {
                isProfileCreated: !!newProfile.profileSetupComplete,
                authSyncComplete: true
            };
            console.log(`    [AuthProvider contextSetUserProfile @ ${setProfileTime}] Setting app_auth_state cookie with new profile state:`, cookieStateToSet);
            setCookie('app_auth_state', JSON.stringify(cookieStateToSet), 1);
        } else if (!user) {
             console.log(`    [AuthProvider contextSetUserProfile @ ${setProfileTime}] User not logged in, erasing app_auth_state cookie.`);
            eraseCookie('app_auth_state');
        }
        return newProfile;
    });
  }, [user]);

  const checkAuthState = useCallback(async () => {
    const checkAuthStartTime = new Date().toISOString();
    console.log(`[AuthProvider checkAuthState @ ${checkAuthStartTime}] Manually re-checking auth state...`);
    setLoading(true);
    console.log(`  [AuthProvider checkAuthState @ ${checkAuthStartTime}] setLoading(true) called.`);

    if (!firebaseAuthInstance) {
      console.warn(`  [AuthProvider checkAuthState @ ${checkAuthStartTime}] Firebase Auth instance not available during manual check.`);
      await processUserSession(null, 'checkAuthState-NoAuthInstance');
      return;
    }
    
    const currentFbUser = firebaseAuthInstance.currentUser;
    console.log(`  [AuthProvider checkAuthState @ ${checkAuthStartTime}] firebaseAuthInstance.currentUser UID: ${currentFbUser?.uid || 'null'}. Calling processUserSession.`);
    await processUserSession(currentFbUser, 'checkAuthState');
    console.log(`[AuthProvider checkAuthState @ ${new Date().toISOString()}] Manual re-check completed.`);
  }, [processUserSession]);

  const contextValue = useMemo(() => ({
    user,
    userProfile,
    loading,
    logout: contextLogout,
    setUserProfile: contextSetUserProfile,
    checkAuthState,
  }), [user, userProfile, loading, contextLogout, contextSetUserProfile, checkAuthState]);

  const renderLogTimestamp = useMemo(() => new Date().toISOString(), [user, userProfile, loading]);
  console.log(`[AuthProvider RENDER/Memo @ ${renderLogTimestamp}] Context: User UID: ${contextValue.user?.uid || 'null'}, Loading: ${contextValue.loading}, Profile ID: ${contextValue.userProfile?.id || 'null'}`);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
    